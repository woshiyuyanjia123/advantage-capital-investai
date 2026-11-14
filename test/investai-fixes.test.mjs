// 回归测试：覆盖 AI 路由、勾选底稿上下文、行内改写护栏、Studio 绑定、会话隔离与 RichDeck 覆盖保护。
import './helpers.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { boot, probeModel } = await import('./helpers.mjs')
const { startServer, DEMO_ACCOUNTS } = await import('../core/http.mjs')
const { buildFollowUps } = await import('../core/nb-studio-gen.mjs')

const quiet = () => {}

function makeSmartProbe() {
  const seen = []
  return {
    seen,
    adapter: {
      kind: 'probe',
      info: async () => ({ ok: true, label: '探针云端模型' }),
      models: async () => [],
      async *stream(o) {
        seen.push(JSON.stringify(o))
        if (String(o?.system ?? '').includes('表格') || String(o?.user ?? '').includes('sheet')) {
          yield JSON.stringify({
            sheetName: 'AI结构化汇总',
            columns: ['项目指标', '数值', '来源'],
            rows: [['营业收入', '65,300万元', '底稿']],
            notes: ['测试合成表'],
          })
          return
        }
        yield '结合底稿核验后的改写段落：毛利率与营收口径已在底稿中逐项核对 [1]。'
      },
      async turn(o) {
        seen.push(JSON.stringify(o))
        return { text: '探针结合勾选底稿作答 [1]。', reasoning: '', toolCalls: [], replay: null }
      },
    },
  }
}

