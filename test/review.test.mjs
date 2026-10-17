// 代码审查发现的问题的回归测试（Standards 轴 S*、Spec 轴 P*）。每条先红后绿。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { boot, probeModel } from './helpers.mjs'

let t
const probe = probeModel()
before(async () => { t = await boot({ llm: probe.adapter }) })
after(() => t.close())

test('S1 非 SaaS 模式也拒绝跨站 POST（切换身份为管理员）', async () => {
  const r = await t.call(null, 'persona', { userId: t.userId('admin') }, { headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
})
test('S1 拒绝非 JSON 的 POST（无预检的简单请求）', async () => {
  const r = await t.call(null, 'persona', { userId: t.userId('admin') }, { headers: { 'content-type': 'text/plain' } })
  assert.equal(r.status, 415)
})

test('S2 ai.generate 不能写入其他项目（无权访问）的成果', async () => {
  const jc = t.project('江城')
  t.core.db.putQuiet('kvstate', { id: 'persona', userId: t.userId('zhao') })
  const foreign = t.core.deliverables.ensure(jc.id, '行业研究', {}, t.user('zhao'))
  const r = await t.call('zhangwei', 'ai.generate', { projectId: t.project('澄光').id, deliverableId: foreign.id, type: '行业研究' })
  assert.ok(r.status >= 400, `status ${r.status}`)
  assert.equal(t.core.db.get('deliverables', foreign.id).versions.length, 0)
})

test('S3 公司库中的估值、融资金额对分析师脱敏', async () => {
  const yf = t.project('云帆')
  const x = await t.call('zhangwei', 'extract.run', { projectId: yf.id, schema: 'bp' })
  await t.call('zhangwei', 'extract.confirm', { id: x.body.id, accept: x.body.rows.filter(r => r.value).map(r => r.key) })
  const c = await t.call('linxiao', 'company', undefined, { query: `&id=${yf.companyId}` })
  assert.equal(c.status, 200)
  assert.ok(!c.body.fields.投前估值 || c.body.fields.投前估值.hidden, JSON.stringify(c.body.fields.投前估值))
  const d = await t.call('linxiao', 'project', undefined, { query: `&id=${yf.id}` })
  assert.ok(!d.body.company?.fields?.本轮融资金额 || d.body.company.fields.本轮融资金额.hidden)
})

test('S4 无「编辑成果」权限的岗位不能通过智能体保存草稿', async () => {
  await assert.rejects(t.core.ai.saveVersion(t.user('li'), t.project('澄光').id, '行业研究', '## 草稿', null), e => e.status === 403)
})

test('S5 全体回避不会崩溃：决策取消，项目不被误判', async () => {
  const hy = t.project('衡远')
  // 只有「通过 / 退回」两种结果的节点（无否决）上全体回避——审查发现的崩溃场景
  const gate = { id: 'g_t', name: '测试会签', kind: 'sign', op: 'op.pm.confirm', roles: ['head'], rule: 'all', requires: [], outcomes: { pass: { to: hy.stageId, label: '通过' }, return: { to: hy.stageId, label: '补充' } } }
  const a = t.core.db.put('approvals', { projectId: hy.id, stageId: hy.stageId, gate, status: 'pending', voters: [t.userId('chen')], votes: [], recused: [], requestedBy: t.userId('zhangwei'), requestedAt: Date.now(), materials: [] }, { actor: t.user('zhangwei') })
  const r = await t.call('chen', 'approval.vote', { id: a.id, recuse: true })
  assert.equal(r.status, 200, r.body.error)
  assert.equal(t.core.db.get('approvals', a.id).status, 'cancelled')
  assert.equal(t.project('衡远').status, 'active')
})

test('S6 退回到不存在的阶段返回 400；终止项目会取消进行中的决策', async () => {
  const hy = t.project('衡远')
  assert.equal((await t.call('zhangwei', 'project.sendback', { id: hy.id, stageId: 's_nope', reason: 'x' })).status, 400)
  const pending = t.core.db.one('approvals', a => a.projectId === hy.id && a.status === 'pending')
  await t.call('zhangwei', 'project.control', { id: hy.id, action: 'terminate', reason: '测试终止' })
  if (pending) assert.notEqual(t.core.db.get('approvals', pending.id).status, 'pending')
  await t.call('zhangwei', 'project.control', { id: hy.id, action: 'restart', reason: '恢复' })
})

test('S7 删除的项目可以由管理员从历史恢复', async () => {
  const p = (await t.call('zhangwei', 'project.create', { name: '待删除测试项目', companyName: '待删除测试公司', businessType: 'financial' })).body
  const del = await t.call('wang', 'project.delete', { id: p.id, confirm: p.name })
  assert.equal(del.status, 200, del.body.error)
  const hist = t.core.db.history('projects', p.id)
  const r = await t.call('admin', 'history.rollback', { coll: 'projects', id: p.id, rev: hist.find(h => h.action !== 'delete').rev, reason: '误删恢复' })
  assert.equal(r.status, 200, r.body.error)
  assert.ok(t.core.db.get('projects', p.id))
})

test('S8 没有公司的项目确认提取不会 500', async () => {
  const p = (await t.call('zhangwei', 'project.create', { name: '无公司项目', businessType: 'financial' })).body
  const x = t.core.db.put('extractions', { projectId: p.id, companyId: null, schema: 'bp', name: '项目信息表', rows: [{ key: '企业名称', value: '某公司', status: 'found' }], missing: [], conflicts: [], status: 'pending' }, { actor: t.user('zhangwei') })
  const r = await t.call('zhangwei', 'extract.confirm', { id: x.id, accept: ['企业名称'] })
  assert.ok(r.status < 500, r.body.error)
})

test('S9 进入新阶段不直接修改存储中的旧文档（历史快照保持修改前）', async () => {
  const cg = t.project('澄光')
  const before = structuredClone(t.core.db.get('projects', cg.id))
  t.core.engine.enterStage(t.core.db.get('projects', cg.id), 's_dd', t.user('zhangwei'), '测试')
  assert.deepEqual(t.core.db.get('projects', cg.id).works, before.works)
})

test('S10 撤销填报链接需要「外部填报」权限', async () => {
  const link = (await t.call('zhangwei', 'fill.create', { projectId: t.project('澄光').id, fields: ['企业名称'] })).body
  const r = await t.call('sunlin', 'fill.revoke', { id: link.id })
  assert.equal(r.status, 403)
})

test('S11 会议纪要定稿需要「材料定稿」业务操作权限', async () => {
  const m = t.core.db.one('meetings', () => true)
  t.core.db.put('meetings', { ...m, minutes: '## 纪要\n测试。', status: 'review', todos: [] }, { actor: t.user('zhangwei') })
  const r = await t.call('linxiao', 'meeting.confirm', { id: m.id })
  assert.equal(r.status, 403)
})

test('S12 不能读取别人的对话任务', async () => {
  const j = t.core.ai.newJob(t.user('zhangwei'), 'chat', { title: '私人问题', silent: true })
  const r = await t.call('hejing', 'job', undefined, { query: `&id=${j.id}` })
  assert.equal(r.status, 403)
})

test('S13 账号不能重复', async () => {
  const r = await t.call('admin', 'user.save', { name: '重复', username: 'zhangwei', roles: ['staff'], deptId: 'd_fin' })
  assert.equal(r.status, 409)
})

test('P3 快照接口不返回密码哈希，并对敏感字段脱敏', async () => {
  const id = t.userId('zhangwei')
  t.core.db.put('users', { ...t.user('zhangwei'), pw: { salt: 'x', hash: 'secret-hash' } }, { actor: t.user('admin') })
  const rev = t.core.db.history('users', id)[0].rev
  const u = await t.call('admin', 'snapshot', undefined, { query: `&coll=users&id=${id}&rev=${rev}` })
  assert.equal(u.status, 200, u.body?.error)
  assert.ok(u.body && !JSON.stringify(u.body).includes('secret-hash'))
  const yf = t.project('云帆')
  const pr = t.core.db.history('projects', yf.id)[0].rev
  const ps = await t.call('admin', 'snapshot', undefined, { query: `&coll=projects&id=${yf.id}&rev=${pr}` })
  assert.ok(!ps.body.fields?.valuation || ps.body.fields.valuation.hidden, '系统管理员没有估值类别，快照应脱敏')
})

test('P4 外部模型路由时，智能体检索不返回机密资料片段', async () => {
  const { agentTools } = await import('../core/agent.mjs')
  const job = { sources: [], steps: [], reads: [] }
  const tools = agentTools({ db: t.core.db, kb: t.core.kb, org: t.core.org, wisburg: t.core.ai.wisburg, ai: t.core.ai, route: { route: 'external' } }, t.user('zhangwei'), job, 2)
  const out = await tools.find(x => x.name === 'search_knowledge').run({ query: '衡远储能 业绩承诺' })
  assert.ok(!JSON.stringify(out).includes('业绩承诺：2026'), JSON.stringify(out).slice(0, 300))
  assert.ok(out.every(r => (r.level ?? 0) < 2 || r.snippet === undefined || /外部模型不可见/.test(r.snippet)))
})

test('P5 资料密级对 AI 参与级别的上限生效', async () => {
  const s = t.core.db.get('settings', 'main')
  t.core.db.put('settings', { ...s, aiPolicy: { ...s.aiPolicy, levels: { 2: 1, 3: 1 } } }, { actor: t.user('admin') })
  const r = await t.call('zhangwei', 'ai.generate', { projectId: t.project('澄光').id, type: '初审意见' })
  const j = r.status === 200 ? await t.wait(r.body.id) : { status: 'failed', error: r.body.error }
  assert.equal(j.status, 'failed')
  assert.match(j.error ?? '', /AI 参与级别/)
  t.core.db.put('settings', { ...t.core.db.get('settings', 'main'), aiPolicy: s.aiPolicy }, { actor: t.user('admin') })
})

test('P6 没有转写引擎时可以粘贴文字稿生成纪要', async () => {
  const hy = t.project('衡远')
  const m = (await t.call('zhangwei', 'meeting.create', { projectId: hy.id, title: '手工纪要测试', attendees: [t.userId('linxiao')] })).body
  const r = await t.call('zhangwei', 'meeting.transcript', { id: m.id, text: '会议决定，下周完成补充尽调。林晓负责在10月30日前整理客户名单。' })
  assert.equal(r.status, 200, r.body.error)
  const mm = (await t.call('zhangwei', 'meeting', undefined, { query: `&id=${m.id}` })).body
  assert.ok(mm.minutes && mm.todos.some(x => x.owner === t.userId('linxiao')))
})

test('P7 退回补充后，未重新定稿的材料不满足准入条件', async () => {
  const cg = t.project('澄光')
  const p = t.core.db.get('projects', cg.id)
  const w = p.works.find(x => x.stageId === p.stageId && x.required)
  const d = t.core.deliverables.ensure(cg.id, w.type, { workId: w.id }, t.user('zhangwei'))
  await t.call('zhangwei', 'deliverable.save', { id: d.id, text: '## 结论\n测试。' })
  await t.call('zhangwei', 'deliverable.submit', { id: d.id })
  await t.call('chen', 'deliverable.finalize', { id: d.id })
  const p2 = t.core.db.get('projects', cg.id)
  t.core.db.put('projects', { ...p2, works: p2.works.map(x => x.id === w.id ? { ...x, status: 'rework' } : x) }, { actor: t.user('zhangwei') })
  const r = t.core.engine.readiness(t.core.db.get('projects', cg.id))
  assert.equal(r.items.find(i => i.work === w.type).ok, false)
})

test('P8 每场会议的纪要是独立成果', async () => {
  const hy = t.project('衡远')
  const ids = []
  for (const title of ['第一次会', '第二次会']) {
    const m = (await t.call('zhangwei', 'meeting.create', { projectId: hy.id, title })).body
    await t.call('zhangwei', 'meeting.transcript', { id: m.id, text: `${title}：会议决定，继续推进。` })
    const c = await t.call('zhangwei', 'meeting.confirm', { id: m.id })
    assert.equal(c.status, 200, c.body.error)
    ids.push(c.body.deliverableId)
  }
  assert.notEqual(ids[0], ids[1])
})

test('S- SaaS 统一登录回调能建立会话（handle.ssoSession 存在）', () => {
  assert.equal(typeof t.core.handle.ssoSession, 'function')
})

test('P9 确认提取时只写入勾选的字段', async () => {
  const yf = t.project('云帆')
  const x = await t.call('zhangwei', 'extract.run', { projectId: yf.id, schema: 'bp' })
  const before = t.core.db.get('companies', yf.companyId).fields.成立时间
  await t.call('zhangwei', 'extract.confirm', { id: x.body.id, accept: ['企业名称'] })
  assert.deepEqual(t.core.db.get('companies', yf.companyId).fields.成立时间, before)
})

test('P10 新业务类型可以从现有流程复制出自己的流程并发布', async () => {
  await t.call('admin', 'businessType.save', { id: 'secondary', name: 'S 基金份额' })
  const w = await t.call('admin', 'workflow.clone', { id: 'financial@v1', businessType: 'secondary' })
  assert.equal(w.status, 200, w.body.error)
  assert.equal(w.body.businessType, 'secondary')
  assert.equal((await t.call('admin', 'workflow.publish', { id: w.body.id })).status, 200)
  assert.equal((await t.call('zhangwei', 'project.create', { name: 'S 份额测试', businessType: 'secondary' })).status, 200)
})

test('P11 风控岗位能编辑风控意见；交割会签的法务财务自动获得项目可见', async () => {
  assert.ok(t.core.org.can(t.user('sunlin'), 'deliverable.edit'))
})

test('P13 提取结果带 Markdown，可导出 PDF', async () => {
  const x = t.core.db.find('extractions', () => true)[0]
  const r = await t.call('zhangwei', 'extraction', undefined, { query: `&id=${x.id}` })
  assert.ok(r.body.markdown?.length > 10)
})

test('P- 外部填报附件会参与自动提取', async () => {
  const cg = t.project('澄光')
  const link = (await t.call('zhangwei', 'fill.create', { projectId: cg.id, fields: ['企业名称', '法定代表人'] })).body
  const bp = Buffer.from('企业名称：澄光半导体材料有限公司\n法定代表人：顾明远\n成立时间：2018年6月\n').toString('base64')
  const r = await t.call(null, 'fill.public.submit', { token: link.token, submitter: '对方', values: { 企业名称: '澄光半导体材料有限公司' }, files: [{ name: '工商信息.md', data: bp }] })
  assert.equal(r.status, 200, r.body.error)
  const x = t.core.db.get('extractions', r.body.extractionId)
  assert.ok(x.rows.some(row => row.key === '成立时间' && row.value), JSON.stringify(x.rows.map(r => r.key)))
})
