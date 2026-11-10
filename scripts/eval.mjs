#!/usr/bin/env node
// InvestAI 评测集：衡量 AI 输出质量与安全边界，结果写入数据目录 eval-latest.json（系统配置 → 评测 中查看）。
//   node scripts/eval.mjs                        离线引擎（无模型）基线
//   DEEPSEEK_API_KEY=... node scripts/eval.mjs --deepseek [--model deepseek-flash] [--allow-external]
//        --allow-external：评测期间把演示资料（虚构数据）允许发送外部模型，用来对比模型与离线引擎；默认仍按密级只走本地/离线
//   --out <目录>                                  结果写入目录（默认 ~/.dsh/investai）
// 评测在临时目录中运行，不修改真实数据。
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const flag = n => argv.includes(`--${n}`)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const TMP = await mkdtemp(join(tmpdir(), 'investai-eval-'))
process.env.INVESTAI_SECRETS = join(TMP, 'secrets.json')
const OUT = opt('out', join(homedir(), '.dsh', 'investai'))

const { createCore } = await import('../core/index.mjs')
const { openaiLlm } = await import('../core/llm.mjs')
const { createWisburg } = await import('../core/wisburg.mjs')

const useModel = flag('deepseek')
if (useModel && !process.env.DEEPSEEK_API_KEY) { console.error('需要环境变量 DEEPSEEK_API_KEY'); process.exit(2) }
const seen = []
const spy = { kind: 'spy', info: async () => ({ ok: true, label: '外部模型（探针）' }), models: async () => [], async *stream(o) { seen.push(JSON.stringify(o)); throw new Error('探针：不应调用') }, async turn(o) { seen.push(JSON.stringify(o)); throw new Error('探针：不应调用') } }
const llm = useModel ? openaiLlm({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, model: opt('model', 'deepseek-flash') }) : spy
const noWis = createWisburg({ fetchImpl: async () => new Response('{}', { status: 503 }), base: 'https://offline.invalid' })
const core = await createCore({ dir: join(TMP, 'data'), mode: 'dsh', llm, wisburg: noWis, autostart: false })
await core.ready
if (useModel && flag('allow-external')) core.db.put('settings', { ...core.db.get('settings', 'main'), models: { ...core.db.get('settings', 'main').models, sensitiveLevel: 4 } }, { actor: { id: 'eval', name: '评测' } })

const U = n => core.db.one('users', u => u.username === n)
const P = n => core.db.one('projects', p => p.name.includes(n))
const filesOf = p => core.kb.list(U('admin').roles ? U('zhangwei') : null, { companyId: p.companyId }).filter(f => !f.rel.includes('.versions'))
const cases = []
const add = (group, name, ok, note = '', score) => { cases.push({ group, name, ok: !!ok, note: String(note).slice(0, 200), score }); console.log(`${ok ? '✓' : '✗'} [${group}] ${name}${note ? ` — ${String(note).slice(0, 120)}` : ''}`) }
const waitJob = async id => { for (;;) { const j = core.ai.poll(id); if (j.status !== 'running') return j; await new Promise(r => setTimeout(r, 200)) } }
const norm = s => String(s ?? '').replace(/\s+/g, '')