async function liftSensitiveLevel(call, level = 4, restoreAs = 'zhangwei') {
  const st = (await call(null, 'state')).body
  const cur = st.settings?.models ?? {}
  const r = await call('admin', 'settings.update', { section: 'models', value: { ...cur, sensitiveLevel: level } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  if (restoreAs) await call(restoreAs, 'state')
  return r
}

test('F1 SaaS nb.api.connect 自动放宽密级上限、支持 custom 切回 auto，且 status 返回 confidentialBlocked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'investai-f1-'))
  const s = await startServer({ dir, port: 0, mode: 'saas', demoAccounts: true, log: quiet })
  try {
    const accounts = JSON.parse(await readFile(DEMO_ACCOUNTS, 'utf8')).accounts
    const admin = accounts.find(a => a.username === 'admin')
    const lr = await fetch(`${s.url}/api/investai?op=login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: admin.username, password: admin.password }),
    })
    assert.equal(lr.status, 200)
    const cookie = lr.headers.get('set-cookie')?.split(';')[0]
    const post = (op, body) => fetch(`${s.url}/api/investai?op=${op}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async r => ({ status: r.status, body: await r.json() }))
    const getOp = op => fetch(`${s.url}/api/investai?op=${op}`, { headers: { cookie } }).then(async r => ({ status: r.status, body: await r.json() }))

    // 1. 切到 custom（SaaS 模式下非 local 同样自动放宽密级上限）
    const c1 = await post('nb.api.connect', {
      routeMode: 'hybrid',
      source: 'custom',
      customBaseURL: 'https://api.siliconflow.cn/v1',
      customModel: 'Qwen/Qwen2.5-72B',
      apiKey: 'sk-test-silicon-123456',
    })
    assert.equal(c1.status, 200)
    assert.ok(c1.body.sensitiveLevel >= 3, `SaaS 模式也应放宽密级上限，实得 ${c1.body.sensitiveLevel}`)
    const st1 = await getOp('state')
    assert.equal(st1.body.settings?.models?.external?.source, 'custom')
    assert.equal(st1.body.settings?.models?.external?.customBaseURL, 'https://api.siliconflow.cn/v1')

    // 2. 从 custom 切回 auto（clearCustom）
    const c2 = await post('nb.api.connect', {
      routeMode: 'hybrid',
      source: 'auto',
      clearCustom: true,
      sensitiveLevel: 2,
    })
    assert.equal(c2.status, 200)
    const st2 = await getOp('state')
    assert.equal(st2.body.settings?.models?.external?.source, 'auto')
    assert.equal(st2.body.settings?.models?.external?.customBaseURL, '')
    assert.equal(typeof st2.body.model?.confidentialBlocked, 'boolean')
    // 3. 后台 AI 策略页保存 secret.set(deepseekApiKey) 时，若未配本地模型且仍为默认 sensitiveLevel=2，自动放宽至允许处理项目底稿
    await post('nb.api.connect', { mode: 'hybrid', source: 'auto', clearCustom: true, sensitiveLevel: 2 })
    const sBefore = await getOp('state')
    assert.equal(sBefore.body.settings?.models?.sensitiveLevel, 2)
    const secSet = await post('secret.set', { key: 'deepseekApiKey', value: 'sk-admin-panel-1234567890' })
    assert.equal(secSet.status, 200)
    const sAfter = await getOp('state')
    assert.equal(sAfter.body.settings?.models?.sensitiveLevel, 4, '后台保存外部 Key 后应自动放宽默认密级阻塞')
  } finally {
    await s.close()
    await rm(dir, { recursive: true, force: true })
  }

  // 验证有外部模型但无本地模型且 sensitiveLevel <= 2 时 confidentialBlocked === true
  const probe = probeModel()
  const app = await boot({ llm: probe.adapter })
  try {
    const st = (await app.call(null, 'state')).body
    assert.equal(st.model.ok, true)
    assert.equal(st.model.confidentialBlocked, true)
    assert.match(st.model.note, /离线引擎/)
  } finally {
    await app.close()
  }
})

test('F2 runAgent 把前端勾选的 fileIds 注入上下文供智能体优先读取', async () => {
  const probe = probeModel()
  const { call, project, wait, close } = await boot({ llm: probe.adapter })
  try {
    const p = project('衡远')
    await liftSensitiveLevel(call, 4)
    const fs = await call(null, 'files')
    const picked = fs.body.find(f => !f.company || f.company.includes('衡远')) ?? fs.body[0]
    assert.ok(picked?.id)
    const r = await call(null, 'chat', {
      text: '总结关键风险',
      context: { projectId: p.id, fileIds: [picked.id] },
    })
    assert.equal(r.status, 200)
    const job = await wait(r.body.job.id)
    assert.equal(job.status, 'done')
    const joined = probe.seen.join('\n')
    assert.match(joined, /用户勾选的底稿/)
    assert.ok(joined.includes(picked.id), '应把勾选的 fileId 注入上下文')
  } finally {
    await close()
  }
})

test('F3 inlineCoCreateRewrite 拒绝已定稿且不退回草稿；无模型清晰报错；有模型结合勾选底稿改写', async () => {
  const offlineApp = await boot()
  try {
    const p = offlineApp.project('衡远')
    const pd = await offlineApp.call(null, 'project', undefined, { query: `&id=${p.id}` })
    assert.equal(pd.status, 200)
    const finalDoc = pd.body.deliverables.find(d => d.status === 'final')
    assert.ok(finalDoc, '演示数据中衡远储能应存在已定稿交付物')

    // 1. 已定稿拒绝改写且状态保持 final
    const rFinal = await offlineApp.call(null, 'nb.os.inline', {
      projectId: p.id,
      deliverableId: finalDoc.id,
      fullText: '# 标题\n\n原始定稿段落。',
      selectedText: '原始定稿段落。',
      instruction: '改写精炼',
    })
    assert.ok(rFinal.status >= 400, `已定稿应拒绝改写，实得 ${rFinal.status}`)
    const afterFinal = await offlineApp.call(null, 'deliverable', undefined, { query: `&id=${finalDoc.id}` })
    assert.equal(afterFinal.body.status, 'final', '拒绝后 deliverables.status 仍应保持 final')

    // 2. 草稿无模型应返回 503（不编造假文本）
    const ensured = await offlineApp.call(null, 'deliverable.ensure', { projectId: p.id, type: '尽调报告' })
    const rNoModel = await offlineApp.call(null, 'nb.os.inline', {
      projectId: p.id,
      deliverableId: ensured.body.id,
      workType: '尽调报告',
      fullText: '# 尽调报告\n\n第一段待改写内容。',
      selectedText: '第一段待改写内容。',
      instruction: '结合底稿改写',
    })
    assert.equal(rNoModel.status, 503)
  } finally {
    await offlineApp.close()
  }

  // 3. 有模型结合勾选底稿改写
  const smart = makeSmartProbe()
  const onlineApp = await boot({ llm: smart.adapter })
  try {
    const p = onlineApp.project('衡远')
    await liftSensitiveLevel(onlineApp.call, 4)
    const up = await onlineApp.call('zhangwei', 'kb.upload', {
      projectId: p.id,
      name: '补充底稿说明.txt',
      level: 1,
      data: Buffer.from('核心客户毛利率 28%，同比增长 5%。', 'utf8').toString('base64'),
    })
    assert.equal(up.status, 200, JSON.stringify(up.body))
    const ensured = await onlineApp.call('zhangwei', 'deliverable.ensure', { projectId: p.id, type: '尽调报告' })
    const rOk = await onlineApp.call('zhangwei', 'nb.os.inline', {
      projectId: p.id,
      deliverableId: ensured.body.id,
      workType: '尽调报告',
      fullText: '# 尽调报告\n\n第一段待改写内容。',
      selectedText: '第一段待改写内容。',
      instruction: '补充量化数据',
      fileIds: [up.body.id],
    })
    assert.equal(rOk.status, 200, JSON.stringify(rOk.body))
    assert.match(rOk.body.markdown, /结合底稿核验后的改写段落/)
    assert.ok(smart.seen.join('\n').includes('补充底稿说明.txt'))
  } finally {
    await onlineApp.close()
  }
})

test('F4 nb.studio.make 空 fileIds 返回 400、s_ic 不覆盖已定稿立项报告、table 调用模型、buildFollowUps 动态变化', async () => {
  const smart = makeSmartProbe()
  const { call, core, close } = await boot({ llm: smart.adapter })
  try {
    await liftSensitiveLevel(call, 4)
    const st = (await call(null, 'state')).body
    const p = st.projects.find(x => x.name.includes('衡远'))
    const pIc = st.projects.find(x => x.stage === '投资决策') ?? p

    // 1. 显式传空 fileIds: [] 报错 400
    const emptyRes = await call(null, 'nb.studio.make', { projectId: p.id, kind: 'ppt', fileIds: [] })
    assert.equal(emptyRes.status, 400)

    // 2. s_ic 阶段生成 PPT 时保留已定稿立项报告，优先绑定当期投决会材料
    const beforeDls = core.db.find('deliverables', d => d.projectId === pIc.id && d.type === '立项报告')
    const finalBefore = beforeDls.find(d => d.status === 'final')
    const pptRes = await call(null, 'nb.studio.make', { projectId: pIc.id, kind: 'ppt' })
    assert.equal(pptRes.status, 200, JSON.stringify(pptRes.body))
    if (finalBefore) {
      const afterFinal = core.db.get('deliverables', finalBefore.id)
      assert.equal(afterFinal.status, 'final', '已有定稿立项报告不得因 Studio 生成而被退回 draft')
    }
    if (pIc.stageId === 's_ic') {
      assert.equal(pptRes.body.workType, '投决会材料')
    }

    // 3. table 调用 authorTable 模型路径
    smart.seen.length = 0
    const tblRes = await call(null, 'nb.studio.make', { projectId: p.id, kind: 'table', prompt: '输出核心指标sheet' })
    assert.equal(tblRes.status, 200, JSON.stringify(tblRes.body))
    assert.ok(smart.seen.length >= 1, 'table 应调用 authorTable')

    // 4. buildFollowUps 随问答和缺项变化
    const f1 = buildFollowUps({ name: p.name, stage: '尽职调查' }, '请排查应收账款回款风险', ['审计报告.pdf'], '应收账款存在未核对项。', ['尽调报告'])
    const f2 = buildFollowUps({ name: p.name, stage: '投资决策' }, '估值倍数与对赌回购条款如何设计？', ['TS草案.docx'], '投前估值45亿。', ['投决会材料'])
    assert.equal(f1.length, 3)
    assert.equal(f2.length, 3)
    assert.notDeepEqual(f1, f2)
  } finally {
    await close()
  }
})

test('F5 对话历史按项目隔离，且 chat.clear 仅清空当前项目', async () => {
  const probe = probeModel()
  const { call, close } = await boot({ llm: probe.adapter })
  try {
    const st = (await call(null, 'state')).body
    assert.ok(st.projects.length >= 2)
    const [pA, pB] = st.projects
    await liftSensitiveLevel(call, 4)

    const rA = await call(null, 'chat', { text: '只问项目A的独特问题ALPHA', context: { projectId: pA.id } })
    assert.equal(rA.status, 200)
    const rB = await call(null, 'chat', { text: '只问项目B的独特问题BETA', context: { projectId: pB.id } })
    assert.equal(rB.status, 200)

    const hA = await call(null, 'chat.history', undefined, { query: `&projectId=${pA.id}` })
    const hB = await call(null, 'chat.history', undefined, { query: `&projectId=${pB.id}` })
    assert.ok(hA.body.some(m => m.text?.includes('ALPHA')))
    assert.ok(!hA.body.some(m => m.text?.includes('BETA')))
    assert.ok(hB.body.some(m => m.text?.includes('BETA')))
    assert.ok(!hB.body.some(m => m.text?.includes('ALPHA')))

    const clr = await call(null, 'chat.clear', { projectId: pA.id })
    assert.equal(clr.status, 200)
    const hA2 = await call(null, 'chat.history', undefined, { query: `&projectId=${pA.id}` })
    const hB2 = await call(null, 'chat.history', undefined, { query: `&projectId=${pB.id}` })
    assert.equal(hA2.body.length, 0)
    assert.ok(hB2.body.some(m => m.text?.includes('BETA')))
  } finally {
    await close()
  }
})

test('F6 nb.slides.save 对 richDeck 版本返回 409，传 confirmOverwrite: true 后允许覆盖保存', async () => {
  const { call, core, project, close } = await boot()
  try {
    const p = project('衡远')
    const mk = await call(null, 'nb.studio.make', { projectId: p.id, kind: 'ppt' })
    assert.equal(mk.status, 200, JSON.stringify(mk.body))
    const d = core.db.get('deliverables', mk.body.deliverableId)
    assert.ok(d, '应产生对应的 PPTX 交付物')
    if (d.status === 'final') {
      await call(null, 'deliverable.reopen', { id: d.id, reason: '回归测试覆盖检查' })
    }

    const slidesInfo = await call(null, 'nb.slides', undefined, { query: `&id=${d.id}` })
    assert.equal(slidesInfo.status, 200)
    assert.equal(slidesInfo.body.richDeck, true)

    const r409 = await call(null, 'nb.slides.save', {
      projectId: p.id,
      deliverableId: d.id,
      slides: [{ title: '简版覆盖页', bullets: ['测试'] }],
    })
    assert.equal(r409.status, 409)

    const rOk = await call(null, 'nb.slides.save', {
      projectId: p.id,
      deliverableId: d.id,
      confirmOverwrite: true,
      slides: [{ title: '确认覆盖页', bullets: ['已确认覆盖'] }],
    })
    assert.equal(rOk.status, 200, JSON.stringify(rOk.body))
  } finally {
    await close()
  }
})
