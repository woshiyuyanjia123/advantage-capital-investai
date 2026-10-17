// AI 引擎（需求 三、五、七 + 路线图）：
//  · 参与级别：关闭 / 辅助建议 / 起草待确认 / 授权执行（org.aiLevel），AI 永不做正式决策
//  · 模型路由：上下文密级 ≥ 阈值 → 只走本地模型；无本地模型 → 离线引擎（绝不外发）；混合模式外部只看公开资料
//  · 研究类成果：先规划大纲（参考机构历史成果风格，不写死章节）→ 用户确认 → 起草；标准文书：模板字段填充
//  · 生成后引用核对、提交时 AI 预审；所有任务可解释、可追溯、可取消
import { randomUUID } from 'node:crypto'
import { openaiLlm, complete, parseJson, NONE } from './llm.mjs'
import { WORK_TYPES } from './workflow.mjs'
import { tokens } from './kb.mjs'
import { fillDocxTemplate } from './office.mjs'
import { runAgent } from './agent.mjs'
export { dshLlm, openaiLlm, PREFERRED } from './llm.mjs'

import { VOCAB } from './vocab.mjs'
const LEVEL = VOCAB.level
const fail = (m, status = 400) => Object.assign(new Error(m), { status })

const SYSTEM_DRAFT = `你是投资管理机构的成果起草助手。规则：
1. 只使用【资料】中的事实，每条事实句末标注来源编号，如 [1]；数字必须与原文一致。
2. 资料没有的信息写「待补充」，不得编造数字、日期、主体或结论。
3. 严格按【大纲】组织内容（大纲已由用户确认）；遵守【机构写作规范】。
4. 事实与判断分开，判断以「我们认为」开头。
5. 标为「外部研究」的资料是关于其他公司或行业的研究，只能作为行业/可比参考，不得写成本项目的数据。
6. 文末输出「## 待核实事项」列表。只输出 Markdown 正文。`

const SYSTEM_PLAN = `你是投资管理机构的成果策划助手。根据项目情况、可用资料、工作目的与机构历史成果风格，规划成果结构。
不要套用固定章节数量；结构服务于该成果的用途（例如立项讨论、投资决策、尽调结论）。
只输出 JSON：{"outline":[{"title":"章节标题","points":["要点1","要点2"]}],"reason":"一句话说明为什么这样组织"}。`

const SYSTEM_CHAT = `你是投资管理机构的 AI 协作助手，回答简洁、结构化（Markdown）。
只依据【资料】回答并用 [n] 标注来源；资料不足时明确说"知识库中未找到"，不要编造。你不能替代有权人员作出投资决策。`

const SYSTEM_REVIEW = `你是投资管理机构的成果预审助手。检查待审核成果：事实是否有来源支撑、数字是否与资料一致、结论是否有依据、是否遗漏关键风险、是否存在表述不当或敏感信息外泄风险。
输出 Markdown：## 预审结论（通过 / 建议修改）\n## 主要问题（逐条，指出位置）\n## 修改建议。不要重写全文。`

