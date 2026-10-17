// 智能提取（需求 六·场景二、需求 七）：非结构化资料 → 结构化表格。
// 每个值带来源（文件、页码、原文片段）；缺失标「缺失」，多源不一致标「冲突」；不编造。
// 规则提取（离线可用）+ 模型提取（可用时补充，原文片段必须能在资料中找到才采纳）。
import { randomUUID } from 'node:crypto'
import { complete, parseJson } from './llm.mjs'

const fail = (m, status = 400) => Object.assign(new Error(m), { status })
const MONEY = '(\\d+(?:\\.\\d+)?)\\s*(亿|万)元'
const toYi = (v, unit) => unit === '万' ? Number(v) / 10000 : Number(v)

export const SCHEMAS = {
  bp: {
    name: '项目信息表', desc: 'BP / 工商资料 → 项目信息表',
    fields: [
      ['企业名称', [/(?:企业|公司)名称[:：]\s*([^\n，,]+)/]],
      ['统一社会信用代码', [/统一社会信用代码[:：]?\s*([0-9A-Z]{18})/]],
      ['成立时间', [/成立(?:时间|日期|于)?[:：]?\s*(\d{4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?)/]],
      ['注册地', [/注册地(?:址)?[:：]\s*([^\n，,]+)/]],
      ['法定代表人', [/法定代表人[:：]\s*([^\n，,（(]+)/]],
      ['所属行业', [/所属行业[:：]\s*([^\n]+)/]],
      ['主营业务', [/主营业务[:：]\s*([^\n]+)/]],
      ['主要产品', [/主要产品[:：]\s*([^\n]+)/]],
      ['商业模式', [/商业模式[:：]\s*([^\n]+)/]],
      ['主要客户', [/主要客户[:：]\s*([^\n]+)/]],
      ['核心团队', [/核心团队[:：]\s*([^\n]+)/]],
      ['融资轮次', [/融资轮次[:：]\s*([^\n，,]+)/, /本轮融资[:：]\s*(Pre-IPO|天使轮|[A-Z]\+?轮)/]],
      ['本轮融资金额', [new RegExp(`本轮融资金额[:：]\\s*${MONEY}`), new RegExp(`拟融资\\s*${MONEY}`)], 'amount'],
      ['投前估值', [new RegExp(`投前估值[:：]?\\s*${MONEY}`)], 'valuation'],
      ['资金用途', [/资金用途[:：]\s*([^\n]+)/]],
      ['股权结构', [/股权结构[:：]\s*([^\n]+)/]],
      ['最近年度营业收入', [new RegExp(`(20\\d\\d)\\s*年\\s*营业收入\\s*[:：]?\\s*${MONEY}`)], null, 'money'],
      ['最近年度净利润', [new RegExp(`(20\\d\\d)\\s*年\\s*(?:营业收入[^，,\\n]*[，,]\\s*)?净利润\\s*[:：]?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(亿|万)元`)], null, 'money'],
    ],
    projectMap: { 本轮融资金额: 'amount', 投前估值: 'valuation', 融资轮次: 'round' },
  },
  financial: { name: '财务分析表', desc: '财务报表 / 审计报告 → 财务分析表' },
  dd: { name: '尽调信息汇总', desc: '访谈纪要 / 尽调材料 → 问题清单' },
}

const METRICS = ['营业收入', '营业成本', '毛利', '净利润', '经营活动现金流', '经营活动现金流量净额', '应收账款', '存货', '总资产', '总负债', '研发投入']
const metricName = s => { const t = String(s).replace(/（.*?）|\(.*?\)|\s/g, ''); return METRICS.find(m => t.startsWith(m) || t.includes(m)) ?? null }
const unitOf = s => /亿元/.test(s) ? '亿' : /万元/.test(s) ? '万' : null

function pageOf(text, index) {
  const before = text.slice(0, index)
  const m = [...before.matchAll(/\[第(\d+)页\]/g)].at(-1)
  return m ? Number(m[1]) : null
}
const normQ = s => String(s).replace(/[\s,，]/g, '')
// 多源取值优先级：审计报告 / 财务报表 > 其他资料 > BP（BP 为公司自述口径）
const rank = src => /审计|财务报表|财报|财务数据|利润表|年报/.test(src?.path ?? '') ? 0 : /BP|商业计划/i.test(src?.path ?? '') ? 2 : 1
const byRank = (a, b) => rank(a.source) - rank(b.source)

export function createExtractor({ db, kb, org, ai, projection }) {
  async function sourcesFor(user, projectId, fileIds) {
    const p = db.get('projects', projectId)
    org.assertProject(user, p)
    let files = fileIds?.length ? fileIds.map(id => kb.file(id)).filter(Boolean) : kb.list(user, { companyId: p.companyId }).filter(f => f.mountId !== 'm_ws' && f.chars > 0)
    files = files.filter(f => kb.visible(user, f))
    const out = []
    for (const f of files.slice(0, 12)) { const r = await kb.read(f.id, user); out.push({ n: out.length + 1, file: f, fileId: f.id, path: r.path, text: r.text, level: f.level ?? 1 }) }
    return { p, sources: out }
  }

  // ───────── 场景一：BP → 项目信息表 ─────────
  function ruleBp(sources) {
    const found = {}
    for (const [key, patterns, , kind] of SCHEMAS.bp.fields) {
      for (const s of sources) {
        for (const re of patterns) {
          for (const m of s.text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
            let value, year
            if (kind === 'money') { year = m[1]; value = `${m[2]} ${m[3]}元`; }
            else if (m[2]) value = `${m[1]} ${m[2]}元`
            else value = m[1].trim().replace(/\s+/g, ' ')
            ;(found[key] ??= []).push({ value, year, yi: kind === 'money' ? toYi(m[2], m[3]) : undefined, source: { n: s.n, fileId: s.fileId, path: s.path, page: pageOf(s.text, m.index), quote: m[0].trim().slice(0, 120) } })
          }
        }
      }
    }
    // 表格类资料中的最近年度收入 / 净利润（CSV、Excel）
    for (const s of sources.filter(x => ['.csv', '.xlsx'].includes(x.file?.ext))) {
      const t = tableMetrics(s)
      for (const [metric, key] of [['营业收入', '最近年度营业收入'], ['净利润', '最近年度净利润']]) {
        const rows = t.filter(r => r.metric === metric && /^20\d\d$/.test(r.period)).sort((a, b) => b.period.localeCompare(a.period))
        if (rows[0]) (found[key] ??= []).push({ value: `${rows[0].yi.toFixed(2)} 亿元`, year: rows[0].period, yi: rows[0].yi, source: { n: s.n, fileId: s.fileId, path: s.path, page: null, quote: rows[0].quote } })
      }
    }
    return found
  }

  async function modelBp(user, sources, job) {
    const route = await ai.route(Math.max(0, ...sources.map(s => s.level)))
    if (!route.adapter) return { found: {}, engine: null, reason: route.reason }
    try {
      // 外部模型只收到全部敏感类别已脱敏的文本；本地模型收到按用户权限脱敏的文本
      const safe = t => route.route === 'external' ? org.redactAll(t) : org.redact(user, t)
      const prompt = `从资料中提取以下字段：${SCHEMAS.bp.fields.map(f => f[0]).join('、')}。\n只输出 JSON：{"字段名":{"value":"值","n":资料编号,"quote":"原文片段（必须逐字摘自资料）"}}；资料中没有的字段不要输出，禁止推测。\n\n${sources.map(s => `[${s.n}] ${s.path}\n${safe(s.text.slice(0, 8000))}`).join('\n\n')}`
      const out = parseJson(await complete(route.adapter, { system: '你是严谨的信息抽取助手，只输出 JSON。', user: prompt, maxTokens: 2500, signal: job?.abort?.signal ?? AbortSignal.timeout(120000) })) ?? {}
      const found = {}
      for (const [key, v] of Object.entries(out)) {
        const s = sources.find(x => x.n === Number(v?.n))
        if (!s || !v?.value || !v?.quote || !normQ(s.text).includes(normQ(v.quote))) continue // 原文核对不通过不采纳
        found[key] = [{ value: String(v.value), source: { n: s.n, fileId: s.fileId, path: s.path, page: pageOf(s.text, s.text.indexOf(v.quote)), quote: String(v.quote).slice(0, 120) }, byModel: true }]
      }
      return { found, engine: route.label }
    } catch (e) { return { found: {}, engine: null, reason: e.message } }
  }

  function mergeRows(user, schemaFields, found, { system = false } = {}) {
    return schemaFields.map(([key, , category, kind]) => {
      let cands = [...(found[key] ?? [])].sort(byRank)
      if (kind === 'money' && cands.length) { const latest = cands.map(c => c.year).filter(Boolean).sort().at(-1); cands = cands.filter(c => !latest || c.year === latest) }
      const uniq = []
      for (const c of cands) {
        const same = uniq.find(u => kind === 'money' ? Math.abs((u.yi ?? 0) - (c.yi ?? 0)) <= Math.max(0.005, Math.abs(u.yi ?? 0) * 0.01) : normQ(u.value) === normQ(c.value))
        if (same) (same.also ??= []).push(c.source); else uniq.push(c)
      }
      const hidden = !system && category && !org.canCategory(user, category)
      if (!uniq.length) return { key, status: 'missing', value: null, category }
      if (hidden) return { key, status: 'hidden', value: null, category, note: '敏感字段：当前岗位无权查看' }
      const label = kind === 'money' && uniq[0].year ? `${uniq[0].year} 年` : undefined
      return { key, status: uniq.length > 1 ? 'conflict' : 'found', value: uniq[0].value, period: label, source: uniq[0].source, alternatives: uniq.slice(1).map(u => ({ value: u.value, source: u.source })), byModel: !!uniq[0].byModel, category }
    })
  }

  // ───────── 场景二：财务资料 → 财务分析表 ─────────
  function tableMetrics(s) {
    const out = []
    const lines = s.text.split('\n').filter(l => l.includes(','))
    let header = null
    for (const l of lines) {
      const cells = l.split(',').map(c => c.trim())
      if (cells.slice(1).some(c => /^20\d\d(H1|Q\d)?$/.test(c))) { header = cells; continue }
      const metric = metricName(cells[0])
      if (!header || !metric) continue
      const unit = unitOf(cells[0]) ?? '万'
      cells.slice(1).forEach((c, i) => {
        const v = Number(String(c).replace(/[,%]/g, ''))
        if (c !== '' && Number.isFinite(v) && header[i + 1]) out.push({ metric, period: header[i + 1], value: v, unit, yi: toYi(v, unit), quote: `${cells[0]} ${header[i + 1]}：${c}` })
      })
    }
    return out
  }
  function textMetrics(s) {
    const out = []
    const unit = /单位[:：]\s*亿元/.test(s.text) ? '亿' : null
    let offset = 0
    for (const line of s.text.split('\n')) {
      const ym = line.match(/^\s*(20\d\d)\s*年/)
      if (ym) {
        for (const m of line.matchAll(/(营业收入|净利润|营业成本|经营活动现金流(?:量净额)?)[\s:：]*(-?\d+(?:\.\d+)?)\s*(亿|万)?元?/g)) {
          const u = m[3] ?? unit
          if (u) out.push({ metric: metricName(m[1]), period: ym[1], value: Number(m[2]), unit: u, yi: toYi(m[2], u), quote: `${ym[1]}年 ${m[0].trim()}`, page: pageOf(s.text, offset) })
        }
      }
      offset += line.length + 1
    }
    for (const m of s.text.matchAll(/(营业收入|净利润|经营活动现金流量净额|应收账款|存货)[:：]\s*(-?[\d,]+(?:\.\d+)?)/g)) {
      const year = s.text.match(/(20\d\d)\s*年度/)?.[1]
      if (!year) continue
      const v = Number(m[2].replace(/,/g, ''))
      const u = /单位[:：]\s*万元/.test(s.text) ? '万' : '亿'
      out.push({ metric: metricName(m[1]), period: year, value: v, unit: u, yi: toYi(v, u), quote: m[0].trim(), page: pageOf(s.text, m.index) })
    }
    return out
  }
  function financial(sources) {
    const points = []
    for (const s of sources) for (const x of [...(['.csv', '.xlsx'].includes(s.file?.ext) ? tableMetrics(s) : []), ...textMetrics(s)]) points.push({ ...x, source: { n: s.n, fileId: s.fileId, path: s.path, page: x.page ?? null, quote: x.quote } })
    const periods = [...new Set(points.map(p => p.period))].sort()
    const metrics = METRICS.filter(m => points.some(p => p.metric === m))
    const cell = (metric, period) => {
      const ps = points.filter(p => p.metric === metric && p.period === period).sort(byRank)
      if (!ps.length) return null
      const uniq = []
      for (const p of ps) if (!uniq.some(u => Math.abs(u.yi - p.yi) <= Math.max(0.005, Math.abs(u.yi) * 0.01))) uniq.push(p)
      return { yi: uniq[0].yi, source: uniq[0].source, conflict: uniq.length > 1 ? uniq.slice(1).map(u => ({ yi: u.yi, source: u.source })) : null }
    }
    const grid = metrics.map(m => ({ metric: m, cells: Object.fromEntries(periods.map(p => [p, cell(m, p)])) }))
    const val = (m, p) => grid.find(g => g.metric === m)?.cells[p]?.yi
    const derived = []
    for (const p of periods) {
      const rev = val('营业收入', p), cost = val('营业成本', p), np = val('净利润', p), ta = val('总资产', p), tl = val('总负债', p)
      if (rev && cost !== undefined) derived.push({ metric: '毛利率', period: p, value: `${(((rev - cost) / rev) * 100).toFixed(1)}%` })
      if (rev && np !== undefined) derived.push({ metric: '净利率', period: p, value: `${((np / rev) * 100).toFixed(1)}%` })
      if (ta && tl !== undefined) derived.push({ metric: '资产负债率', period: p, value: `${((tl / ta) * 100).toFixed(1)}%` })
    }
    const annual = periods.filter(p => /^20\d\d$/.test(p))
    for (let i = 1; i < annual.length; i++) { const a = val('营业收入', annual[i - 1]), b = val('营业收入', annual[i]); if (a && b) derived.push({ metric: '收入增长率', period: annual[i], value: `${(((b - a) / a) * 100).toFixed(1)}%` }) }
    return { periods, grid, derived }
  }

  // ───────── 场景三：尽调材料 → 问题清单 ─────────
  function dd(sources) {
    const rows = []
    const CAT = [['法律', /诉讼|仲裁|处罚|合规|环评|批复|知识产权|股权/], ['财务', /收入|利润|现金流|应收|存货|审计|确认|毛利|负债/], ['客户与市场', /客户|订单|市场|价格|渠道|海外|回款/], ['运营与供应链', /产能|产线|原材料|采购|供应|进口|认证/], ['团队与治理', /团队|管理层|员工|持股|董事/]]
    const SEV = [['高', /诉讼|为负|差异|不一致|依赖|未提供|处罚|下降约?\s*\d{2}/], ['中', /集中|延长|增加|波动|待核实|尚未/]]
    for (const s of sources.filter(x => !['.csv', '.xlsx'].includes(x.file?.ext))) {
      const lines = s.text.replace(/\[第\d+页\]/g, '\n').split(/\n|。|；/).map(x => x.replace(/^\s*(?:[-*#>]+|\d+[.、)])\s*/, '').trim()).filter(x => x.length >= 8 && x.length <= 160)
      let pending = false
      for (const l of lines) {
        if (/^待核实|待办/.test(l)) { pending = true }
        const cat = CAT.find(([, re]) => re.test(l))?.[0]
        if (!cat && !pending) continue
        const items = pending && /[:：]/.test(l) ? l.split(/[:：]/)[1].split(/[；;、]/).map(x => x.trim()).filter(Boolean) : [l]
        for (const it of items) rows.push({ category: cat ?? '待核实', finding: it, severity: SEV.find(([, re]) => re.test(it))?.[0] ?? '低', status: pending || /待核实|尚未/.test(it) ? '待核实' : '已记录', source: { n: s.n, fileId: s.fileId, path: s.path, page: pageOf(s.text, s.text.indexOf(it.slice(0, 12))), quote: it.slice(0, 120) } })
      }
    }
    const order = { 高: 0, 中: 1, 低: 2 }
    return rows.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 60)
  }

  // ───────── 运行 / 确认 / 导出 ─────────
  /** BP 规则提取 + 财务报表/审计报告同期数据（单位在表头、千分位等格式）参与比对，以发现 BP 口径差异。 */
  function bpFound(sources) {
    const found = ruleBp(sources)
    const fin0 = financial(sources)
    for (const [key, metric] of [['最近年度营业收入', '营业收入'], ['最近年度净利润', '净利润']]) {
      const g = fin0.grid.find(x => x.metric === metric)
      if (!g) continue
      for (const [period, c] of Object.entries(g.cells)) for (const x of c ? [c, ...(c.conflict ?? [])] : []) {
        if (!/^20\d\d$/.test(period)) continue
        const list = (found[key] ??= [])
        if (!list.some(y => y.year === period && Math.abs((y.yi ?? 0) - x.yi) <= Math.max(0.005, Math.abs(x.yi) * 0.01) && y.source?.fileId === x.source?.fileId)) list.push({ value: `${x.yi.toFixed(2)} 亿元`, year: period, yi: x.yi, source: x.source })
      }
    }
    return found
  }

  /** 系统内部：对指定文件做 BP 提取（外部填报的附件），不做权限裁剪，结果仍需内部人员确认。 */
  async function bpFromFiles(fileIds) {
    const sources = []
    for (const id of fileIds) { const f = kb.file(id); if (!f) continue; sources.push({ n: sources.length + 1, file: f, fileId: id, path: `${kb.mount(f.mountId)?.name ?? ''}/${f.rel}`, text: await kb.cached(id), level: f.level ?? 1 }) }
    if (!sources.length) return []
    return mergeRows(null, SCHEMAS.bp.fields, bpFound(sources), { system: true })
  }

  async function run(user, { projectId, schema, fileIds, job }) {
    org.assert(user, 'extract.run')
    if (!SCHEMAS[schema]) throw fail(`未知提取类型 ${schema}`)
    const { p, sources } = await sourcesFor(user, projectId, fileIds)
    if (!sources.length) throw fail('没有可提取的资料（或无权访问）')
    if (job) for (const s of sources) job.reads.push({ path: s.path, fileId: s.fileId, role: '提取来源' })
    let rows = [], fin = null, ddRows = null, engine = '规则提取'
    if (schema === 'bp') {
      const found = bpFound(sources)
      const missingKeys = SCHEMAS.bp.fields.map(f => f[0]).filter(k => !found[k])
      if (missingKeys.length) {
        const m = await modelBp(user, sources, job)
        if (m.engine) { engine = `规则提取 + ${m.engine}`; for (const [k, v] of Object.entries(m.found)) if (!found[k]) found[k] = v }
      }
      rows = mergeRows(user, SCHEMAS.bp.fields, found)
    } else if (schema === 'financial') fin = financial(sources)
    else ddRows = dd(sources)
    const cites = sources.map(s => ({ n: s.n, fileId: s.fileId, path: s.path }))
    const missing = rows.filter(r => r.status === 'missing').map(r => r.key)
    const conflicts = [...rows.filter(r => r.status === 'conflict').map(r => r.key), ...(fin?.grid ?? []).flatMap(g => Object.entries(g.cells).filter(([, c]) => c?.conflict).map(([pd]) => `${g.metric} ${pd}`))]
    const doc = db.put('extractions', { projectId, companyId: p.companyId, schema, name: SCHEMAS[schema].name, rows, fin, dd: ddRows, sources: sources.map(s => ({ n: s.n, fileId: s.fileId, path: s.path })), missing, conflicts, engine, status: 'pending', by: user.name }, { actor: user, reason: `运行「${SCHEMAS[schema].name}」提取`, action: 'extract' })
    return { id: doc.id, markdown: toMarkdown(doc), cites, sources, missing, conflicts, engine }
  }

  function toMarkdown(x) {
    const src = s => s ? `[${s.n}]${s.page ? ` 第${s.page}页` : ''}` : ''
    if (x.schema === 'bp') return `## ${x.name}\n\n| 字段 | 值 | 状态 | 来源 |\n|---|---|---|---|\n${x.rows.map(r => `| ${r.key} | ${r.value ?? (r.status === 'hidden' ? '（无权查看）' : '缺失')}${r.period ? `（${r.period}）` : ''} | ${{ found: '已提取', missing: '缺失', conflict: '冲突', hidden: '受限' }[r.status]}${r.alternatives?.length ? `：另有 ${r.alternatives.map(a => `${a.value}${src(a.source)}`).join('、')}` : ''} | ${src(r.source)} |`).join('\n')}\n\n> 缺失 ${x.missing.length} 项、冲突 ${x.conflicts.length} 项；所有值需人工确认后写入公司库。`
    if (x.schema === 'financial') {
      const f = x.fin
      return `## 财务数据（亿元）\n\n| 指标 | ${f.periods.join(' | ')} |\n|---|${f.periods.map(() => '---').join('|')}|\n${f.grid.map(g => `| ${g.metric} | ${f.periods.map(pd => { const c = g.cells[pd]; return c ? `${c.yi.toFixed(2)}${c.conflict ? `（冲突：${c.conflict.map(k => k.yi.toFixed(2)).join('/')}）` : ''} ${src(c.source)}` : '—' }).join(' | ')} |`).join('\n')}\n\n## 衍生指标\n\n| 指标 | 期间 | 数值 |\n|---|---|---|\n${f.derived.map(d => `| ${d.metric} | ${d.period} | ${d.value} |`).join('\n')}\n\n> 冲突 ${x.conflicts.length} 处，需核对口径后确认。`
    }
    return `## 尽调问题清单\n\n| 类别 | 发现 | 严重度 | 状态 | 来源 |\n|---|---|---|---|---|\n${x.dd.map(r => `| ${r.category} | ${r.finding} | ${r.severity} | ${r.status} | ${src(r.source)} |`).join('\n')}`
  }

  /** 人工确认：写入公司库（带来源）、项目字段、指标库。edits: { 字段: 值 } 覆盖提取值。 */
  /**
   * 人工确认入库：只写入勾选（accept）或人工改写（edits）的字段。
   *   bp：accept 为字段名；financial：accept 为「指标|期间」或指标名（冲突单元格必须逐个勾选或改写）；dd：accept 为行号。
   * 公司库已有不同的已确认值时保留旧值记录（previous），并在结果中列出被覆盖的字段。
   */
  function confirm(user, id, { edits = {}, accept = [] } = {}) {
    org.assert(user, 'company.confirm')
    const x = db.get('extractions', id)
    if (!x) throw fail('提取结果不存在', 404)
    if (x.status === 'confirmed') throw fail('该提取结果已确认', 409)
    const p = db.get('projects', x.projectId)
    org.assertProject(user, p)
    const take = new Set(accept.map(String))
    return db.tx(() => {
      const at = Date.now()
      const overwritten = []
      let companyId = x.companyId ?? p.companyId
      if (x.schema === 'bp') {
        const chosen = x.rows.filter(r => take.has(r.key) || edits[r.key]).map(r => ({ ...r, value: edits[r.key] || r.value })).filter(r => r.value && r.status !== 'hidden')
        if (!chosen.length) throw fail('请至少勾选一个字段')
        if (!companyId) {
          // 项目未关联公司：用确认的企业名称建档并关联
          const name = chosen.find(r => r.key === '企业名称')?.value
          if (!name) throw fail('该项目还没有关联公司：请同时确认「企业名称」，系统会据此建立公司档案')
          companyId = (db.one('companies', c => c.name === name) ?? db.put('companies', { name, short: name.replace(/(股份)?有限(责任)?公司$/, '').slice(0, 12), industry: chosen.find(r => r.key === '所属行业')?.value ?? '未分类', region: chosen.find(r => r.key === '注册地')?.value ?? '', fields: {} }, { actor: user, reason: '由提取结果建立公司档案', action: 'create' })).id
          db.put('projects', { ...db.get('projects', p.id), companyId }, { actor: user, reason: '关联公司', action: 'link' })
        }
        const c = db.get('companies', companyId)
        const fields = { ...c.fields }
        const pf = { ...db.get('projects', p.id).fields }
        for (const r of chosen) {
          const prev = fields[r.key]
          if (prev?.status === 'confirmed' && String(prev.value) !== String(r.value)) overwritten.push(r.key)
          fields[r.key] = { value: r.value, category: r.category ?? null, source: edits[r.key] ? { path: '人工填写' } : r.source, by: user.name, at, status: 'confirmed', ...(prev && String(prev.value) !== String(r.value) ? { previous: { value: prev.value, by: prev.by, at: prev.at } } : {}) }
          const pk = SCHEMAS.bp.projectMap[r.key]
          if (pk && org.canField(user, 'project', pk)) pf[pk] = r.value
        }
        db.put('companies', { ...c, fields }, { actor: user, reason: `确认提取信息（${x.name}）${overwritten.length ? `，更新 ${overwritten.join('、')}` : ''}`, action: 'confirm' })
        db.put('projects', { ...db.get('projects', p.id), fields: pf }, { actor: user, reason: '更新项目字段（来自确认的提取信息）', action: 'confirm' })
      }
      if (x.schema === 'financial') {
        if (!companyId) throw fail('该项目还没有关联公司，请先确认「项目信息表」中的企业名称')
        let n = 0
        for (const g of x.fin.grid) for (const [period, c] of Object.entries(g.cells)) {
          if (!c) continue
          const key = `${g.metric}|${period}`
          const picked = take.has(key) || (take.has(g.metric) && !c.conflict) || edits[key] !== undefined
          if (!picked) continue
          const value = edits[key] !== undefined ? Number(edits[key]) : c.yi
          if (!Number.isFinite(value)) throw fail(`「${g.metric} ${period}」的值不是数字`)
          db.put('metrics', { id: `${companyId}:${g.metric}:${period}`, companyId, metric: g.metric, period, value, unit: '亿元', source: edits[key] !== undefined ? { path: '人工填写' } : c.source, by: user.name }, { actor: user, reason: '确认财务指标', action: 'confirm' })
          n++
        }
        if (!n) throw fail('请至少勾选一个指标（冲突单元格需逐个确认取值）')
      }
      if (x.schema === 'dd') {
        const rows = (x.dd ?? []).map((r, i) => [r, i]).filter(([, i]) => take.has(String(i)))
        if (!rows.length) throw fail('请至少勾选一条发现')
        for (const [r, i] of rows) db.put('findings', { id: `${x.id}:${i}`, projectId: p.id, companyId, ...r, by: user.name }, { actor: user, reason: '确认尽调发现', action: 'confirm' })
      }
      return { ...db.put('extractions', { ...x, companyId, status: 'confirmed', confirmedBy: user.name, confirmedAt: at, edits, accepted: [...take] }, { actor: user, reason: '人工确认提取结果', action: 'confirm' }), overwritten }
    })
  }
  return { run, confirm, toMarkdown, bpFromFiles, SCHEMAS }
}

export const newId = () => randomUUID().slice(0, 10)
