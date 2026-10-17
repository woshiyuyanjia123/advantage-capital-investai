#!/usr/bin/env node
// InvestAI v2 验收脚本：在临时目录启动完整后端（SaaS 模式，真实 SQLite、真实 Office 文件、真实本机转写），
// 用外部服务的本地模拟（智堡 / 推送 / 统一登录 / MCP）逐条验证需求。不会触碰本机真实数据与密钥文件。
//   node scripts/verify.mjs            全部
//   node scripts/verify.mjs --no-asr   跳过本机转写（无 faster-whisper 环境时自动跳过）
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHmac, randomBytes, createHash } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = await mkdtemp(join(tmpdir(), 'investai-verify-'))
process.env.INVESTAI_SECRETS = join(TMP, 'secrets.json') // 隔离密钥文件
process.env.WISBURG_API_KEY = 'mock-key'
delete process.env.DEEPSEEK_API_KEY
const NO_ASR = process.argv.includes('--no-asr')

const { createCore } = await import('../core/index.mjs')
const { hashPassword } = await import('../core/api.mjs')
const { createWisburg } = await import('../core/wisburg.mjs')
const { connectMcp } = await import('../core/mcp.mjs')
const { pushWebhook } = await import('../core/notify.mjs')
const { verifyCites } = await import('../core/ai.mjs')

let pass = 0, fail = 0
const failures = []
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) } }
const section = t => console.log(`\n■ ${t}`)
const isZip = b => b?.[0] === 0x50 && b?.[1] === 0x4b

// ───────── 外部服务模拟 ─────────
const outbound = []
const mockFetch = async (url, init = {}) => {
  const u = new URL(url)
  outbound.push({ url: String(url), init, body: init.body ? String(init.body) : '' })
  const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  if (u.hostname === 'wisburg.mock') {
    const id = u.pathname.split('/').pop()
    if (/\/reports$/.test(u.pathname)) return J({ code: 200, data: { items: [{ id: `r-${u.searchParams.get('query')}`, title: `${u.searchParams.get('query')}行业周报：需求回暖`, datetime: new Date().toISOString(), summary: '<p>行业需求回暖，龙头扩产 20%。</p>' }], page_info: { end_cursor: null } } })
    if (/\/company-reports$/.test(u.pathname)) return J({ code: 200, data: { items: [], page_info: {} } })
    return J({ code: 200, data: { id, title: `${id} 详情`, datetime: new Date().toISOString(), summary: '<p>行业需求回暖，龙头扩产 20%。</p>', source: '模拟机构' } })
  }
  if (u.hostname === 'push.mock') return J(u.pathname.includes('feishu') ? { code: 0 } : { errcode: 0 })
  if (u.hostname === 'sso.mock') {
    if (u.pathname === '/token') { const p = new URLSearchParams(init.body); return p.get('code') === 'good' && p.get('code_verifier') ? J({ access_token: 'at-1' }) : J({ error: 'invalid_grant' }, 400) }
    if (u.pathname === '/userinfo') return J({ email: init.headers?.authorization === 'Bearer at-1' ? 'zhangwei@example.com' : 'nobody@example.com' })
  }
  return J({ error: 'unexpected' }, 404)
}

// 外部模型模拟：记录收到的全部文本，用来证明机密资料不会被发送到外部模型
const cloudSeen = []
const cloud = {
  kind: 'mock', info: async () => ({ ok: true, label: '模拟外部模型', provider: 'mock', model: 'mock-v4.1-flash' }), models: async () => [],
  async *stream(opts) { cloudSeen.push(JSON.stringify(opts.messages ?? opts.user ?? '')); yield '## 结论\n模拟外部模型输出。' },
  async turn(opts) { cloudSeen.push(JSON.stringify(opts.messages)); return { text: '模拟回答', reasoning: '', toolCalls: [], replay: null } },
}

const PW = Object.fromEntries(['admin', 'wang', 'li', 'liu', 'chen', 'zhao', 'zhangwei', 'qiancheng', 'linxiao', 'zhoumin', 'wulv', 'sunlin', 'zhengjie', 'fengchen', 'hejing'].map(u => [u, randomBytes(9).toString('base64url')]))
const boot = () => createCore({
  dir: join(TMP, 'data'), mode: 'saas', llm: cloud, fetchImpl: mockFetch, autostart: false,
  wisburg: createWisburg({ fetchImpl: mockFetch, base: 'https://wisburg.mock/api' }),
  onSeed(db) { for (const u of db.all('users')) db.putQuiet('users', { ...u, pw: hashPassword(PW[u.username] ?? 'x') }) },
})
let core = await boot()
await core.ready

// ───────── 会话客户端 ─────────
const jar = {}
async function req(who, op, body, query = '', headers = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers })
  if (who && jar[who]) h.set('cookie', jar[who])
  const r = await core.handle(new Request(`http://app.local/api/investai?op=${op}${query}`, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }))
  const sc = r.headers.get('set-cookie')
  if (sc && who) jar[who] = sc.split(';')[0]
  const ct = r.headers.get('content-type') ?? ''
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers }
}
const as = who => ({
  get: (op, q = '') => req(who, op, undefined, q).then(r => r.body),
  post: (op, b = {}) => req(who, op, b).then(r => r.body),
  raw: (op, b, q) => req(who, op, b, q),
})
const login = async who => (await req(who, 'login', { username: who, password: PW[who] })).status
const wait = async (u, id, ms = 600000) => { const t = Date.now(); for (;;) { const j = await u.get('job', `&id=${id}`); if (j.status !== 'running' || Date.now() - t > ms) return j; await new Promise(r => setTimeout(r, 250)) } }
const U = {}
for (const n of Object.keys(PW)) { await login(n); U[n] = as(n) }

