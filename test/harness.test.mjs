// 受控制作：先出方案再执行；没有模型时如实说明并摘编；有模型时方案、交叉核对、成品都由模型写，数字对不上要重写一次并在质检里列出来。
import './helpers.mjs' // 先把密钥文件指到临时目录，再加载后端
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { createCore } = await import('../core/index.mjs')
const { inferKindsFromGoal } = await import('../core/nb-harness.mjs')

const req = (op, body, method = body ? 'POST' : 'GET') => new Request(
  `http://127.0.0.1/api/investai?${new URLSearchParams(method === 'GET' ? { op, ...(body || {}) } : { op })}`,
  method === 'POST' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {},
)
const raw = (core, op, body, method) => core.handle(req(op, body, method))
const call = async (core, op, body, method) => {
  const r = await raw(core, op, body, method)
  const j = await r.json()
  assert.equal(r.status, 200, `${op}: ${JSON.stringify(j).slice(0, 300)}`)
  return j
}

test('H1 从一句话判断要做哪些材料', () => {
  const k = inferKindsFromGoal('准备投委会全套上会材料，再加一套答辩闪卡', '投资决策')
  for (const x of ['ic_memo', 'ppt', 'word', 'table', 'flashcards']) assert.ok(k.includes(x), x)
  assert.deepEqual(inferKindsFromGoal('做个思维导图'), ['mindmap'])
  assert.ok(!inferKindsFromGoal('做一份 topic 清单').includes('ic_memo'), '单词里含 ic 两个字母不算备忘录')
})

