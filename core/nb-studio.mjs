// NotebookLM × FDE：左上工坊本地 PPT/Word/录音转文字处理与插件提交动作
import { randomBytes } from 'node:crypto'
import { stat, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { markdownToSlides } from './office.mjs'
import { correctTerms } from './meetings.mjs'

const idOf = p => `${p}_${randomBytes(4).toString('hex')}`

export function slidesFromMd(md, fallbackTitle = '项目汇报') {
  const raw = markdownToSlides(md || `## 项目概览\n- 核心亮点与投资逻辑\n\n## 风险与下一步\n- 待核实事项`)
  return raw.map((s, idx) => ({
    index: idx + 1,
    title: s.title || `${fallbackTitle} ${idx + 1}`,
    bullets: (s.items ?? s.bullets ?? []).map(b => b.text).filter(Boolean),
    notes: s.notes || '',
  }))
}

export function slidesToMd(deckTitle, slides = []) {
  const head = deckTitle ? `# ${deckTitle}\n\n` : ''
  return head + slides.map(s => {
    const lines = (s.bullets ?? []).filter(Boolean).map(b => `- ${String(b).replace(/^[-*]\s*/, '')}`)
    return `## ${s.title || '未命名页'}\n${lines.length ? lines.join('\n') : '- 待补充要点'}`
  }).join('\n\n')
}

export async function transcribeAudioLocal({ db, kb, meetings, settings }, user, b) {
  const p = db.get('projects', b.projectId)
  const c = p?.companyId ? db.get('companies', p.companyId) : null
  const terms = [c?.short, c?.name, p?.name, '尽调报告', '审计报告', '投委会', '立项会', '对赌条款', '业绩承诺', '估值'].filter(Boolean)
  if (b.segments || b.rawText) {
    const rawLines = b.segments
      ? b.segments.map(s => String(s.text ?? '').trim()).filter(Boolean)
      : String(b.rawText ?? '').split(/\n+|(?<=[。！？；])/).map(x => x.trim()).filter(Boolean)
    const fixed = correctTerms(rawLines.join('\n'), terms)
    const segs = fixed.text.split('\n').filter(Boolean).map((text, i) => ({
      start: b.segments?.[i]?.start ?? i * 12,
      speaker: b.segments?.[i]?.speaker || `发言人 ${(i % 2) + 1}`,
      text,
    }))
    return { engine: b.engine || '本地离线转写/校对工坊', segments: segs, corrections: fixed.corrections }
  }
  const localUrl = settings?.models?.local?.baseURL || 'http://127.0.0.1:8000/v1'
  if (b.fileId && /^http:\/\/(127\.0\.0\.1|localhost)/i.test(localUrl)) {
    try {
      const { file, buffer } = await kb.raw(b.fileId, user)
      const fd = new FormData()
      fd.append('file', new Blob([buffer]), file.name)
      fd.append('model', b.asrModel || 'whisper-1')
      fd.append('response_format', 'verbose_json')
      const r = await fetch(`${localUrl.replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) })
      if (r.ok) {
        const j = await r.json()
        const rawSegs = Array.isArray(j.segments) && j.segments.length ? j.segments : [{ start: 0, text: j.text || '' }]
        const fixed = correctTerms(rawSegs.map(s => s.text).join('\n'), terms)
        const lines = fixed.text.split('\n')
        return { engine: `本地 Whisper API (${localUrl})`, segments: rawSegs.map((s, i) => ({ start: Math.round(s.start || i * 10), speaker: `发言人 ${(i % 2) + 1}`, text: lines[i] ?? s.text })), corrections: fixed.corrections }
      }
    } catch { /* 回退至 faster-whisper 或本地分段器 */ }
  }
  if (b.meetingId && b.fileId) return { job: meetings.transcribe(user, b.meetingId, b.fileId) }
  throw Object.assign(new Error('未检测到本地 Whisper 服务：可直接录音/上传后使用内置本地校对，或开启本机 Whisper 端口'), { status: 409 })
}

export async function handlePluginSubmit(ctx, user, p, b) {
  const { db, ai, deliverables, engine } = ctx
  const channel = String(b.channel || 'plugin-draft')
  const note = String(b.note || '通过 NotebookLM 插件通道提交').slice(0, 200)
  let summary = ''
  let deliverableId = b.deliverableId || null
  if (channel === 'local-checkin' && deliverableId) {
    const d = db.get('deliverables', deliverableId)
    if (d?.checkout?.path) {
      const st = await stat(d.checkout.path).catch(() => null)
      if (st) {
        const buf = await readFile(d.checkout.path)
        const r = await deliverables.addVersion(user, { ...d, checkout: null }, { buffer: buf, ext: extname(d.checkout.path), engine: '本地 Office/WPS 插件回传', note })
        db.put('deliverables', { ...db.get('deliverables', deliverableId), checkout: null }, { actor: user, reason: '本地修改插件提交', action: 'checkin' })
        summary = `已回传本地修改文件为 v${r.version.v}`
      }
    }
    if (!summary) throw Object.assign(new Error('未找到待回传的本地工作副本，请先点「本机 Office 修改」或直接上传本地文件'), { status: 409 })
  } else if (channel === 'file-upload' && b.data && b.name) {
    const targetType = b.workType || (p.works?.find(w => w.stageId === p.stageId)?.type ?? '立项报告')
    const d = deliverableId ? db.get('deliverables', deliverableId) : deliverables.ensure(p.id, targetType, { workId: b.workId }, user)
    deliverableId = d.id
    const r = await deliverables.upload(user, d.id, String(b.name), Buffer.from(String(b.data), 'base64'), note)
    summary = `插件上传本地文件「${b.name}」→ ${d.type} v${r.version.v}`
  } else if (channel === 'review-submit' && deliverableId) {
    const next = deliverables.submit(user, deliverableId)
    summary = `已将「${next.type}」提交阶段审核`
  } else if (channel === 'gate-submit') {
    const ap = engine.requestGate(user, p)
    summary = `已发起阶段门禁「${ap.gate.name}」表决`
  } else {
    const targetType = b.workType || (p.works?.find(w => w.stageId === p.stageId && w.status !== 'done')?.type ?? '立项报告')
    const job = await ai.generate(user, { projectId: p.id, workId: b.workId, type: targetType, prompt: b.prompt || `请围绕当前阶段「${engine.stageOf(p)?.name || ''}」生成并提交「${targetType}」候选稿。${note}`, fileIds: b.fileIds ?? [] })
    summary = `已派发 DSH/本地插件起草「${targetType}」任务`
    const rec = db.get('kvstate', `sub_${p.id}`)?.list ?? []
    db.put('kvstate', { id: `sub_${p.id}`, list: [{ id: idOf('sub'), at: Date.now(), by: user.name, stage: engine.stageOf(p)?.name, channel, summary, jobId: job.id }, ...rec].slice(0, 50) }, { actor: user, reason: summary, action: 'plugin.submit' })
    return { ok: true, summary, job: ai.poll(job.id) }
  }
  const rec = db.get('kvstate', `sub_${p.id}`)?.list ?? []
  db.put('kvstate', { id: `sub_${p.id}`, list: [{ id: idOf('sub'), at: Date.now(), by: user.name, stage: engine.stageOf(p)?.name, channel, summary, deliverableId }, ...rec].slice(0, 50) }, { actor: user, reason: summary, action: 'plugin.submit' })
  return { ok: true, summary, deliverableId }
}