const findP = async (u, name) => (await u.get('state')).projects.find(p => p.name.includes(name))
const detail = (u, id) => u.get('project', `&id=${id}`)
const dlOf = async (u, pid, type) => (await detail(u, pid)).deliverables.find(d => d.type === type)

// ════════ 1. 登录、会话与基础安全 ════════
section('1 登录与基础安全（SaaS）')
ok('未登录访问接口返回 401', (await req(null, 'state')).status === 401)
ok('错误密码被拒绝', (await req('tmp', 'login', { username: 'admin', password: 'wrong' })).status === 401)
ok('15 个岗位账号均可登录', Object.keys(jar).length === 15)
ok('跨站 POST 被拒绝（CSRF）', (await req('zhangwei', 'task.add', { title: 'x' }, '', { origin: 'https://evil.example' })).status === 403)
ok('静态资源路径穿越被拒绝', (await core.handle(new Request('http://app.local/api/investai?asset=../package.json'))).status === 404)
const idx = await core.handle(new Request('http://app.local/api/investai?asset=index.html'))
ok('页面带 CSP 安全头', /default-src 'self'/.test(idx.headers.get('content-security-policy') ?? ''))

// ════════ 2. 四层权限 ════════
section('2 四层权限：功能 / 数据范围 / 业务操作 / 敏感字段与密级')
const sZ = await U.zhangwei.get('state'), sL = await U.linxiao.get('state'), sH = await U.hejing.get('state'), sW = await U.wulv.get('state'), sZh = await U.zhao.get('state'), sWang = await U.wang.get('state')
ok('数据范围：合伙人看到全机构项目', sWang.projects.length === 8, `${sWang.projects.length}`)
ok('数据范围：财务投资部负责人看不到产业投资部项目', !(await U.chen.get('state')).projects.some(p => p.businessType === 'industrial'))
ok('数据范围：产业投资部负责人只看到产业项目', sZh.projects.length > 0 && sZh.projects.every(p => p.businessType === 'industrial'))
ok('数据范围：综合岗看不到任何项目', sH.projects.length === 0)
ok('数据范围：法务（指定授权）只看到被授权项目', sW.projects.length < sWang.projects.length, `${sW.projects.length}`)
const cg = sZ.projects.find(p => p.name.includes('澄光'))
ok('敏感字段：项目经理可见金额与估值', typeof cg.fields.amount === 'string' && typeof cg.fields.valuation === 'string')
const cgL = sL.projects.find(p => p.name.includes('澄光'))
ok('敏感字段：分析师看到金额/估值/条款为脱敏', !!cgL && cgL.fields.amount?.hidden && cgL.fields.valuation?.hidden && cgL.fields.terms?.hidden)
ok('敏感字段：分析师不能修改估值', (await req('linxiao', 'project.update', { id: cg.id, fields: { valuation: '1 亿' } })).status === 403)
ok('功能权限：分析师不能删除项目', (await req('linxiao', 'project.delete', { id: cg.id, confirm: cg.name })).status === 403)
ok('功能权限：分析师不能改 AI 策略', (await req('linxiao', 'settings.update', { section: 'models', value: { sensitiveLevel: 4 } })).status === 403)
ok('功能权限：非管理员不能读审计日志', (await req('zhangwei', 'audit')).status === 403)
const cgFiles = (await detail(U.zhangwei, cg.id)).files
ok('资料密级：项目资料默认「机密」', cgFiles.some(f => f.level === 2))
const anyFile = cgFiles.find(f => f.level === 2)
ok('资料密级：综合岗读取机密资料被拒绝', (await req('hejing', 'file', undefined, `&id=${anyFile.id}`)).status >= 400)
const srch = await U.linxiao.get('search', '&q=估值')
ok('AI/检索结果对分析师脱敏金额估值', !JSON.stringify(srch).match(/投前\s*\d+\s*亿/))