test('H2 没有模型：方案只列底稿盘点，成品摘编且数字全部对得上，天眼查没配置就跳过，不编造核查结论', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nb-h2-'))
  const core = await createCore({ dir, mode: 'dsh' })
  try {
    const st = await call(core, 'state')
    const p = st.projects.find(x => x.name.includes('衡远')) ?? st.projects[0]
    const before = (await call(core, 'project', { id: p.id }, 'GET')).files.length

    const plan = await call(core, 'nb.harness.plan', { projectId: p.id, thinkingDepth: 'deep', kinds: ['ic_memo', 'ppt', 'word', 'table'], pageCount: 6, withTianyancha: true, autoSubmitStage: true })
    assert.equal(plan.status, 'planned')
    assert.equal(plan.engine, '', '没有模型时不标模型名')
    assert.ok(plan.engineNote, '写明没有调用模型的原因')
    assert.equal(plan.coreThesis, '', '没有模型时不生成立论')
    assert.ok(plan.thoughtSteps.length >= 3 && plan.thoughtSteps[1].thought.includes('没有调用模型'))
    assert.ok(plan.steps.some(s => s.tool === 'tianyancha_enrich') && plan.steps.some(s => s.tool === 'agent_mesh_crosscheck'))
    assert.ok(plan.sourceSummary.totalDocs >= 2)

    const run = await call(core, 'nb.harness.run', { projectId: p.id, planId: plan.id })
    assert.equal(run.status, 'completed')
    const step = id => run.steps.find(s => s.id === id)
    assert.equal(step('act_tyc').status, 'skipped')
    assert.match(step('act_tyc').detail, /Token/)
    assert.equal(step('act_mesh').status, 'skipped')
    assert.equal(run.meshSummary.engine, '')
    assert.deepEqual(run.meshSummary.conflicts, [], '没有模型时不出现任何“冲突”结论')
    const after = (await call(core, 'project', { id: p.id }, 'GET')).files
    assert.ok(!after.some(f => f.name.includes('天眼查')), '没有查询就不生成天眼查底稿')

    assert.equal(run.artifacts.length, 4)
    assert.equal(run.qualityGate.length, 4)
    for (const q of run.qualityGate) {
      assert.equal(q.passed, true, `${q.kind}: ${q.detail}`)
      assert.equal(q.engine, '底稿摘编')
      assert.deepEqual(q.unmatched, [])
    }
    const ppt = run.artifacts.find(a => a.kind === 'ppt')
    assert.ok(existsSync(ppt.fullPath) && ppt.bytes < 1024 * 1024, '文件大小来自内容')
    assert.ok(run.anchorRate === 100 && run.numberSummary.total > 0)
    assert.ok(run.submissions.length >= 1, '合格且有对应工作项的成品已报送')
    assert.equal(step('act_submit').status, 'done')
    assert.ok(plan.stage && !step('act_submit').label.includes('undefined'), '阶段名取到了')

    const hs = await call(core, 'nb.harness.status', { projectId: p.id }, 'GET')
    assert.ok(hs.presets.length >= 3 && hs.depths.length === 3)
    assert.ok(hs.runs.some(r => r.id === run.id && r.status === 'completed'))
    assert.ok(before > 0)
  } finally {
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('H3 有模型：方案和交叉核对由模型给出；成品里的数字对不上底稿时重写一次，仍对不上就不算通过、不报送', async () => {
  const seen = { plan: 0, mesh: 0, outline: 0, write: 0, repair: 0 }
  let fixOnRepair = true
  const server = createServer(async (rq, rs) => {
    let body = ''
    for await (const ch of rq) body += ch
    const j = JSON.parse(body || '{}')
    const user = j.messages?.at(-1)?.content ?? ''
    let out = '{}'
    if (user.includes('thoughtSteps')) {
      seen.plan++
      out = JSON.stringify({ coreThesis: '2026H1 新签订单 9.2 亿元，但毛利率降到 17%，先把盈利质量讲清楚 [1]', thoughtSteps: [
        { phase: '底稿能回答什么', thought: '访谈纪要给出了订单和毛利率 [1]', decision: '财务部分以审计口径为准' },
        { phase: '口径是否一致', thought: 'BP 与审计的收入口径不同 [1][2]', decision: '两个口径都写出来' },
        { phase: '材料分工', thought: '演示文稿给投委会看结论', decision: '演示文稿只讲结论' },
      ], artifactDirectives: { ppt: '先讲收入口径差异，再讲客户集中度' }, gaps: ['缺期后回款流水'] })
    } else if (user.includes('"conflicts"')) {
      seen.mesh++
      out = JSON.stringify({ conflicts: [{ topic: '营业收入口径', bpClaim: 'BP 披露的收入更高 [2]', auditFact: '访谈纪要记载毛利率降至 17% [1]', impact: '估值基数要按审计口径重算' }], redFlags: ['存在一项未决诉讼 [3]'], patchAdvice: '统一用审计口径' })
    } else if (user.includes('"thesis"')) {
      seen.mesh++
      out = JSON.stringify({ thesis: '2026H1 新签订单 9.2 亿元 [1]', highlights: ['诉讼金额约 800 万元 [1]'], valuationNote: '' })
    } else if (user.includes('安排一份')) {
      seen.outline++
      seen.directive ||= user.includes('先讲收入口径差异')
      seen.hint ||= user.includes('营业收入口径')
      out = JSON.stringify({ subtitle: '先讲清收入口径', stats: [], slides: [{ no: 1, kicker: '财务', title: '审计收入低于公司自述口径', purpose: 'p', evidence: 'e', form: 'f' }, { no: 2, kicker: '风险', title: '有一项诉讼尚未判决', purpose: 'p', evidence: 'e', form: 'f' }], gaps: [] })
    } else if (user.includes('现在写第')) {
      seen.write++
      const repair = user.includes('在底稿中找不到')
      if (repair) seen.repair++
      const bad = !(repair && fixOnRepair)
      out = JSON.stringify({ slides: [
        { no: 1, title: '审计收入低于公司自述口径', blocks: [{ type: 'points', items: [{ head: '审计口径', text: `新签订单 9.2 亿元 [1]${bad ? '，行业平均增速 38%' : ''}。` }] }], takeaway: '以审计口径为准', cites: [1], notes: '讲稿' },
        { no: 2, title: '有一项诉讼尚未判决', blocks: [{ type: 'text', text: '底稿记载存在未决诉讼 [3]。' }], takeaway: '交割前要有结论', cites: [3], notes: '讲稿' },
      ] })
    }
    rs.writeHead(200, { 'content-type': 'text/event-stream' })
    rs.end(`data: ${JSON.stringify({ choices: [{ delta: { content: out } }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const dir = await mkdtemp(join(tmpdir(), 'nb-h3-'))
  const core = await createCore({ dir, mode: 'dsh' })
  try {
    const st = await call(core, 'state')
    const p = st.projects.find(x => x.name.includes('衡远')) ?? st.projects[0]
    await call(core, 'nb.api.connect', { mode: 'local', localBaseURL: `http://127.0.0.1:${server.address().port}/v1`, localModel: 'fake' })

    const plan = await call(core, 'nb.harness.plan', { projectId: p.id, thinkingDepth: 'deep', kinds: ['ppt'], pageCount: 4, autoSubmitStage: true })
    assert.match(plan.engine, /fake/)
    assert.ok(plan.coreThesis.includes('9.2 亿元'))
    assert.equal(plan.thoughtSteps.length, 3)
    assert.equal(plan.steps.find(s => s.id === 'make_ppt').directive, '先讲收入口径差异，再讲客户集中度')
    assert.deepEqual(plan.gaps, ['缺期后回款流水'])
    assert.ok(plan.check && plan.check.unmatched.length === 0, '方案里的数字也核对过')

    // 第一稿有底稿外的数字，重写后改掉：通过并报送
    const run = await call(core, 'nb.harness.run', { projectId: p.id, planId: plan.id })
    assert.equal(seen.mesh, 2, '交叉核对调了撰写和反方两次模型')
    assert.equal(run.meshSummary.conflicts.length, 1)
    assert.equal(run.steps.find(s => s.id === 'act_mesh').status, 'done')
    assert.ok(seen.directive, '方案里给这份材料的侧重传到了撰稿提示里')
    assert.ok(seen.hint, '交叉核对发现的差异传到了撰稿提示里')
    assert.equal(seen.repair, 1, '数字对不上时重写一次')
    const q = run.qualityGate[0]
    assert.equal(q.passed, true, q.detail)
    assert.match(q.engine, /fake/)
    assert.match(q.detail, /重写后剩 0 处/)
    assert.equal(run.submissions.length, 1)

    // 重写后仍有底稿外的数字：不通过，列出数字，不报送
    fixOnRepair = false
    const run2 = await call(core, 'nb.harness.run', { projectId: p.id, thinkingDepth: 'deep', kinds: ['ppt'], pageCount: 4, autoSubmitStage: true })
    const q2 = run2.qualityGate[0]
    assert.equal(q2.passed, false)
    assert.deepEqual(q2.unmatched, ['38'])
    assert.equal(run2.steps.find(s => s.id === 'make_ppt').status, 'warn')
    assert.equal(run2.steps.find(s => s.id === 'act_verify').status, 'warn')
    assert.equal(run2.submissions.length, 0, '质检没通过的不报送')
    assert.ok(run2.anchorRate < 100)

    // 标准档不做交叉核对，也不重写
    const n = seen.repair
    const run3 = await call(core, 'nb.harness.run', { projectId: p.id, thinkingDepth: 'balanced', kinds: ['ppt'], pageCount: 4 })
    assert.equal(run3.meshSummary, null)
    assert.equal(seen.repair, n)
    assert.equal(run3.qualityGate[0].passed, false)
  } finally {
    server.close()
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})
