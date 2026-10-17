// 会议录音 → 转写 → AI 整理纪要 → 人工确认 → 成果保存（需求 四）。
// 录音默认按「机密」管理：转写只在本机（faster-whisper），纪要整理按密级路由（仅本地模型或离线引擎）。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { complete, parseJson } from './llm.mjs'

const fail = (m, status = 400) => Object.assign(new Error(m), { status })
const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'asr_worker.py')
const RUNTIME = process.env.INVESTAI_RUNTIME ?? join(homedir(), '.dsh', 'investai-runtime')
export const AUDIO = ['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.webm', '.aiff', '.flac', '.mp4']

export function asrRuntime(settings) {
  const python = settings?.asr?.python || join(RUNTIME, 'asr-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const model = settings?.asr?.model || join(RUNTIME, 'models', 'faster-whisper-small')
  return { python, model, ready: existsSync(python) && existsSync(join(model, 'model.bin')) }
}

// 中文数字日期：十月二十五日 / 10月25日 / 下周 / 本周
const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
function cnNum(s) {
  if (/^\d+$/.test(s)) return Number(s)
  if (s === '十') return 10
  if (s.startsWith('十')) return 10 + (CN[s[1]] ?? 0)
  if (s.includes('十')) { const [a, b] = s.split('十'); return (CN[a] ?? 1) * 10 + (CN[b] ?? 0) }
  return CN[s] ?? null
}
export function parseDue(text, base = Date.now()) {
  const m = text.match(/([0-9一二三四五六七八九十]{1,3})月([0-9一二三四五六七八九十]{1,3})[日号]/)
  if (m) { const d = new Date(base); const mo = cnNum(m[1]); const da = cnNum(m[2]); if (mo && da) { const t = new Date(d.getFullYear(), mo - 1, da, 18); if (t.getTime() < base - 30 * 864e5) t.setFullYear(t.getFullYear() + 1); return t.getTime() } }
  if (/下周/.test(text)) return base + 7 * 864e5
  if (/本周|这周/.test(text)) { const d = new Date(base); return base + Math.max(1, 5 - d.getDay()) * 864e5 }
  if (/明天/.test(text)) return base + 864e5
  return null
}

/** 术语纠错：只处理 ≥3 字的专有名词（公司名、项目名），相差 1 个字的片段替换为正确写法，并记录。 */
export function correctTerms(text, terms) {
  const corrections = []
  let out = text
  for (const term of [...new Set(terms)].filter(t => t && t.length >= 3).sort((a, b) => b.length - a.length)) {
    if (out.includes(term)) continue
    const L = term.length
    for (let i = 0; i + L <= out.length; i++) {
      const frag = out.slice(i, i + L)
      if (/[\s，。,.]/.test(frag)) continue
      let diff = 0
      for (let k = 0; k < L && diff < 2; k++) if (frag[k] !== term[k]) diff++
      if (diff === 1 && frag[0] === term[0]) { corrections.push({ from: frag, to: term }); out = out.slice(0, i) + term + out.slice(i + L); i += L - 1 }
    }
  }
  return { text: out, corrections }
}

export function createMeetings({ db, kb, org, ai, deliverables, notify, lifecycle }) {
  const meta = (user, reason, action) => ({ actor: user, reason, action })
  const get = (user, id) => {
    const m = db.get('meetings', id)
    if (!m) throw fail('会议不存在', 404)
    org.assertProject(user, db.get('projects', m.projectId))
    return m
  }

  function create(user, { projectId, title, kind = '项目会议', at, attendees = [], approvalId }) {
    org.assert(user, 'meeting.manage')
    const p = db.get('projects', projectId)
    org.assertProject(user, p)
    if (!String(title ?? '').trim()) throw fail('会议名称必填')
    return db.put('meetings', { projectId, title: String(title).slice(0, 80), kind, at: Number(at) || Date.now(), attendees: [...new Set([user.id, ...attendees])], approvalId: approvalId ?? null, recordings: [], status: 'draft', decisions: [], todos: [] }, meta(user, `新建会议「${title}」`, 'create'))
  }

  async function upload(user, id, name, buf) {
    const m = get(user, id)
    org.assert(user, 'meeting.manage')
    const ext = (name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase()
    if (!AUDIO.includes(ext)) throw fail(`不支持的录音格式：${ext || '未知'}（支持 ${AUDIO.join(' ')}）`)
    if (buf.length > 200 * 1024 * 1024) throw fail('录音文件不超过 200 MB', 413)
    const p = db.get('projects', m.projectId)
    const short = (p.companyId && db.get('companies', p.companyId)?.short) || p.name
    const f = await kb.upload('m_up', name, buf, { level: 2, by: user.name, subdir: `会议录音/${short}` })
    return db.put('meetings', { ...m, recordings: [...m.recordings, { fileId: f.id, name: f.name, size: f.size, at: Date.now() }] }, meta(user, `上传录音 ${f.name}`, 'upload'))
  }

  /** 转写（本机）+ 自动整理纪要草稿。返回任务，前端轮询。 */
  function transcribe(user, id, fileId) {
    const m = get(user, id)
    org.assert(user, 'meeting.manage')
    let rec = m.recordings.find(r => r.fileId === fileId) ?? (fileId ? null : m.recordings.at(-1))
    if (!rec && fileId) {
      // 关联资料库中已有的录音文件
      const f = kb.file(fileId)
      if (!f || !kb.visible(user, f) || !AUDIO.includes(f.ext)) throw fail('录音文件不存在或无权访问', 404)
      rec = { fileId: f.id, name: f.name, size: f.size, at: Date.now() }
      db.put('meetings', { ...m, recordings: [...m.recordings, rec] }, meta(user, `关联录音 ${f.name}`, 'upload'))
    }
    if (!rec) throw fail('请先上传录音')
    const rt = asrRuntime(db.get('settings', 'main'))
    if (!rt.ready) throw fail('本机转写引擎未就绪：需要 faster-whisper 环境与模型（系统设置 → 会议转写）', 409)
    const job = ai.newJob(user, 'asr', { title: `转写 · ${m.title}`, meetingId: id, projectId: m.projectId, engine: 'Whisper small（本机）', silent: true })
    void (async () => {
      try {
        const p = db.get('projects', m.projectId)
        const c = p.companyId ? db.get('companies', p.companyId) : null
        const people = m.attendees.map(u => db.get('users', u)?.name).filter(Boolean)
        const hot = [c?.short, c?.name, p.name.split(' ')[0], ...people, ...(p.tags ?? []), '尽调', '立项', '投委会', '估值', '回款', '复核'].filter(Boolean)
        const terms = [...hot, '回款名单', '收入确认', '海外认证', '影响评估', '尽调报告', '审计报告', '前员工', '业绩承诺', '对赌条款']
        job.phase = 'transcribing'
        const path = await kb.pathOf(rec.fileId)
        const out = await runWorker(rt, path, hot.join(' '), job)
        if (!out.ok) throw new Error(out.error)
        const joined = out.segments.map(s => s.text).join('\n')
        const fixed = correctTerms(joined, terms)
        const lines = fixed.text.split('\n')
        const segments = out.segments.map((s, i) => ({ ...s, text: lines[i] ?? s.text }))
        db.put('meetings', { ...db.get('meetings', id), asr: { fileId: rec.fileId, engine: 'faster-whisper small（本机）', duration: out.duration, elapsed: out.elapsed, segments, corrections: fixed.corrections, at: Date.now() } }, meta(user, `转写完成（${out.duration}s 录音）`, 'asr'))
        job.phase = 'generating'
        ai.record(job)
        const draft = await minutes(user, id, job)
        ai.finish(job, { status: 'done', phase: 'review', text: draft.minutes, corrections: fixed.corrections })
      } catch (e) { ai.finish(job, { status: 'failed', phase: 'failed', error: e.message }) }
    })()
    return job
  }

  function runWorker(rt, path, hotwords, job) {
    return new Promise((resolve, reject) => {
      const child = spawn(rt.python, ['-I', WORKER, path, rt.model, 'zh', hotwords], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { const m = String(d).match(/"progress":\s*([\d.]+)/); if (m && job) { job.progress = Number(m[1]); ai.record(job) } })
      job?.abort.signal.addEventListener('abort', () => child.kill())
      child.on('error', reject)
      child.on('close', () => { try { resolve(JSON.parse(out.trim().split('\n').at(-1))) } catch { reject(new Error(`转写进程输出无法解析：${out.slice(0, 200)}`)) } })
    })
  }

  /** 纪要草稿：决定事项、待办（责任人只从参会人中匹配，匹配不到留空待指定）、待核实事项。 */
  async function minutes(user, id, job) {
    const m = db.get('meetings', id)
    const text = (m.asr?.segments ?? []).map(s => s.text).join('\n')
    if (!text) throw fail('还没有转写内容')
    const people = m.attendees.map(u => db.get('users', u)).filter(Boolean)
    const route = await ai.route(2)
    let result = null
    if (route.adapter) {
      try {
        const out = parseJson(await complete(route.adapter, { system: '你是会议纪要助手，只输出 JSON。责任人只能从参会人名单中选择，无法确定时 owner 为 null，不要猜测。', user: `参会人：${people.map(u => u.name).join('、')}\n输出 JSON：{"summary":["讨论要点"],"decisions":["决定事项"],"todos":[{"text":"","owner":"姓名或null","due":"原文中的期限或null"}],"pending":["待核实"]}\n\n转写：\n${text}`, maxTokens: 2000, signal: job?.abort?.signal ?? AbortSignal.timeout(120000) }))
        if (out) result = { ...out, engine: route.label }
      } catch { /* 回落到规则 */ }
    }
    if (!result) {
      // 转写常无标点：按句读与空格切分，「会议决定」后一句即决定内容
      const MARK = /^(?:会议)?(?:决定|同意|确定)/
      const raw = []
      for (const sent of text.split(/[。；！？\n]+|[，,](?=[\u4e00-\u9fa5]{2,3}(?:负责|需要))/)) {
        for (const tok of sent.split(/\s+/).map(x => x.trim()).filter(Boolean)) {
          // 转写在停顿处插入空格：过短的片段并回上一句（「会议决定」等标记除外）
          const prev = raw.at(-1)
          if (prev && tok.length < 6 && !MARK.test(tok) && !MARK.test(prev) && !people.some(u => tok.startsWith(u.name))) raw[raw.length - 1] = prev + tok
          else raw.push(tok)
        }
      }
      const decisions = []
      const sents = []
      for (let k = 0; k < raw.length; k++) {
        if (/^(?:会议)?(?:决定|同意|确定)[:：]?$/.test(raw[k]) && raw[k + 1]) { decisions.push(raw[++k]); continue }
        const dm = raw[k].match(/^(?:会议)?(?:决定|同意|确定)[:：，,]?(.{4,})$/)
        if (dm) { decisions.push(dm[1]); continue }
        if (raw[k].length >= 4) sents.push(raw[k])
      }
      result = {
        engine: `规则整理（${route.reason}）`,
        summary: sents.filter(s => !/负责|需要|^请/.test(s)).slice(0, 6),
        decisions,
        todos: sents.filter(s => /负责|需要|请|完成/.test(s) && !/^会议决定/.test(s)).map(s => ({ text: s, owner: null, due: s })),
        pending: sents.filter(s => /核查|核实|评估|诉讼/.test(s)),
      }
    }
    const todos = (result.todos ?? []).map(t => {
      const owner = people.find(u => (t.owner && u.name === t.owner) || t.text.includes(u.name))
      return { id: Math.random().toString(36).slice(2, 9), text: t.text, owner: owner?.id ?? null, due: parseDue(`${t.due ?? ''} ${t.text}`, m.at) }
    })
    const md = `## 会议信息\n- 会议：${m.title}（${m.kind}）\n- 时间：${new Date(m.at).toLocaleString('zh-CN')}\n- 参会人：${people.map(u => u.name).join('、')}\n- 记录方式：本机转写 + ${result.engine}，经人工确认\n\n## 讨论要点\n${(result.summary ?? []).map(s => `- ${s}`).join('\n') || '- 待补充'}\n\n## 决定事项\n${(result.decisions ?? []).map(s => `- ${s}`).join('\n') || '- 无'}\n\n## 待办事项\n| 事项 | 责任人 | 期限 |\n|---|---|---|\n${todos.map(t => `| ${t.text} | ${t.owner ? db.get('users', t.owner).name : '待指定'} | ${t.due ? new Date(t.due).toLocaleDateString('zh-CN') : '待定'} |`).join('\n')}\n\n## 待核实事项\n${(result.pending ?? []).map(s => `- ${s}`).join('\n') || '- 无'}`
    db.put('meetings', { ...db.get('meetings', id), minutes: md, decisions: result.decisions ?? [], todos, minutesEngine: result.engine, status: 'review' }, meta(user, '生成纪要草稿', 'minutes'))
    return { minutes: md, todos }
  }

  function update(user, id, { minutes: md, decisions, todos }) {
    const m = get(user, id)
    org.assert(user, 'meeting.manage')
    if (m.status === 'confirmed') throw fail('纪要已确认', 409)
    return db.put('meetings', { ...m, ...(md !== undefined ? { minutes: String(md).slice(0, 100000) } : {}), ...(decisions ? { decisions } : {}), ...(todos ? { todos } : {}) }, meta(user, '人工修改纪要', 'edit'))
  }

  /** 人工确认：生成正式纪要（Word，定稿）、创建待办任务、关联项目。 */
  /** 没有转写引擎、或会议没有录音时：粘贴文字稿（或会议记录），同样整理出纪要草稿。 */
  async function transcript(user, id, text) {
    const m = get(user, id)
    org.assert(user, 'meeting.manage')
    if (m.status === 'confirmed') throw fail('纪要已确认', 409)
    const body = String(text ?? '').trim().slice(0, 50000)
    if (body.length < 10) throw fail('文字稿太短')
    const segments = body.split(/\n+/).map(x => x.trim()).filter(Boolean).map((t, i) => ({ start: i, end: i + 1, text: t }))
    db.put('meetings', { ...m, asr: { fileId: null, engine: '人工文字稿', duration: 0, elapsed: 0, segments, corrections: [], at: Date.now() } }, meta(user, '录入文字稿', 'transcript'))
    return minutes(user, id)
  }

  async function confirm(user, id) {
    const m = get(user, id)
    org.assert(user, 'meeting.manage')
    if (!m.minutes) throw fail('还没有纪要内容')
    if (m.status === 'confirmed') throw fail('纪要已确认', 409)
    // 确认纪要 = 会议纪要成果定稿：先按定稿规则检查，失败时不写入任何东西
    lifecycle.authorize(user, { projectId: m.projectId, type: '会议纪要', status: 'review', versions: [{}] }, 'finalize')
    return confirmTx(user, m) // 含文件写入（异步），不能放进同步事务；前置检查已保证不会半途因权限失败
  }
  async function confirmTx(user, m) {
    const d = deliverables.ensure(m.projectId, '会议纪要', { format: 'docx', fresh: true, title: `${m.title} 会议纪要` }, user)
    await deliverables.addVersion(user, d, { markdown: m.minutes, engine: `会议记录 + ${m.minutesEngine ?? '人工'}`, note: '会议纪要人工确认' })
    db.put('deliverables', { ...db.get('deliverables', d.id), status: 'review' }, meta(user, '纪要提交确认', 'submit'))
    deliverables.finalize(user, d.id)
    const owners = m.todos.filter(t => t.owner)
    const created = owners.map(t => db.put('tasks', { title: t.text.slice(0, 80), projectId: m.projectId, owner: t.owner, due: t.due ?? Date.now() + 7 * 864e5, done: false, by: `会议：${m.title}` }, meta(user, '会议待办', 'create')).id)
    for (const uid of new Set(owners.map(t => t.owner))) void notify.notify([uid], { kind: 'task', title: `会议待办：${m.title}`, text: `你有 ${owners.filter(t => t.owner === uid).length} 项会议待办，请在 InvestAI 中查看。`, projectId: m.projectId })
    return db.put('meetings', { ...db.get('meetings', m.id), status: 'confirmed', confirmedBy: user.name, confirmedAt: Date.now(), deliverableId: d.id, taskIds: created }, meta(user, '纪要确认', 'confirm'))
  }


  return { create, upload, transcribe, transcript, minutes, update, confirm, get }
}