// ════════ 3. 财务投资全生命周期 ════════
section('3 财务投资全生命周期：机会→启动→立项→尽调→投决→交易→投后→退出→复盘归档')
const yf0 = await findP(U.zhangwei, '云帆')
ok('项目机会已录入（云帆数据）', !!yf0 && yf0.stage === '项目机会')
let yd = await detail(U.zhangwei, yf0.id)
ok('准入条件：项目信息表未定稿时不能发起决策', (await req('zhangwei', 'project.gate', { id: yf0.id })).status === 400)
// 提取
const bp = await U.zhangwei.post('extract.run', { projectId: yf0.id, schema: 'bp', fileIds: yd.files.map(f => f.id) })
ok('BP 提取：识别企业名称并标注来源页码', bp.rows?.find(r => r.key === '企业名称')?.source?.path?.includes('BP'))
ok('BP 提取：BP 与财报收入不一致被标为冲突', bp.conflicts?.includes('最近年度营业收入'), JSON.stringify(bp.conflicts))
ok('BP 提取：缺失字段单独列出、不编造', bp.missing?.includes('统一社会信用代码') && bp.rows.find(r => r.key === '统一社会信用代码').value === null)
ok('BP 提取：金额保留单位', /亿元|万元/.test(bp.rows.find(r => r.key === '本轮融资金额')?.value ?? ''), bp.rows.find(r => r.key === '本轮融资金额')?.value)
const xe = await U.zhangwei.post('extract.export', { id: bp.id })
ok('提取结果导出为真实 Excel', isZip(Buffer.from(xe.data, 'base64')))
ok('提取确认需要权限（分析师不能确认入库）', (await req('linxiao', 'extract.confirm', { id: bp.id, accept: ['企业名称'] })).status >= 400)
await U.zhangwei.post('extract.confirm', { id: bp.id, accept: ['企业名称', '注册地', '融资轮次', '本轮融资金额'], edits: {} })
const comp = await U.zhangwei.get('company', `&id=${yf0.companyId}`)
ok('确认后写入公司库并保留来源与确认人', comp.fields?.注册地?.by === '张伟' && !!comp.fields.注册地.source)
const fin = await U.zhangwei.post('extract.run', { projectId: yf0.id, schema: 'financial', fileIds: yd.files.map(f => f.id) })
ok('财报提取：生成多期财务表与衍生指标', fin.fin?.periods?.length >= 2 && fin.fin.derived?.length > 0)
await U.zhangwei.post('extract.confirm', { id: fin.id, accept: fin.fin.grid.map(g => g.metric) })
ok('指标库：确认后写入结构化指标', (await U.zhangwei.get('metrics')).some(m => m.companyId === yf0.companyId))

async function produce(type, by = 'zhangwei', prompt = '') {
  const j = await U[by].post('ai.generate', { projectId: yf0.id, type, prompt })
  if (j.error) return { error: j.error }
  const done = await wait(U[by], j.id)
  return done
}
async function finalize(type, submitter = 'zhangwei', approver = 'chen') {
  const d = await dlOf(U[submitter], yf0.id, type)
  await U[submitter].post('deliverable.submit', { id: d.id })
  return U[approver].post('deliverable.finalize', { id: d.id })
}
async function gate(voteMap) {
  const a = await U.zhangwei.post('project.gate', { id: yf0.id })
  if (a.error) return a
  let last = a
  for (const v of a.voters) {
    if (last.status === 'decided') break
    const name = idToName[v]
    const dec = voteMap[name] ?? 'pass'
    last = dec === 'recuse' ? await U[name].post('approval.vote', { id: a.id, recuse: true }) : await U[name].post('approval.vote', { id: a.id, decision: dec, opinion: dec === 'pass' ? '' : '请补充' })
    if (last.error) return last
  }
  return last
}
const allUsers = await U.admin.get('users')
const await_name = Object.fromEntries(allUsers.map(u => [u.username, u.id]))
const idToName = Object.fromEntries(allUsers.map(u => [u.id, u.username]))

const g1 = await produce('项目信息表')
ok('项目信息表：结构化提取生成 Excel 成果', g1.status === 'done' && /\.xlsx$/.test(g1.path ?? ''), g1.error)
ok('分析师无「材料定稿」操作权限', (await req('linxiao', 'deliverable.finalize', { id: (await dlOf(U.zhangwei, yf0.id, '项目信息表')).id })).status >= 400)
{ const { agentTools } = await import('../core/agent.mjs'); const names = agentTools({ db: core.db, kb: core.kb, org: core.org, wisburg: core.ai.wisburg, ai: core.ai }, allUsers.find(u => u.username === 'admin'), { sources: [], steps: [] }, 3).map(t => t.name)
  ok('AI 智能体没有定稿/表决/推进/删除类工具（最高级别也没有）', names.length > 5 && !names.some(n => /final|vote|gate|advance|delete|export|approve/.test(n)), names.join(',')) }
await finalize('项目信息表')
let a1 = await gate({})
ok('项目启动审批：部门负责人通过 → 立项准备', a1.result === 'pass' && (await findP(U.zhangwei, '云帆')).stage === '立项准备', a1.error)