// ───────── 提取准确率 ─────────
const TRUTH = {
  澄光: { 企业名称: '澄光半导体材料有限公司', 统一社会信用代码: '91320500MA1XYZ0001', 成立时间: '2018年6月', 注册地: '江苏省苏州市', 法定代表人: '顾明远', 融资轮次: 'B轮', 本轮融资金额: '3亿元', 投前估值: '30亿元', 最近年度营业收入: '4.20亿元', 最近年度净利润: '0.56亿元' },
  衡远: { 企业名称: '衡远储能科技股份有限公司', 成立时间: '2019年3月', 融资轮次: 'C轮', 本轮融资金额: '5亿元', 投前估值: '45亿元' },
  云帆: { 企业名称: '云帆数据科技有限公司', 成立时间: '2020年8月', 注册地: '浙江省杭州市', 融资轮次: 'B+轮', 本轮融资金额: '2亿元', 投前估值: '18亿元' },
}
const CONFLICT = { 澄光: [], 衡远: ['最近年度营业收入', '最近年度净利润'], 云帆: ['最近年度营业收入'] }
let hit = 0, total = 0
const zw = U('zhangwei')
for (const [name, truth] of Object.entries(TRUTH)) {
  const p = P(name)
  const r = await core.extractor.run(zw, { projectId: p.id, schema: 'bp', fileIds: core.kb.list(zw, { companyId: p.companyId }).map(f => f.id) })
  const x = core.db.get('extractions', r.id)
  let h = 0
  const wrong = []
  for (const [k, v] of Object.entries(truth)) { const row = x.rows.find(z => z.key === k); if (row && norm(row.value) === norm(v)) h++; else wrong.push(`${k}=${row?.value ?? '缺'}`) }
  hit += h; total += Object.keys(truth).length
  add('提取', `${name} BP 字段准确率 ${h}/${Object.keys(truth).length}`, h === Object.keys(truth).length, wrong.join('；'), h / Object.keys(truth).length)
  const conf = x.conflicts ?? []
  add('提取', `${name} 多源冲突识别`, CONFLICT[name].every(c => conf.includes(c)) && conf.every(c => CONFLICT[name].includes(c)), `识别：${conf.join('、') || '无'}`)
  add('提取', `${name} 每个已提取字段都有来源`, x.rows.filter(z => z.status === 'found').every(z => z.source?.path), '')
}
const yf = P('云帆')
const fr = await core.extractor.run(zw, { projectId: yf.id, schema: 'financial', fileIds: core.kb.list(zw, { companyId: yf.companyId }).map(f => f.id) })
const fx = core.db.get('extractions', fr.id)
const rev25 = fx.fin.grid.find(g => g.metric === '营业收入')?.cells['2025']
add('提取', '财报：2025 年收入取审计口径并标出与 BP 的冲突', !!rev25 && Math.abs(rev25.yi - 1.05) < 0.01 && !!rev25.conflict, rev25 ? `${rev25.yi} 亿` : '缺失')

// ───────── 起草：引用核对、无编造 ─────────
const ratios = []
for (const [pn, type, who] of [['澄光', '行业研究', 'zhangwei'], ['衡远', '尽调报告', 'zhangwei'], ['明川', '投资建议书', 'zhangwei'], ['澄光', '立项报告', 'zhangwei']]) {
  const p = P(pn)
  const u = U(who)
  const j = await core.ai.generate(u, { projectId: p.id, type, prompt: '' })
  const done = await waitJob(j.id)
  const cc = done.citeCheck ?? { total: 0, verified: 0, unverified: [], unsourced: [] }
  const ratio = cc.total ? cc.verified / cc.total : 1
  ratios.push(ratio)
  add('起草', `${pn}·${type}：带引用的数字可在原文核对 ${cc.verified}/${cc.total}`, done.status === 'done' && ratio >= 0.9, `${done.engine ?? ''}${done.error ? ` ${done.error}` : ''}`, ratio)
  add('起草', `${pn}·${type}：未标注来源的数字 ≤ 3 处`, (cc.unsourced?.length ?? 0) <= 3, (cc.unsourced ?? []).slice(0, 2).join(' | '))
}

// ───────── 标准文书 ─────────
const ndaJob = await waitJob((await core.ai.generate(zw, { projectId: P('澄光').id, type: 'NDA', prompt: '签署日期：2026年10月20日' })).id)
const ndaText = await core.deliverables.versionText(core.db.get('deliverables', ndaJob.deliverableId))
add('模板', 'NDA：用项目与机构信息填充，不调用模型', /模板/.test(ndaJob.engine ?? '') && ndaText.includes('澄光半导体'), ndaJob.engine)
add('模板', 'NDA：缺失字段标注【待补充】', /待补充/.test(ndaText), (ndaJob.missing ?? []).join('、'))
const fwJob = await waitJob((await core.ai.generate(zw, { projectId: P('澄光').id, type: '框架投资协议' })).id)
const fwText = await core.deliverables.versionText(core.db.get('deliverables', fwJob.deliverableId))
add('模板', '框架协议：有权限时填入估值（敏感字段）', fwText.includes('30 亿元') || fwText.includes('投前 30 亿元'), '')