// ───────── 离线引擎（无模型时）：按大纲从资料中摘录，明确标注 ─────────
const HINTS = [
  [/概况|概要|一句话|摘要|基本|信息/, ['主营', '成立', '注册', '行业', '产品', '融资', '估值', '业务']],
  [/行业|市场|竞争|格局|景气|为什么是现在/, ['行业', '市场', '需求', '增长', '国产', '竞争', '份额', '可比', '扩产']],
  [/业务|产品|客户|团队|核心|公司/, ['产品', '客户', '团队', '产能', '订单', '研发', '技术', '收入占比']],
  [/财务|盈利|收入|数据|现金|估值|回报/, ['收入', '利润', '毛利', '现金流', '应收', '估值', 'PE', '亿元', '万元']],
  [/交易|条款|方案|融资|投资安排/, ['融资', '估值', '回购', '对赌', '承诺', '股权', '资金用途', '金额']],
  [/风险|缓释|问题|关注/, ['风险', '依赖', '集中', '诉讼', '下降', '波动', '为负', '尚未', '待核实']],
  [/结论|建议|下一步|待办|决策/, ['建议', '待核实', '待办', '下一步', '决定', '需要']],
]
function sentences(text) {
  return String(text).replace(/\[第\d+页\]/g, '').split(/\n|。|；/).map(x => x.replace(/^\s*(?:[-*#>]+|\d+[.、)])\s*/, '').trim()).filter(x => x.length >= 6 && x.length <= 180)
}
function tableFrom(text) {
  const rows = String(text).trim().split('\n').filter(l => l.includes(',') && !l.startsWith('##')).map(l => l.split(','))
  if (rows.length < 2) return ''
  const w = Math.max(...rows.map(r => r.length))
  const pad = r => [...r, ...Array(w - r.length).fill('')]
  return [`| ${pad(rows[0]).join(' | ')} |`, `|${pad(rows[0]).map(() => '---').join('|')}|`, ...rows.slice(1).map(r => `| ${pad(r).join(' | ')} |`)].join('\n')
}

export function composeOffline({ title, outline, sources, fundLine, note }) {
  const out = [`# ${title}`, '', `> ${note ?? '离线引擎生成：未调用大模型，内容为资料原文摘录与结构化整理，需人工改写并核实。'}`, '', fundLine ?? '', '']
  const used = new Set()
  const usedN = new Set()
  const pool = sources.filter(s => !s.wisburg).flatMap(s => sentences(s.text).map(x => ({ x, n: s.n })))
  for (const sec of outline) {
    out.push(`## ${sec.title}`)
    const hints = [...(HINTS.find(([re]) => re.test(sec.title))?.[1] ?? []), ...(sec.points ?? []).flatMap(p => tokens(p).filter(t => t.length >= 2))]
    if (/财务|数据|收入|盈利/.test(sec.title)) {
      for (const s of sources.filter(s => ['.csv', '.xlsx'].includes(s.file?.ext)).slice(0, 2)) { const t = tableFrom(s.text); if (t) { out.push(`${t}\n\n来源 [${s.n}]`); usedN.add(s.n) } }
    }
    const picked = pool.filter(p => hints.some(k => p.x.includes(k)) && !p.x.includes(',') && !used.has(p.x)).slice(0, 4)
    for (const p of picked) { used.add(p.x); usedN.add(p.n); out.push(`- ${p.x} [${p.n}]`) }
    if (!picked.length) out.push('- 待补充')
    out.push('')
  }
  const ext = sources.filter(s => s.wisburg)
  if (ext.length) {
    out.push('## 外部研究参考', '> 以下为行业与可比公司研究摘要（外部真实数据），不是本项目数据。', '')
    for (const s of ext) { out.push(`**${s.wisburg.title}**（${String(s.wisburg.datetime ?? '').slice(0, 10)}）`); for (const x of sentences(s.text).filter(x => !/^(主要观点|事实依据)$/.test(x)).slice(0, 3)) out.push(`- ${x} [${s.n}]`); out.push(''); usedN.add(s.n) }
  }
  const todo = pool.filter(p => /待核实|尚未|缺失|未提供/.test(p.x)).slice(0, 6)
  out.push('## 待核实事项', ...(todo.length ? todo.map(p => `- ${p.x} [${p.n}]`) : ['- 待补充']))
  return { text: out.join('\n'), used: [...usedN] }
}

/** 引用核对：句子里的数字必须出现在它引用的资料原文中（支持亿/万单位换算）。 */
export function verifyCites(text, sources) {
  const norm = s => String(s).replace(/[,，\s]/g, '')
  const srcText = new Map(sources.map(s => [s.n, norm(s.text)]))
  const result = { total: 0, verified: 0, unverified: [], unsourced: [], noNumber: 0 }
  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('>') || /^\|?\s*-{2,}/.test(line)) continue
    const refs = [...line.matchAll(/\[(\d{1,2})\]/g)].map(m => Number(m[1]))
    // 日期、年份区间、章节编号不算需要核对的数字
    const body = line.replace(/\[\d{1,2}\]/g, '').replace(/^[-*]\s*/, '').replace(/\d{4}[-/年.]\d{1,2}(?:[-/月.]\d{1,2}日?)?/g, '').replace(/(?:19|20)\d{2}\s*(?:年|[-–~至]\s*(?:19|20)\d{2})/g, '').replace(/^\d+(?:\.\d+)*[、.)]\s*/, '')
    const nums = (body.match(/\d+(?:\.\d+)?/g) ?? []).filter(n => n.length >= 1 && !(n.length === 1 && Number(n) < 10 && !body.includes(`${n}%`) && !/[亿万]/.test(body)))
    if (!refs.length) { if (nums.length && !line.startsWith('|') && !/待补充|待核实/.test(line)) result.unsourced.push(line.slice(0, 120)); continue }
    result.total++
    if (!nums.length) { result.noNumber++; result.verified++; continue }
    const pool = refs.map(n => srcText.get(n) ?? '').join('\n')
    const missing = nums.filter(n => {
      if (pool.includes(n)) return false
      const v = Number(n)
      return ![v * 10000, v / 10000, v * 100, v / 100].some(x => Number.isFinite(x) && pool.includes(String(Math.round(x * 100) / 100)))
    })
    if (missing.length) result.unverified.push({ line: line.slice(0, 140), refs, missing })
    else result.verified++
  }
  return result
}

export class AI {
  constructor({ db, kb, org, wisburg, cloud, deliverables, notify, extractor, lifecycle, projection }) {
    Object.assign(this, { db, kb, org, wisburg, cloud: cloud ?? NONE, deliverables, notify, extractor, lifecycle, projection })
    this.live = new Map()
    this.health = new Map()
  }
  get settings() { return this.db.get('settings', 'main') }

  localAdapter() {
    const m = this.settings?.models?.local
    if (!m?.baseURL || !m?.model) return null
    if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(m.baseURL)) return null
    const key = `${m.baseURL}|${m.model}`
    if (this.localKey !== key) { this.localKey = key; const a = openaiLlm({ baseURL: m.baseURL, model: m.model, apiKey: '' }); this.local = { ...a, info: async () => ({ ...(await a.info()), label: `本地 · ${m.model}` }) } }
    return this.local
  }

  async adapterInfo(adapter) {
    if (!adapter) return { ok: false, note: '未配置' }
    const info = await adapter.info().catch(e => ({ ok: false, note: e.message }))
    if (!info.ok) return info
    const h = this.health.get(info.label)
    if (h?.failure && Date.now() - h.failure.at < 300000) return { ok: false, label: info.label, note: `${info.label} 调用失败：${h.failure.message}` }
    return { ...info, verified: !!h?.verified }
  }

  async status() {
    const s = this.settings.models
    const cloud = s.external?.approved === false ? { ok: false, note: '外部模型未获机构批准' } : await this.adapterInfo(this.cloud)
    const local = await this.adapterInfo(this.localAdapter())
    const primary = s.mode === 'local' ? local : cloud.ok ? cloud : local
    return { mode: s.mode, sensitiveLevel: s.sensitiveLevel, cloud, local, ok: !!primary.ok, label: primary.ok ? primary.label : '离线引擎', verified: !!primary.verified, note: primary.ok ? '' : (s.mode === 'local' ? '本地处理：未配置本机模型' : cloud.note) }
  }

  /** 模型路由：按上下文最高密级决定能用哪个模型。返回 { adapter, route, label, reason }。 */
  async route(levelMax = 0) {
    const s = this.settings.models
    const cloud = s.external?.approved === false ? { ok: false, note: '外部模型未获机构批准' } : await this.adapterInfo(this.cloud)
    const localA = this.localAdapter()
    const local = await this.adapterInfo(localA)
    const L = reason => ({ adapter: localA, route: 'local', label: local.label, reason })
    const E = reason => ({ adapter: this.cloud, route: 'external', label: cloud.label, reason })
    const O = reason => ({ adapter: null, route: 'offline', label: '离线引擎', reason })
    if (s.mode === 'local') return local.ok ? L('本地处理模式') : O('本地处理模式：未配置本机模型')
    if (levelMax >= (s.sensitiveLevel ?? 2)) return local.ok ? L(`含${LEVEL[levelMax]}资料，按策略仅本地处理`) : O(`含${LEVEL[levelMax]}资料且未配置本地模型：按策略不发送外部模型`)
    if (cloud.ok) return E(s.mode === 'hybrid' ? '混合模式：资料密级允许外部处理' : '外部模型')
    return local.ok ? L('外部模型不可用，改用本地模型') : O(cloud.note ?? '未配置模型')
  }

  async *modelStream(label, adapter, opts) {
    try {
      for await (const t of adapter.stream(opts)) yield t
      this.health.set(label, { verified: true })
    } catch (e) {
      if (!opts.signal?.aborted) this.health.set(label, { failure: { at: Date.now(), message: /api key/i.test(e.message) ? '未配置 API Key' : String(e.message).slice(0, 160) } })
      throw e
    }
  }

  // ───────── 任务 ─────────
  newJob(user, kind, fields) {
    const job = { id: `j_${randomUUID().slice(0, 10)}`, kind, by: user.name, userId: user.id, status: 'running', phase: 'queued', reads: [], cites: [], steps: [], sources: [], text: '', engine: null, startedAt: Date.now(), ...fields }
    job.abort = new AbortController()
    this.live.set(job.id, job)
    this.record(job)
    if (!fields.silent) this.addChat(user.id, { role: 'ai', jobId: job.id })
    return job
  }
  record(job) {
    const { abort, ...rest } = job
    this.db.putQuiet('jobs', { ...rest, text: rest.text?.slice(0, 20000) })
  }
  poll(id) {
    const job = this.live.get(id) ?? this.db.get('jobs', id)
    if (!job) throw fail('任务不存在', 404)
    const { abort, ...view } = job
    return view
  }
  cancel(user, id) {
    const job = this.live.get(id)
    if (!job || job.status !== 'running') throw fail('任务已结束', 409)
    if (job.userId !== user.id) throw fail('只能取消自己发起的任务', 403)
    job.abort.abort()
    Object.assign(job, { status: 'cancelled', phase: 'cancelled', finishedAt: Date.now() })
    this.record(job)
    return job
  }
  finish(job, patch) {
    Object.assign(job, patch, { finishedAt: Date.now() })
    this.record(job)
    setTimeout(() => this.live.delete(job.id), 120000)
  }
  addChat(userId, msg) {
    const doc = this.db.get('chats', userId) ?? { id: userId, messages: [] }
    if (msg.jobId && doc.messages.some(m => m.jobId === msg.jobId)) return
    const messages = [...doc.messages, { id: randomUUID().slice(0, 10), at: Date.now(), ...msg }].slice(-200)
    this.db.putQuiet('chats', { ...doc, messages })
  }

  // ───────── 资料汇集（权限过滤 + 脱敏 + 密级统计） ─────────
  async gather(user, p, type, { fileIds = [], purpose = '' } = {}) {
    const company = p.companyId ? this.db.get('companies', p.companyId) : null
    const own = this.kb.list(user, { companyId: p.companyId }).filter(f => f.mountId !== 'm_ws' || !f.name.startsWith(type))
    const ind = await this.kb.search(`${company?.industry ?? ''} ${(p.tags ?? []).join(' ')} ${type}`, { user, limit: 3, filter: f => ['m_nas', 'm_arch'].includes(f.mountId) && !own.includes(f) && !f.rel.includes('项目资料/') })
    const extra = fileIds.map(id => this.kb.file(id)).filter(f => f && this.kb.visible(user, f))
    const picked = [...new Map([...extra, ...own.filter(f => f.chars > 0).slice(0, 8), ...ind.map(r => r.file)].map(f => [f.id, f])).values()].slice(0, 10)
    const sources = []
    for (const f of picked) {
      const r = await this.kb.read(f.id, user)
      sources.push({ n: sources.length + 1, file: f, fileId: f.id, path: r.path, level: f.level ?? 1, offline: r.offline, text: this.org.redact(user, r.text.slice(0, 7000)) })
    }
    try {
      if ((await this.wisburg?.status())?.configured) {
        const q = (p.tags ?? []).join(' ') || company?.industry
        const list = await this.wisburg.list('reports', { query: q, first: 3 })
        for (const it of list.items.slice(0, 2)) {
          const x = await this.wisburg.detail('reports', it.id)
          sources.push({ n: sources.length + 1, file: null, wisburg: { resource: 'reports', id: it.id, title: x.title, datetime: x.datetime }, path: `外部研究 · ${x.source} · ${x.title}（${String(x.datetime).slice(0, 10)}）`, level: 0, text: x.text.slice(0, 4000) })
        }
      }
    } catch (e) { sources.warn = e.message }
    const refs = this.kb.files().filter(f => f.mountId === 'm_tpl' && f.rel.startsWith('历史成果/') && (f.name.includes(type) || (WORK_TYPES[type]?.format === 'pptx' && f.ext === '.pptx'))).slice(0, 2)
    const styleRefs = []
    for (const f of refs) { const t = await this.kb.cached(f.id); styleRefs.push({ name: f.name, headings: [...t.matchAll(/^#\s*第\d+页\s*\n+([^\n]+)/gm)].map(m => m[1]).concat([...t.matchAll(/^(?:[一二三四五六七八九十]+、|##\s*)(.+)$/gm)].map(m => m[1])).slice(0, 12) }) }
    const sg = this.kb.files().find(f => f.mountId === 'm_tpl' && f.name === '写作规范.md')
    const styleGuide = sg ? (await this.kb.cached(sg.id)).slice(0, 1200) : ''
    const views = this.db.find('views', v => (v.scope === 'industry' && (company?.industry ?? '').includes(v.target)) || (v.scope === 'company' && v.target === company?.short)).map(v => `${v.target}：${v.stance}。${v.thesis}`)
    const canSee = k => this.org.canField(user, 'project', k)
    const fieldsLine = Object.entries(p.fields ?? {}).filter(([k]) => canSee(k)).map(([k, v]) => `${{ amount: '拟投金额', valuation: '估值', terms: '关键条款', round: '轮次', lp: 'LP 信息' }[k] ?? k}：${v}`).join('；')
    const hidden = Object.keys(p.fields ?? {}).filter(k => !canSee(k))
    return { sources, levelMax: Math.max(0, ...sources.map(s => s.level ?? 0), fieldsLine && Object.keys(p.fields ?? {}).some(k => this.org.fieldCategory('project', k)) ? 2 : 0), company, styleRefs, styleGuide, views, purpose,
      fundLine: `> 项目字段：${fieldsLine || '无'}${hidden.length ? `；${hidden.length} 个敏感字段因权限未纳入` : ''}` }
  }

  // ───────── 大纲规划（研究判断类成果不写死章节） ─────────
  async plan(user, { projectId, type, purpose = '' }) {
    const p = this.db.get('projects', projectId)
    this.org.assertProject(user, p)
    this.org.assertAi(user, 2, { businessType: p.businessType, workType: type })
    const ctx = await this.gather(user, p, type, { purpose })
    const r = await this.route(ctx.levelMax)
    const fmt = WORK_TYPES[type]?.format
    if (r.adapter) {
      try {
        const prompt = `项目：${p.name}（${ctx.company?.industry ?? ''}，阶段：${this.db.get('workflows', p.workflowId)?.stages.find(s => s.id === p.stageId)?.name}）\n成果：${type}（${{ pptx: 'PPT 演示，每章节约一页', docx: 'Word 文档', xlsx: 'Excel 表格' }[fmt]}）\n工作目的：${purpose || `用于${type}相关讨论与决策`}\n可用资料：${ctx.sources.map(s => s.path).join('；')}\n机构历史成果结构（风格参考）：${ctx.styleRefs.map(s => `${s.name}：${s.headings.join(' / ')}`).join('\n') || '无'}\n机构观点：${ctx.views.join('；') || '无'}`
        const out = parseJson(await complete(r.adapter, { system: SYSTEM_PLAN, user: prompt, maxTokens: 1500, signal: AbortSignal.timeout(90000) }))
        if (out?.outline?.length) return { outline: out.outline.slice(0, 16), reason: out.reason ?? '', engine: r.label, route: r }
      } catch (e) { this.health.set(r.label, { failure: { at: Date.now(), message: e.message } }) }
    }
    // 离线：以机构历史成果结构为骨架，按资料情况增删
    const base = ctx.styleRefs[0]?.headings.filter(h => !/页$/.test(h)).slice(0, 10)
    const fallback = { pptx: ['项目一句话', '为什么是现在', '公司与团队', '关键数据', '交易方案', '主要风险与应对', '建议与下一步'], docx: ['结论与建议', '项目与公司概况', '行业与竞争', '业务与核心能力', '财务分析', '主要风险', '待核实事项'], xlsx: ['核心数据', '假设与说明'] }[fmt] ?? ['要点']
    const titles = (base?.length >= 3 ? base : fallback).filter(t => !/待填/.test(t))
    if (ctx.sources.some(s => s.wisburg) && !titles.some(t => /行业|市场/.test(t))) titles.splice(2, 0, '行业与外部研究')
    return { outline: titles.map(title => ({ title, points: [] })), reason: base?.length ? `参考「${ctx.styleRefs[0].name}」的结构，按本项目资料调整` : '按成果用途给出的建议结构，可增删', engine: '离线引擎', route: r }
  }

  // ───────── 起草 ─────────
  async generate(user, { projectId, deliverableId, workId, type, prompt = '', outline, fileIds = [], purpose = '', meetingId, section }) {
    if (Array.isArray(outline)) outline = outline.map(o => typeof o === 'string' ? { title: o, points: [] } : { title: String(o?.title ?? ''), points: Array.isArray(o?.points) ? o.points.map(String) : [] }).filter(o => o.title).slice(0, 20)
    const p = this.db.get('projects', projectId)
    this.org.assertProject(user, p)
    if (!WORK_TYPES[type]) throw fail(`不支持的成果类型：${type}`)
    let d = deliverableId ? this.db.get('deliverables', deliverableId) : null
    if (deliverableId && (!d || d.projectId !== projectId)) throw fail('成果不属于该项目', 403)
    // 先按「假设的草稿」判定权限，避免无权时也创建空成果
    this.lifecycle.authorize(user, d ?? { projectId, type, status: 'draft', versions: [] }, 'aiWrite')
    d ??= this.deliverables.ensure(projectId, type, { workId }, user)
    this.lifecycle.authorize(user, d, 'aiWrite')
    if ([...this.live.values()].some(j => j.status === 'running' && j.deliverableId === d.id)) throw fail('该成果正在生成中', 409)
    const job = this.newJob(user, 'generate', { projectId, deliverableId: d.id, type, title: `${p.name} · ${type}${section !== undefined ? '（章节改写）' : ''}`, prompt, purpose, section })
    this.db.putQuiet('deliverables', { ...this.db.get('deliverables', d.id), generating: job.id })
    void this.runGenerate(job, user, p, d, { outline, fileIds, purpose, meetingId, section, prompt })
    return job
  }

  async runGenerate(job, user, p, d, opts) {
    const kind = WORK_TYPES[d.type]?.kind
    try {
      if (kind === 'standard') return await this.fillTemplate(job, user, p, d, opts)
      if (kind === 'extract' && this.extractor) {
        job.phase = 'retrieving'
        const r = await this.extractor.run(user, { projectId: p.id, schema: WORK_TYPES[d.type].schema, fileIds: opts.fileIds, job })
        job.phase = 'saving'
        const ver = await this.deliverables.addVersion(user, d, { markdown: r.markdown, engine: r.engine, cites: r.cites, sources: r.sources.length, note: `缺失 ${r.missing.length} 项、冲突 ${r.conflicts.length} 项，需人工确认` })
        return this.finish(job, { status: 'done', phase: 'review', engine: r.engine, extraction: r.id, fileId: ver.version.fileId, path: ver.version.path, version: ver.version.v, cites: r.cites, text: r.markdown })
      }
      job.phase = 'retrieving'
      const ctx = await this.gather(user, p, d.type, opts)
      // AI 参与级别按资料密级取低（需求 三）：资料中最高密级的上限不足「起草待确认」时停止
      const lv = this.org.aiLevel(user, { businessType: p.businessType, workType: d.type, level: ctx.levelMax })
      if (lv < 2) throw fail(`AI 参与级别不足：资料含「${LEVEL[ctx.levelMax]}」内容，按机构策略该密级下 AI 只能「${['关闭', '辅助建议'][lv] ?? ''}」`, 403)
      for (const s of ctx.sources) job.reads.push({ path: s.path, fileId: s.fileId, wisburg: s.wisburg, role: s.wisburg ? '外部研究' : `资料·${LEVEL[s.level ?? 1]}`, offline: s.offline })
      if (ctx.sources.warn) job.warn = ctx.sources.warn
      let outline = opts.outline?.length ? opts.outline : null
      let base = ''
      if (opts.section !== undefined) {
        base = await this.deliverables.versionText(d)
        outline = null
      } else if (!outline) {
        job.phase = 'planning'
        this.record(job)
        outline = (await this.plan(user, { projectId: p.id, type: d.type, purpose: opts.purpose })).outline
      }
      job.outline = outline
      const route = await this.route(ctx.levelMax)
      job.route = { route: route.route, reason: route.reason }
      job.engine = route.label
      job.phase = 'generating'
      this.record(job)
      const fmt = WORK_TYPES[d.type]?.format
      let text = ''
      let viaModel = !!route.adapter
      if (viaModel) {
        try {
          let external = ''
          if (route.route === 'local' && this.settings.models.mode === 'hybrid' && (await this.adapterInfo(this.cloud)).ok) {
            const pub = ctx.sources.filter(s => (s.level ?? 1) === 0)
            if (pub.length) {
              job.engine = `混合：外部（仅公开资料）+ ${route.label}`
              external = await complete(this.cloud, { system: SYSTEM_CHAT, user: `只根据以下公开资料，提炼与「${ctx.company?.industry ?? p.name}」相关的行业要点（不涉及任何具体项目）：\n${pub.map(s => `[${s.n}] ${s.path}\n${s.text}`).join('\n\n')}`, maxTokens: 1200, signal: job.abort.signal })
            }
          }
          const userPrompt = opts.section !== undefined
            ? `下面是现有成果全文。只改写第 ${opts.section + 1} 个 ## 章节，其他章节原样保留，输出完整全文。\n改写要求：${opts.prompt}\n\n【现有全文】\n${base}\n\n【资料】\n${ctx.sources.map(s => `[${s.n}] ${s.path}\n${s.text}`).join('\n\n')}`
            : [`任务：为「${p.name}」编制《${d.type}》（${{ pptx: 'PPT：每个 ## 标题为一页，每页 3–6 条要点', docx: 'Word 文档', xlsx: 'Excel：用 Markdown 表格输出，每张表前加 ## 标题' }[fmt]}）。`, opts.purpose ? `工作目的：${opts.purpose}` : '', opts.prompt ? `用户要求：${opts.prompt}` : '', ctx.fundLine,
              `【大纲】\n${outline.map((o, i) => `${i + 1}. ${o.title}${o.points?.length ? `：${o.points.join('；')}` : ''}`).join('\n')}`,
              ctx.styleGuide ? `【机构写作规范】\n${ctx.styleGuide}` : '', ctx.views.length ? `【机构观点】\n${ctx.views.join('\n')}` : '',
              external ? `【外部模型提炼的公开行业要点】\n${external}` : '',
              `【资料】\n${ctx.sources.map(s => `[${s.n}] ${s.path}${s.wisburg ? '（外部研究）' : ''}\n${s.text}`).join('\n\n')}`].filter(Boolean).join('\n\n')
          for await (const t of this.modelStream(route.label, route.adapter, { system: SYSTEM_DRAFT, user: userPrompt, signal: job.abort.signal, maxTokens: 6000 })) { if (job.abort.signal.aborted) break; job.text += t }
          text = job.text
        } catch (e) {
          if (job.abort.signal.aborted || job.text) throw e
          viaModel = false
          job.fallback = /api key/i.test(e.message) ? '模型未配置 API Key' : String(e.message).slice(0, 160)
        }
      }
      if (!viaModel) {
        job.engine = `离线引擎${route.route === 'offline' ? '' : '（模型不可用）'}`
        if (opts.section !== undefined) throw fail('章节改写需要可用的模型（离线引擎不支持改写）', 409)
        const r = composeOffline({ title: `${p.name} ${d.type}`, outline, sources: ctx.sources, fundLine: ctx.fundLine, note: route.route === 'offline' ? `离线引擎生成：${route.reason}。内容为资料原文摘录，需人工改写并核实。` : undefined })
        for (let i = 0; i < r.text.length && !job.abort.signal.aborted; i += 120) { job.text += r.text.slice(i, i + 120); await new Promise(res => setTimeout(res, 8)) }
        text = r.text
      }
      if (job.abort.signal.aborted) return
      const check = verifyCites(text, ctx.sources)
      const used = new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map(m => Number(m[1])))
      job.cites = ctx.sources.filter(s => used.has(s.n)).map(s => ({ n: s.n, fileId: s.fileId ?? null, wisburg: s.wisburg, path: s.path }))
      if (!/##\s*引用来源/.test(text)) text += `\n\n## 引用来源\n${ctx.sources.filter(s => used.has(s.n)).map(s => `[${s.n}] ${s.path}`).join('\n')}\n`
      job.phase = 'saving'
      this.record(job)
      const ver = await this.deliverables.addVersion(user, d, { markdown: text, engine: job.engine, cites: job.cites, sources: ctx.sources.length, outline, citeCheck: check, note: opts.section !== undefined ? `改写第 ${opts.section + 1} 节：${opts.prompt}` : (opts.prompt ?? '') })
      this.finish(job, { status: 'done', phase: 'review', citeCheck: check, fileId: ver.version.fileId, path: ver.version.path, version: ver.version.v, text })
    } catch (e) {
      if (!job.abort.signal.aborted) this.finish(job, { status: 'failed', phase: 'failed', error: e.message })
    } finally {
      const cur = this.db.get('deliverables', d.id)
      if (cur?.generating === job.id) this.db.putQuiet('deliverables', { ...cur, generating: null })
    }
  }

  /** 标准文书：模板字段填充（NDA、框架协议、交易文件）。缺失字段保留【待补充】，不由 AI 推测。 */
  async fillTemplate(job, user, p, d, opts) {
    job.phase = 'retrieving'
    const tname = WORK_TYPES[d.type].template
    const tpl = this.kb.files().find(f => f.mountId === 'm_tpl' && f.ext === '.docx' && f.name.includes(tname))
    if (!tpl) throw fail(`没有找到「${tname}」模板：请放到「模板与规范/标准文书」目录`)
    const { buffer } = await this.kb.raw(tpl.id)
    const c = p.companyId ? this.db.get('companies', p.companyId) : null
    const can = k => this.org.canField(user, 'project', k)
    const values = { 投资机构: this.settings.org?.name, 目标公司: c?.name, 项目名称: p.name, 投资金额: can('amount') ? p.fields?.amount : undefined, 投前估值: can('valuation') ? p.fields?.valuation : undefined, 特殊条款: can('terms') ? p.fields?.terms : undefined, 持股比例: p.fields?.sharePct }
    for (const m of String(opts.prompt ?? '').matchAll(/([一-龥]{2,6})\s*(?:[:：为是]|\s)\s*([^，,；;。\n]{1,40})/g)) if (!values[m[1]]) values[m[1]] = m[2].trim()
    job.reads.push({ path: `模板与规范/${tpl.rel}`, fileId: tpl.id, role: '模板' })
    job.phase = 'generating'
    job.engine = '模板填充（不调用模型）'
    const r = fillDocxTemplate(buffer, values)
    job.text = `已按「${tpl.name}」填充字段：${r.used.join('、') || '无'}\n\n${r.missing.length ? `待补充字段（未推测）：${r.missing.join('、')}` : '所有字段已填写'}`
    job.phase = 'saving'
    const ver = await this.deliverables.addVersion(user, d, { buffer: r.buffer, ext: '.docx', engine: job.engine, note: r.missing.length ? `待补充：${r.missing.join('、')}` : '字段已填齐' })
    this.finish(job, { status: 'done', phase: 'review', missing: r.missing, fileId: ver.version.fileId, path: ver.version.path, version: ver.version.v })
  }

  /** 提交审核时的 AI 预审：确定性检查（引用核对、无来源数字、待补充）+ 可用时模型审阅。 */
  async preReview(d, user) {
    const p = this.db.get('projects', d.projectId)
    const text = await this.deliverables.versionText(d)
    const v = d.versions.at(-1)
    const sources = []
    for (const c of v?.cites ?? []) {
      if (c.fileId && this.kb.file(c.fileId)) sources.push({ n: c.n, text: await this.kb.cached(c.fileId), level: this.kb.file(c.fileId).level })
      else if (c.wisburg) sources.push({ n: c.n, text: (await this.wisburg?.detail(c.wisburg.resource, c.wisburg.id).catch(() => ({ text: '' }))).text, level: 0 })
    }
    const check = verifyCites(text, sources)
    const todo = (text.match(/待补充/g) ?? []).length
    const issues = [
      ...check.unverified.slice(0, 8).map(u => `数字与引用资料不一致：「${u.line}」（未在 [${u.refs.join(',')}] 中找到 ${u.missing.join('、')}）`),
      ...check.unsourced.slice(0, 6).map(l => `数字缺少来源：「${l}」`),
      ...(todo ? [`仍有 ${todo} 处「待补充」`] : []),
    ]
    let modelNote = ''
    // 成果正文来自项目资料，按成果文件自身的密级（项目工作区默认机密）与引用资料的最高密级路由
    const ownLevel = v?.fileId ? (this.kb.file(v.fileId)?.level ?? 2) : 2
    const route = await this.route(Math.max(ownLevel, ...sources.map(s => s.level ?? 1)))
    const safe = route.route === 'external' ? this.org.redactAll(text) : this.org.redact(user, text)
    if (route.adapter) {
      try { modelNote = await complete(route.adapter, { system: SYSTEM_REVIEW, user: `成果：${p.name} · ${d.type}\n\n${safe.slice(0, 15000)}`, maxTokens: 1500, signal: AbortSignal.timeout(120000) }) } catch (e) { modelNote = `（模型预审未完成：${e.message.slice(0, 80)}）` }
    }
    const verdict = issues.length ? '建议修改' : '通过'
    const review = { at: Date.now(), by: route.adapter ? route.label : '规则预审', verdict, issues, citeCheck: { total: check.total, verified: check.verified }, modelNote }
    const cur = this.db.get('deliverables', d.id)
    const versions = cur.versions.map((x, i) => i === cur.versions.length - 1 ? { ...x, review } : x)
    this.db.put('deliverables', { ...cur, versions }, { actor: { id: 'ai', name: 'AI 预审' }, reason: `预审：${verdict}`, action: 'prereview' })
    return review
  }

  // ───────── 问答 / 智能体 ─────────
  async answer(user, text, intent) {
    this.org.assertAi(user, 1)
    const p = intent.project
    const picked = (intent.fileIds ?? []).map(id => this.kb.file(id)).filter(f => f && this.kb.visible(user, f)).map(f => ({ file: f, snippet: f.preview }))
    const results = picked.length ? picked : await this.kb.search(`${text} ${p?.name ?? ''}`, { user, limit: 5, filter: f => f.mountId !== 'm_tpl' })
    const job = this.newJob(user, 'chat', { title: text.slice(0, 40), projectId: p?.id, mode: intent.mode })
    void (async () => {
      try {
        job.phase = 'retrieving'
        const sources = []
        for (const r of results) {
          const doc = await this.kb.read(r.file.id, user)
          sources.push({ n: sources.length + 1, file: r.file, fileId: r.file.id, path: doc.path, level: r.file.level ?? 1, text: this.org.redact(user, doc.text.slice(0, 6000)), snippet: this.org.redact(user, r.snippet) })
          job.reads.push({ path: doc.path, fileId: r.file.id, role: '检索' })
        }
        const route = await this.route(Math.max(0, ...sources.map(s => s.level)))
        job.route = { route: route.route, reason: route.reason }
        job.engine = route.label
        job.phase = 'generating'
        let done = false
        if (route.adapter) {
          try {
            const prompt = `${p ? `当前项目：${p.name}\n` : ''}问题：${text}\n\n【资料】\n${sources.map(s => `[${s.n}] ${s.path}\n${s.text}`).join('\n\n') || '（无匹配资料）'}`
            for await (const t of this.modelStream(route.label, route.adapter, { system: SYSTEM_CHAT, user: prompt, signal: job.abort.signal, maxTokens: 1800 })) job.text += t
            done = true
          } catch (e) { if (job.abort.signal.aborted || job.text) throw e; job.fallback = String(e.message).slice(0, 160) }
        }
        if (!done) {
          job.engine = '离线检索'
          job.text = intent.mode === 'summary' && picked.length
            ? `${route.reason ? `（${route.reason}）\n\n` : ''}原文要点摘录（未经模型改写）：\n\n${sources.map(s => `**${s.file.name}**\n${sentences(s.text).filter(x => !x.includes(',')).slice(0, 8).map(x => `- ${x} [${s.n}]`).join('\n')}`).join('\n\n')}`
            : sources.length ? `${route.reason ? `（${route.reason}）\n\n` : ''}知识库检索结果：\n\n${sources.map(s => `- **${s.file.name}** — ${s.snippet} [${s.n}]`).join('\n')}` : '知识库中没有找到相关内容（或你无权访问相关资料）。'
        }
        job.cites = sources.filter(s => job.text.includes(`[${s.n}]`)).map(s => ({ n: s.n, fileId: s.fileId, path: s.path }))
        this.finish(job, { status: 'done', phase: 'done' })
      } catch (e) { if (!job.abort.signal.aborted) this.finish(job, { status: 'failed', phase: 'failed', error: e.message }) }
    })()
    return job
  }

  async agent(user, text, intent) {
    const lv = this.org.assertAi(user, 1, { businessType: intent.project?.businessType })
    const route = await this.route(this.settings.models.mode === 'local' ? 3 : 1)
    if (!route.adapter || typeof route.adapter.turn !== 'function') return this.answer(user, text, intent)
    const job = this.newJob(user, 'agent', { title: text.slice(0, 40), projectId: intent.project?.id, engine: `${route.label} · 智能体`, route: { route: route.route, reason: route.reason }, aiLevel: lv })
    const doc = this.db.get('chats', user.id)
    const history = (doc?.messages ?? []).slice(-7, -1).flatMap(m => m.role === 'user' ? [{ role: 'user', text: m.text }] : m.text ? [{ role: 'assistant', text: m.text }] : [])
    void (async () => {
      try {
        await runAgent({ db: this.db, kb: this.kb, org: this.org, wisburg: this.wisburg, ai: this, route }, { adapter: route.adapter, user, job, text, project: intent.project, history, aiLevel: lv })
        if (job.abort.signal.aborted) return
        this.health.set(route.label, { verified: true })
        if (!job.saved) job.cites = job.sources.filter(s => job.text.includes(`[${s.n}]`)).map(s => ({ n: s.n, fileId: s.fileId ?? null, wisburg: s.wisburg, path: s.path }))
        this.finish(job, { status: 'done', phase: job.saved ? 'review' : 'done' })
      } catch (e) {
        if (job.abort.signal.aborted) return
        this.health.set(route.label, { failure: { at: Date.now(), message: /api key/i.test(e.message) ? '未配置 API Key' : String(e.message).slice(0, 160) } })
        if (!job.text && !job.steps.length) {
          this.finish(job, { status: 'failed', phase: 'failed', error: `智能体不可用（${this.health.get(route.label).failure.message}），已改用检索问答` })
          await this.answer(user, text, intent)
          return
        }
        this.finish(job, { status: 'failed', phase: 'failed', error: e.message })
      }
    })()
    return job
  }

  /** 智能体工具与 DSH 工具共用：保存草稿为新版本（起草待确认）。 */
  async saveVersion(user, projectId, type, markdown, job) {
    const p = this.db.get('projects', projectId)
    this.org.assertProject(user, p)
    this.lifecycle.authorize(user, { projectId, type, status: 'draft', versions: [] }, 'aiWrite')
    const d = this.deliverables.ensure(projectId, type, {}, user)
    this.lifecycle.authorize(user, d, 'aiWrite')
    const sources = job?.sources ?? []
    const cites = sources.filter(s => markdown.includes(`[${s.n}]`)).map(s => ({ n: s.n, fileId: s.fileId ?? null, wisburg: s.wisburg, path: s.path }))
    let text = markdown
    if (sources.length && !/##\s*引用来源/.test(text)) text += `\n\n## 引用来源\n${sources.map(s => `[${s.n}] ${s.path}`).join('\n')}\n`
    const check = verifyCites(text, await Promise.all(sources.map(async s => ({ n: s.n, text: s.fileId ? await this.kb.cached(s.fileId) : s.text ?? '' }))))
    const ver = await this.deliverables.addVersion(user, d, { markdown: text, engine: job?.engine ?? 'DSH 会话', cites, sources: sources.length, citeCheck: check })
    if (job) Object.assign(job, { projectId, deliverableId: d.id, fileId: ver.version.fileId, path: ver.version.path, version: ver.version.v, cites, citeCheck: check })
    return { path: ver.version.path, version: ver.version.v, fileId: ver.version.fileId, deliverableId: d.id }
  }
}