const g2 = await produce('立项报告')
ok('立项报告：研究类成果生成真实 PPT', g2.status === 'done' && /\.pptx$/.test(g2.path ?? ''), g2.error)
const nda = await produce('NDA', 'zhangwei', '签署日期：2026年10月20日')
ok('NDA：标准文书按固定模板填充，不调用模型', nda.status === 'done' && /模板/.test(nda.engine ?? ''))
ok('NDA：缺失字段标注【待补充】而不编造', (await U.zhangwei.get('version.text', `&id=${nda.deliverableId}`)).text.includes('待补充'))
const ndaRaw = await req('zhangwei', 'file.raw', undefined, `&id=${(await dlOf(U.zhangwei, yf0.id, 'NDA')).versions.at(-1).fileId}`)
ok('NDA：下载得到真实 Word 文件', isZip(ndaRaw.body))
await finalize('立项报告'); await finalize('NDA')
// 立项会：第一次退回补充
const a2 = await gate({ wang: 'return', li: 'return', liu: 'return' })
ok('立项会：多数退回 → 留在立项准备并标记需补充', a2.result === 'return' && (await findP(U.zhangwei, '云帆')).stage === '立项准备', a2.error)
const reworks = (await detail(U.zhangwei, yf0.id)).works.filter(w => w.status === 'rework')
ok('退回后已定稿的必做工作标为「需补充」', reworks.length > 0)
for (const t of ['立项报告', 'NDA']) { const d = await dlOf(U.chen, yf0.id, t); await U.chen.post('deliverable.reopen', { id: d.id, reason: '立项会意见补充' }) }
await produce('立项报告'); await finalize('立项报告'); await finalize('NDA')
const a2b = await gate({ wang: 'recuse', li: 'pass', liu: 'pass', chen: 'pass' })
ok('立项会：回避不计入，过半数通过 → 尽职调查', a2b.result === 'pass' && a2b.recused?.length === 1 && (await findP(U.zhangwei, '云帆')).stage === '尽职调查', a2b.error)

const g3 = await produce('尽调报告')
ok('尽调报告生成（引用核对已附在版本上）', g3.status === 'done' && !!g3.citeCheck)
await finalize('尽调报告')
const a3 = await gate({})
ok('尽调结论确认 → 投资决策', a3.result === 'pass' && (await findP(U.zhangwei, '云帆')).stage === '投资决策', a3.error)

await produce('投资建议书'); await finalize('投资建议书')
let S_ic
ok('投委会：非表决人不能表决', (await (async () => { const a = await U.zhangwei.post('project.gate', { id: yf0.id }); const r = await req('chen', 'approval.vote', { id: a.id, decision: 'pass' }); S_ic = a; return r.status })()) === 403)
const v1 = await U.wang.post('approval.vote', { id: S_ic.id, decision: 'pass' })
ok('投委会：三分之二规则下 1 票未生效', v1.status === 'pending')
ok('退回/否决必须填写意见', (await req('li', 'approval.vote', { id: S_ic.id, decision: 'reject', opinion: '' })).status === 400)
const v2 = await U.li.post('approval.vote', { id: S_ic.id, decision: 'pass' })
ok('投委会：2/3 通过 → 交易执行', v2.result === 'pass' && (await findP(U.zhangwei, '云帆')).stage === '交易执行')
ok('重复表决被拒绝', (await req('wang', 'approval.vote', { id: S_ic.id, decision: 'pass' })).status === 409)

// 交易文件：AI 策略限制为「辅助建议」→ AI 起草被拒，人工上传
const tj = await U.zhangwei.post('ai.generate', { projectId: yf0.id, type: '交易文件' })
ok('AI 参与策略：交易文件环节 AI 不能起草（按工作类型配置）', !!tj.error && /AI 参与级别/.test(tj.error), tj.error)
const tplBuf = await readFile(join(ROOT, 'fixtures/templates/标准文书/交易文件模板-增资协议.docx'))
const dTj = await U.zhangwei.post('deliverable.ensure', { projectId: yf0.id, type: '交易文件' })
await U.zhangwei.post('deliverable.upload', { id: dTj.id, name: '增资协议-签署版.docx', data: tplBuf.toString('base64'), note: '律所定稿' })
await finalize('交易文件')
await U.zhangwei.post('project.members', { id: yf0.id, members: [{ userId: await_name.zhangwei, role: 'pm' }, { userId: await_name.zhoumin, role: 'finance' }, { userId: await_name.wulv, role: 'legal' }], grants: [] })
ok('指定授权：加入成员后法务可见项目', (await U.wulv.get('state')).projects.some(p => p.id === yf0.id))
const a5 = await gate({})
ok('交割确认：法务与财务会签（全体通过）→ 投后管理', a5.result === 'pass' && (await findP(U.zhangwei, '云帆')).stage === '投后管理', a5.error ?? JSON.stringify(a5.votes?.map(v => v.name)))

await produce('退出建议书'); await finalize('退出建议书')
const a6 = await gate({ wang: 'hold', li: 'hold', liu: 'hold' })
ok('退出决策：继续持有 → 留在投后管理', a6.result === 'hold' && (await findP(U.zhangwei, '云帆')).stage === '投后管理', a6.error)
{ const d = await dlOf(U.chen, yf0.id, '退出建议书'); await U.chen.post('deliverable.reopen', { id: d.id, reason: '更新退出方案' }); await finalize('退出建议书') }
const a6b = await gate({})
ok('退出决策：通过 → 退出', a6b.result === 'pass' && (await findP(U.zhangwei, '云帆')).stage === '退出', a6b.error)
const a7 = await gate({})
ok('退出完成确认 → 复盘归档', a7.result === 'pass' && (await findP(U.zhangwei, '云帆')).stage === '复盘归档', a7.error)
await produce('项目复盘报告'); await finalize('项目复盘报告')
const a8 = await gate({})
const yfEnd = await findP(U.zhangwei, '云帆')
ok('归档确认 → 项目完成（已归档）', a8.result === 'pass' && yfEnd.status === 'completed', a8.error ?? yfEnd.status)
const tl = (await detail(U.zhangwei, yf0.id)).timeline
ok('项目动态完整记录 8 个阶段的流转', tl.filter(t => /进入「/.test(t.event)).length >= 8, `${tl.length}`)