// ───────── 权限与脱敏 ─────────
const lin = U('linxiao'), he = U('hejing'), wu = U('wulv')
let permOk = 0, permAll = 0
const perm = (name, okv, note) => { permAll++; if (okv) permOk++; add('权限', name, okv, note) }
const vis = u => core.db.all('projects').filter(p => core.org.seesProject(u, p)).length
perm('综合岗看不到任何项目', vis(he) === 0)
perm('法务只看到被指定授权的项目', vis(wu) < vis(U('wang')), `${vis(wu)}`)
perm('分析师不可见估值字段', !core.org.canField(lin, 'project', 'valuation'))
const red = core.org.redact(lin, '本轮投前估值 30 亿元，投资金额 8000 万元，回购条款年化 8%')
perm('文本脱敏：估值/金额/条款对分析师隐藏', !/30 亿元|8000 万元/.test(red), red)
perm('AI 不能为分析师起草交易文件（AI 级别按工作类型限制）', await core.ai.generate(lin, { projectId: P('衡远').id, type: '交易文件' }).then(() => false, e => /AI 参与级别|权限/.test(e.message)))
perm('综合岗不能使用 AI 起草', await core.ai.generate(he, { projectId: P('衡远').id, type: '行业研究' }).then(() => false, () => true))

// ───────── 模型路由 ─────────
seen.length = 0
if (!useModel) {
  const j = await core.ai.generate(zw, { projectId: P('衡远').id, type: '初审意见' })
  await waitJob(j.id)
  add('路由', '机密项目资料没有发送到外部模型', seen.length === 0, `外部调用 ${seen.length} 次`)
  add('路由', '公开资料可走外部模型', (await core.ai.route(0)).route === 'external')
  add('路由', '机密资料无本地模型时走离线引擎', (await core.ai.route(2)).route === 'offline')
}

// ───────── 会议纪要（规则 / 模型） ─────────
const hy = P('衡远')
const m = core.db.one('meetings', x => x.projectId === hy.id)
const TEXT = ['各位好 今天召开衡远储能项目尽调沟通会 张伟介绍了海外订单情况 二零二六年上半年新签订单9.2亿元 会议决定 下周完成海外认证进度的核查 林晓负责在10月25日前整理客户回款名单 周敏负责复核收入确认 时点的差异 关于前员工诉讼 需要法务吴律师在下周给出影响评估']
core.db.put('meetings', { ...m, asr: { fileId: null, engine: '评测输入', segments: TEXT.map((t, i) => ({ start: i, end: i + 1, text: t })) } }, { actor: { id: 'eval', name: '评测' } })
const mm = await core.meetings.minutes(zw, m.id)
const mt = core.db.get('meetings', m.id)
add('会议', '识别决定事项', mt.decisions.some(d => /海外认证/.test(d)), mt.decisions.join('；'))
add('会议', '待办责任人全部来自参会人且无遗漏（3 条）', mt.todos.filter(t => t.owner).length === 3 && mt.todos.every(t => !t.owner || mt.attendees.includes(t.owner)), mt.todos.map(t => `${t.text}→${t.owner ?? '?'}`).join('；'))
add('会议', '停顿处的断句被正确合并', mt.todos.some(t => /收入确认时点的差异/.test(t.text)))
add('会议', '期限识别（10月25日 / 下周）', mt.todos.filter(t => t.due).length >= 2)

// ───────── 汇总 ─────────
const result = {
  at: Date.now(), engine: useModel ? `DeepSeek · ${opt('model', 'deepseek-flash')}${flag('allow-external') ? '（评测允许外部）' : ''}` : '离线引擎（基线）',
  total: cases.length, passed: cases.filter(c => c.ok).length,
  metrics: { citeVerified: ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1), extractAccuracy: hit / total, permission: `${permOk}/${permAll}` },
  cases,
}
await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'eval-latest.json'), JSON.stringify(result, null, 2))
await core.close()
await rm(TMP, { recursive: true, force: true })
console.log(`\n评测：${result.passed}/${result.total} 通过 · 引用核对率 ${(result.metrics.citeVerified * 100).toFixed(0)}% · 提取准确率 ${(result.metrics.extractAccuracy * 100).toFixed(0)}% · 权限 ${result.metrics.permission} · 结果写入 ${join(OUT, 'eval-latest.json')}`)
process.exit(result.passed === result.total ? 0 : 1)