// 暂停 / 终止 / 重新推进 / 退回
const cgp = (await findP(U.zhangwei, '澄光'))
await U.zhangwei.post('project.control', { id: cgp.id, action: 'pause', reason: '等待对方补充材料' })
ok('暂停项目', (await findP(U.zhangwei, '澄光')).status === 'paused')
ok('暂停中不能发起决策', (await req('zhangwei', 'project.gate', { id: cgp.id })).status === 400)
await U.zhangwei.post('project.control', { id: cgp.id, action: 'resume', reason: '材料到位' })
await U.zhangwei.post('project.control', { id: cgp.id, action: 'terminate', reason: '估值分歧' })
ok('终止项目', (await findP(U.zhangwei, '澄光')).status === 'terminated')
await U.zhangwei.post('project.control', { id: cgp.id, action: 'restart', reason: '对方调整估值' })
ok('重新推进', (await findP(U.zhangwei, '澄光')).status === 'active')
const hy = await findP(U.zhangwei, '衡远')
await U.zhangwei.post('project.sendback', { id: hy.id, stageId: 's_prep', reason: '立项材料需更新' })
ok('人工退回到之前阶段补充', (await findP(U.zhangwei, '衡远')).stage === '立项准备')

// ════════ 4. 成果文件：版本、Office 编辑、恢复 ════════
section('4 成果：真实 Office 文件、版本、编辑、恢复、撤回定稿')
const ws = core.db.one('mounts', m => m.kind === 'workspace').path
const dl = await dlOf(U.zhangwei, yf0.id, '立项报告')
ok('每次生成都是新版本，历史保留', dl.versions.length >= 2)
ok('版本文件真实存在且为 PPTX', isZip(await readFile(join(ws, dl.versions[0].path.replace(/^项目工作区\//, '')))))
const hyIr = await U.zhangwei.post('deliverable.ensure', { projectId: hy.id, type: '行业研究' })
await U.zhangwei.post('deliverable.save', { id: hyIr.id, text: '## 结论\n储能需求增长。\n## 风险\n价格竞争。', note: '人工撰写' })
const co = await core.deliverables.checkout({ ...allUsers.find(u => u.username === 'zhangwei') }, hyIr.id, { open: false })
ok('Office 编辑：生成工作副本（不覆盖历史版本）', /-编辑中\.docx$/.test(co.path))
ok('未修改的工作副本不能提交', (await req('zhangwei', 'deliverable.checkin', { id: hyIr.id })).status === 409)
{ const { utimes } = await import('node:fs/promises'); const t = new Date(Date.now() + 5000); await utimes(co.path, t, t) }
const ci = await U.zhangwei.post('deliverable.checkin', { id: hyIr.id, note: 'Word 中修改' })
ok('Office 编辑：保存后提交为新版本', ci.version?.v === 2, JSON.stringify(ci).slice(0, 120))
const rs = await U.zhangwei.post('deliverable.restore', { id: hyIr.id, v: 1 })
ok('恢复历史版本 = 复制为新版本', rs.version?.v === 3)
ok('撤回定稿需要原因', (await req('chen', 'deliverable.reopen', { id: dl.id, reason: '' })).status === 400)

// ════════ 5. AI 路由与参与级别 ════════
section('5 AI：模型路由（本地/外部/混合）、参与级别、不做正式决策')
cloudSeen.length = 0
const r1 = await core.ai.route(2)
ok('混合路由：含机密资料且无本地模型 → 离线引擎（不发外部）', r1.route === 'offline')
ok('混合路由：只含公开资料 → 外部模型', (await core.ai.route(0)).route === 'external')
const gj = await U.zhangwei.post('ai.generate', { projectId: hy.id, type: '初审意见' })
await wait(U.zhangwei, gj.id)
ok('机密项目资料没有发送给外部模型', !cloudSeen.some(t => t.includes('衡远储能科技') || t.includes('业绩承诺')))
await U.admin.post('settings.update', { section: 'models', value: { mode: 'local' } })
ok('仅本地模式：外部模型不再使用', (await core.ai.route(0)).route !== 'external')
await U.admin.post('settings.update', { section: 'models', value: { mode: 'hybrid' } })
ok('本地模型地址只允许本机回环', (await req('admin', 'settings.update', { section: 'models', value: { local: { baseURL: 'http://10.0.0.5:11434/v1', model: 'x' } } })).status === 400)
const deny1 = await U.zhangwei.post('chat', { text: '帮我把衡远储能推进到投资决策阶段' })
ok('AI 拒绝正式决策（推进阶段/表决/定稿）', deny1.tone === 'warn' && /不能替代/.test(deny1.text))
const deny2 = await U.zhangwei.post('chat', { text: '删除云帆数据项目' })
ok('AI 不执行删除/全量导出等敏感操作', deny2.tone === 'deny')
const lv = core.org.aiLevel(allUsers.find(u => u.username === 'linxiao'), { workType: '交易文件' })
ok('AI 参与级别按工作类型取较低值', lv <= 1)
const ag = await U.zhangwei.post('chat', { text: '衡远储能的尽调进展如何？' })
const agj = await wait(U.zhangwei, ag.job.id)
ok('问答/智能体任务完成并记录路由原因', agj.status === 'done' && !!agj.engine, agj.error)
const cc = verifyCites('- 新签订单 9.2 亿元 [1]\n- 毛利率 35% [1]', [{ n: 1, text: '新签订单9.2亿元，毛利率 31%' }])
ok('引用内容核对：发现与原文不一致的数字', cc.unverified.length === 1 && cc.unverified[0].missing.includes('35'))
const pr = await core.ai.preReview(await dlOf(U.zhangwei, yf0.id, '尽调报告'), allUsers.find(u => u.username === 'zhangwei'))
ok('AI 预审：给出结论与问题清单（不替代人工）', !!pr.verdict && Array.isArray(pr.issues))

// ════════ 6. 会议纪要 ════════
section('6 会议：录音上传 → 本机转写 → AI 纪要 → 决定/待办/责任人 → 确认存档')
const { asrRuntime } = await import('../core/meetings.mjs')
const asrReady = asrRuntime(core.db.get('settings', 'main')).ready
if (NO_ASR || !asrReady) console.log(`  · 跳过本机转写（${NO_ASR ? '--no-asr' : 'faster-whisper 环境未就绪'}）`)
else {
  const hyd = await detail(U.zhangwei, hy.id)
  const m = hyd.meetings[0]
  const audio = await readFile(join(ROOT, 'fixtures/nas/会议录音/衡远储能-尽调沟通会.m4a'))
  await U.zhangwei.post('meeting.upload', { id: m.id, name: '尽调沟通会.m4a', data: audio.toString('base64') })
  const tj2 = await U.zhangwei.post('meeting.transcribe', { id: m.id })
  const td = await wait(U.zhangwei, tj2.id)
  const mm = await U.zhangwei.get('meeting', `&id=${m.id}`)
  ok('本机转写完成（录音不出本机）', td.status === 'done' && mm.asr?.segments?.length > 0, td.error)
  ok('转写识别项目名（热词）', mm.asr.segments.map(s => s.text).join('').includes('衡远储能'))
  ok('识别决定事项', mm.decisions.some(d => /海外认证/.test(d)))
  ok('待办责任人只从参会人中识别', mm.todos.filter(t => t.owner).every(t => m.attendees.includes(t.owner)) && mm.todos.filter(t => t.owner).length >= 2)
  ok('识别中文日期期限', mm.todos.some(t => t.due && new Date(t.due).getDate() === 25))
  await U.zhangwei.post('meeting.confirm', { id: m.id })
  ok('确认后纪要定稿存入项目成果', (await dlOf(U.zhangwei, hy.id, '会议纪要'))?.status === 'final')
  ok('确认后为责任人生成任务', (await U.linxiao.get('tasks')).some(t => /回款/.test(t.title)))
  ok('确认后不能再修改', (await req('zhangwei', 'meeting.update', { id: m.id, minutes: 'x' })).status === 409)
}

// ════════ 7. 外部自助填报 ════════
section('7 外部填报：授权链接 → 对方填写/上传 → 内部确认 → 同一公司库')
const link = await U.zhangwei.post('fill.create', { projectId: hy.id, fields: ['企业名称', '法定代表人', '统一社会信用代码'], days: 3, contact: '对方 CFO' })
ok('生成一次性链接（数据库只存哈希）', !!link.token && !JSON.stringify(core.db.get('fills', link.id)).includes(link.token))
const pg = await req(null, 'fill.public.get', undefined, `&token=${link.token}`)
ok('外部打开链接只看到字段名，无内部数据', pg.status === 200 && !JSON.stringify(pg.body).match(/估值|金额|业绩承诺/))
const sub = await req(null, 'fill.public.submit', { token: link.token, submitter: '王某（CFO）', values: { 法定代表人: '王某', 统一社会信用代码: '91440300MA5FXXXX1A' }, files: [{ name: '营业执照.pdf', data: Buffer.from('%PDF-1.4 test').toString('base64') }] })
ok('外部提交成功并生成待确认记录', sub.status === 200 && !!sub.body.extractionId)
ok('同一链接不能重复提交', (await req(null, 'fill.public.submit', { token: link.token, values: { 法定代表人: 'x' } })).status === 410)
ok('非白名单附件类型被拒绝', await (async () => { const l2 = await U.zhangwei.post('fill.create', { projectId: hy.id, fields: ['企业名称'] }); return (await req(null, 'fill.public.submit', { token: l2.token, values: { 企业名称: 'x' }, files: [{ name: 'a.exe', data: 'AA==' }] })).status === 400 })())
const l3 = await U.zhangwei.post('fill.create', { projectId: hy.id, fields: ['企业名称'] })
await U.zhangwei.post('fill.revoke', { id: l3.id })
ok('撤销后链接失效', (await req(null, 'fill.public.get', undefined, `&token=${l3.token}`)).status === 410)
await U.zhangwei.post('extract.confirm', { id: sub.body.extractionId, accept: ['法定代表人'] })
ok('确认后写入公司库（来源：外部填报）', /外部填报/.test((await U.zhangwei.get('company', `&id=${hy.companyId}`)).fields?.法定代表人?.source?.path ?? ''))

// ════════ 8. 推送（企业微信 / 飞书 / 钉钉） ════════
section('8 推送：企业微信 / 飞书 / 钉钉（签名校验）')
await U.admin.post('settings.update', { section: 'push', value: { channels: [{ id: 'wc', name: '企微', type: 'wecom', enabled: true }, { id: 'fs', name: '飞书', type: 'feishu', enabled: true }, { id: 'dt', name: '钉钉', type: 'dingtalk', enabled: true }] } })
for (const [k, v] of [['push.wc.url', 'https://push.mock/wecom'], ['push.fs.url', 'https://push.mock/feishu'], ['push.fs.secret', 'fs-secret'], ['push.dt.url', 'https://push.mock/dingtalk'], ['push.dt.secret', 'dt-secret']]) await U.admin.post('secret.set', { key: k, value: v })
outbound.length = 0
for (const id of ['wc', 'fs', 'dt']) ok(`推送测试：${id}`, (await U.admin.post('push.test', { id })).ok === true)
const fsReq = JSON.parse(outbound.find(o => o.url.includes('feishu')).body)
ok('飞书签名正确（HMAC-SHA256 timestamp\\nsecret）', fsReq.sign === createHmac('sha256', `${fsReq.timestamp}\nfs-secret`).update('').digest('base64'))
const dtUrl = new URL(outbound.find(o => o.url.includes('dingtalk')).url)
ok('钉钉签名正确', decodeURIComponent(dtUrl.searchParams.get('sign')) === createHmac('sha256', 'dt-secret').update(`${dtUrl.searchParams.get('timestamp')}\ndt-secret`).digest('base64'))
ok('企业微信 markdown 消息格式', JSON.parse(outbound.find(o => o.url.includes('wecom')).body).msgtype === 'markdown')
ok('密钥不写入数据库', !(await readFile(join(TMP, 'data', 'investai.sqlite'))).includes('dt-secret'))
ok('密钥文件权限 600', ((await stat(process.env.INVESTAI_SECRETS)).mode & 0o777) === 0o600)
outbound.length = 0
await core.notify.notify([], { kind: 'approval', title: '测试事件推送', text: 'x' })
ok('业务事件自动推送到已启用通道', outbound.filter(o => o.url.includes('push.mock')).length === 3)

// ════════ 9. 统一登录 ════════
section('9 统一登录（OAuth2 + PKCE，按邮箱匹配已有人员）')
await U.admin.post('settings.update', { section: 'sso', value: { enabled: true, preset: 'oidc', authorizeUrl: 'https://sso.mock/authorize', tokenUrl: 'https://sso.mock/token', userinfoUrl: 'https://sso.mock/userinfo', clientId: 'investai', scope: 'openid email', userField: 'email', matchBy: 'email' } })
await U.admin.post('user.save', { id: await_name.zhangwei, email: 'zhangwei@example.com' })
const loginUrl = new URL(core.sso.loginUrl('http://app.local/sso/callback'))
ok('授权地址带 state 与 PKCE S256', !!loginUrl.searchParams.get('state') && loginUrl.searchParams.get('code_challenge_method') === 'S256')
const su = await core.sso.callback('good', loginUrl.searchParams.get('state'))
ok('回调换取令牌并匹配到系统人员', su.username === 'zhangwei')
ok('state 只能使用一次', await core.sso.callback('good', loginUrl.searchParams.get('state')).then(() => false, () => true))
ok('错误授权码被拒绝', await core.sso.callback('bad', new URL(core.sso.loginUrl('http://app.local/sso/callback')).searchParams.get('state')).then(() => false, () => true))

// ════════ 10. 可选连接器（MCP / toolknit 接口） ════════
section('10 可选连接器：MCP 协议（toolknit 默认关闭，需授权确认）')
const mockMcp = join(TMP, 'mock-mcp.mjs')
await writeFile(mockMcp, `process.stdin.setEncoding('utf8');let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);if(!l.trim())continue;const m=JSON.parse(l);if(m.id===undefined)continue;const r=m.method==='initialize'?{protocolVersion:'2025-06-18',serverInfo:{name:'mock-toolknit'},capabilities:{}}:m.method==='tools/list'?{tools:[{name:'pdf_to_text',description:'x',inputSchema:{type:'object',properties:{}}}]}:{content:[{type:'text',text:'ok:'+JSON.stringify(m.params.arguments)}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:r})+'\\n')}})`)
const mc = await connectMcp(process.execPath, [mockMcp])
ok('MCP 握手并列出工具', mc.tools[0]?.name === 'pdf_to_text' && mc.server.name === 'mock-toolknit')
ok('MCP 调用工具', (await mc.call('pdf_to_text', { a: 1 })).includes('ok:'))
mc.close()
ok('未确认授权不能启用 toolknit', (await req('admin', 'settings.update', { section: 'toolknit', value: { enabled: true, licenseAck: false } })).status === 400)
ok('未启用时测试连接被拒绝', (await req('admin', 'toolknit.test', {})).status === 409)

// ════════ 11. 定时任务与事件触发 ════════
section('11 定时与事件：智堡采集入库、晨报、到期提醒、提交即预审')
const w1 = await U.admin.post('schedule.run', { id: 'wisburg' })
ok('智堡定时采集：按关注列表入库', w1.ok && w1.result.saved > 0, JSON.stringify(w1))
ok('采集内容可在资料库中检索（公开密级）', (await U.linxiao.get('files')).some(f => f.rel.startsWith('智堡/') && f.level === 0))
const w2 = await U.admin.post('schedule.run', { id: 'wisburg' })
ok('重复采集去重', w2.result.saved === 0)
ok('晨报任务', (await U.admin.post('schedule.run', { id: 'brief' })).ok)
ok('到期提醒任务', (await U.admin.post('schedule.run', { id: 'deadline' })).ok)
ok('提交审核时自动 AI 预审并通知审核人', (await U.chen.get('notifications')).some(n => n.kind === 'review' && /AI 预审/.test(n.text)))
ok('发起决策时通知表决人', (await U.wang.get('notifications')).some(n => n.kind === 'approval'))

// ════════ 12. 流程配置 ════════
section('12 流程配置：结构化定义、版本、发布不影响在途项目')
const wf2 = await U.admin.post('workflow.clone', { id: 'financial@v1' })
ok('复制为新版本草稿', wf2.id === 'financial@v2' && wf2.status === 'draft')
ok('已发布版本不能直接修改', (await req('admin', 'workflow.save', { def: { ...(await U.admin.get('workflows')).find(w => w.id === 'financial@v1') } })).status === 409)
const bad = structuredClone(wf2); bad.stages[0].works.push({ work: '不存在的工作' })
ok('非法工作类型被校验拒绝', (await req('admin', 'workflow.save', { def: bad })).status === 400)
const good = structuredClone(wf2); good.stages[0].works.push({ work: '行业研究', required: false, role: 'analyst' }); good.name = '财务投资标准流程（2027 版）'
await U.admin.post('workflow.save', { def: good })
await U.admin.post('workflow.publish', { id: 'financial@v2' })
const np = await U.zhangwei.post('project.create', { name: '测试新项目 A轮', companyName: '测试科技有限公司', businessType: 'financial' })
ok('新建项目使用新发布的流程版本', np.workflowId === 'financial@v2')
ok('在途项目保持原流程版本', (await findP(U.zhangwei, '衡远')).workflowId === 'financial@v1')
ok('7 类业务类型均有已发布流程', (await U.admin.get('workflows')).filter(w => w.status === 'published').map(w => w.businessType).filter((v, i, a) => a.indexOf(v) === i).length >= 7)

// ════════ 13. 行情 / 公告 ════════
section('13 行情与公告（授权数据导入）')
const csv = '代码,名称,日期,收盘价,涨跌幅\n688001,某半导体,2026-10-14,52.1,1.2\n688001,某半导体,2026-10-15,53.0,1.7\n688001,某半导体,2026-10-16,51.8,-2.3\nbad,line\n'
const im = await U.admin.post('market.import', { data: Buffer.from(csv).toString('base64'), source: '测试终端' })
ok('CSV 导入行情并跳过错误行', im.imported === 3 && im.skipped === 1)
ok('行情汇总含走势序列', (await U.zhangwei.get('quotes'))[0]?.series.length === 3)
ok('公告检索走智堡企业研究接口', Array.isArray((await U.zhangwei.get('announcements', `&company=${hy.companyId}`)).items))

// ════════ 14. 历史、回滚与持久化 ════════
section('14 历史可追溯、回滚、重启后数据一致')
const hist = await U.admin.get('history', `&coll=projects&id=${hy.id}`)
ok('每次变更都有历史（操作人、原因、时间）', hist.length > 3 && hist.every(h => h.actor_name && h.at))
const oldest = hist.at(-1)
const snap = await U.admin.get('snapshot', `&coll=projects&id=${hy.id}&rev=${oldest.rev}`)
await U.admin.post('history.rollback', { coll: 'projects', id: hy.id, rev: oldest.rev, reason: '验收回滚测试' })
ok('回滚到历史版本（内容与快照一致）', (await findP(U.zhangwei, '衡远')).stageId === snap.stageId, `${snap.stageId}`)
ok('回滚本身也有记录', (await U.admin.get('history', `&coll=projects&id=${hy.id}`))[0].action === 'rollback')
ok('普通岗位不能回滚', (await req('zhangwei', 'history.rollback', { coll: 'projects', id: hy.id, rev: 1 })).status === 403)
const snapCount = core.db.all('projects').length
const revBefore = core.db.rev
await core.close()
core = await boot()
await core.ready
for (const n of ['zhangwei', 'admin']) { delete jar[n]; await login(n) }
ok('重启后项目数据一致', core.db.all('projects').length === snapCount)
ok('重启后全局版本号延续', core.db.rev >= revBefore - 20)
ok('重启后云帆仍为已归档', (await findP(U.zhangwei, '云帆')).status === 'completed')

await core.close()
await rm(TMP, { recursive: true, force: true })
console.log(`\n验收结果：${pass} 通过，${fail} 未通过${fail ? `\n未通过：\n- ${failures.join('\n- ')}` : ''}`)
process.exit(fail ? 1 : 0)
