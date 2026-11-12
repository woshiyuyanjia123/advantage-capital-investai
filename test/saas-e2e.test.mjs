// 全流程：天眼查工商核查 → 九类成品生成并能打开 → 按模板执行并计次 → 报送到阶段工作项 → 预览和状态接口。
import './helpers.mjs' // 先把密钥文件指到临时目录，再加载后端
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { createCore } = await import('../core/index.mjs')
const { previewAnyArtifact, gradeDocCredibility } = await import('../core/nb-agent-mesh.mjs')

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

test('E1 全流程：没有模型时每一步都能走通，产出的内容只来自底稿', async () => {
  // 假的天眼查接口：只认约定的 Token，返回一条工商基本信息
  const tyc = createServer((rq, rs) => {
    rs.writeHead(200, { 'content-type': 'application/json' })
    if (rq.headers.authorization !== 'test-token') return rs.end(JSON.stringify({ error_code: 300002, reason: '账号失效' }))
    rs.end(JSON.stringify({ error_code: 0, reason: 'ok', result: { name: '衡远储能科技股份有限公司', creditCode: '91440300TEST00001X', legalPersonName: '张某', regStatus: '存续', regCapital: '12000万人民币', estiblishTime: 1489939200000, regLocation: '广东省深圳市南山区' } }))
  })
  await new Promise(r => tyc.listen(0, '127.0.0.1', r))
  process.env.TIANYANCHA_BASE_URL = `http://127.0.0.1:${tyc.address().port}`
  const dir = await mkdtemp(join(tmpdir(), 'nb-e2e-'))
  const core = await createCore({ dir, mode: 'dsh' })
  try {
    const st = await call(core, 'state')
    const p = st.projects.find(x => x.name.includes('衡远')) ?? st.projects[0]

    // 1. 底稿分级只看文件名
    assert.equal(gradeDocCredibility('2025审计报告.pdf').grade, 'A')
    assert.equal(gradeDocCredibility('衡远储能商业计划书BP.pdf').grade, 'C')
    assert.equal(gradeDocCredibility('访谈纪要.md').grade, 'B')

    // 2. 天眼查：没有 Token 报 400 且不生成底稿；Token 无效时把接口的原因报出来；有效时只存接口返回的字段
    const none = await raw(core, 'nb.tyc.query', { projectId: p.id })
    assert.equal(none.status, 400)
    const bad = await raw(core, 'nb.tyc.query', { projectId: p.id, apiToken: 'wrong' })
    assert.equal(bad.status, 502)
    assert.match((await bad.json()).error, /账号失效/)
    const ok = await call(core, 'nb.tyc.query', { projectId: p.id, apiToken: 'test-token' })
    assert.ok(ok.file?.id && ok.fields === 7)
    assert.ok(ok.markdown.includes('91440300TEST00001X') && ok.markdown.includes('2017-03-19') && ok.markdown.includes('司法风险：未查询'))
    for (const junk of ['权属清晰', '零严重违法', '无拒付记录', '信用记录良好']) assert.ok(!ok.markdown.includes(junk), `不应出现没查过的结论「${junk}」`)

    // 3. 九类成品都能生成、能打开，数字都能在底稿里找到
    const kinds = ['ic_memo', 'ppt', 'word', 'table', 'mindmap', 'audio', 'video', 'flashcards', 'quiz']
    const made = {}
    for (const k of kinds) {
      const art = made[k] = await call(core, 'nb.studio.make', { projectId: p.id, kind: k, pageCount: 6 })
      assert.equal(art.engine, '底稿摘编', k)
      if (art.check) assert.deepEqual(art.check.unmatched, [], `${k}：${JSON.stringify(art.check.unmatched)}`)
      const prev = await previewAnyArtifact(art.fullPath)
      if (k === 'ppt') { assert.equal(prev.kind, 'pptx'); assert.ok(prev.slides.length >= 3); assert.ok(art.bytes < 1024 * 1024) }
      if (k === 'word' || k === 'ic_memo') { assert.equal(prev.kind, 'docx'); assert.ok(prev.paras.length >= 8, `${k} 有 ${prev.paras.length} 段`) }
      if (k === 'table') { assert.equal(prev.kind, 'xlsx'); assert.ok(prev.sheets.some(s => s.name === '数据摘录')) }
      if (prev.kind === 'html') assert.ok(prev.content.includes('未调用模型'))
    }
    const pptText = (await previewAnyArtifact(made.ppt.fullPath)).slides.flatMap(s => s.texts).join(' ')
    assert.ok(pptText.includes('91440300TEST00001X') || pptText.includes('天眼查工商基本信息'), '刚存进来的天眼查底稿进入了成品')

    // 4. 预览接口只认本项目登记过的成品
    const pv = await call(core, 'nb.artifact.preview', { projectId: p.id, fp: made.word.fullPath }, 'GET')
    assert.equal(pv.kind, 'docx')
    assert.equal(pv.artifact.engine, '底稿摘编')
    assert.equal((await raw(core, 'nb.artifact.preview', { projectId: p.id, fp: join(dir, `${p.id}`, 'investai.db') }, 'GET')).status, 403)

    // 5. 模板：编制要求可以改，次数从 0 开始按实际执行累计
    const t0 = await call(core, 'nb.dify.templates', { projectId: p.id }, 'GET')
    assert.equal(t0.quota.usedCalls, 0)
    assert.ok(t0.templates.every(t => t.usageCount === 0))
    assert.ok(t0.sampleYaml.includes('反方意见'))
    const wf = await call(core, 'nb.dify.run', { projectId: p.id, workflowId: 'ac_ic_ppt', brief: '只讲诉讼风险', pageCount: 6, autoSubmit: true })
    assert.ok(wf.artifact.name.endsWith('.pptx'))
    assert.equal(wf.gov.quota.usedCalls, 1)
    assert.equal(wf.gov.templates.find(t => t.id === 'ac_ic_ppt').usageCount, 1)
    assert.deepEqual(wf.trace.map(t => t.node), ['读取底稿', '撰写', '数字核对', '报送'])
    assert.equal(wf.submission.workType, '立项报告')

    // 6. 报送：可以指定报送到哪个工作项
    const sub = await call(core, 'nb.flow.submit', { projectId: p.id, artifactPath: made.word.fullPath, artifactName: made.word.name, autoSubmitReview: true })
    assert.equal(sub.workType, '尽调报告')
    const board = await call(core, 'nb.flow.board', { projectId: p.id }, 'GET')
    assert.ok(board.stages.length >= 5)

    // 7. 状态接口报的是实际情况：没有模型就是没有
    const arch = await call(core, 'nb.arch.status', { projectId: p.id }, 'GET')
    assert.equal(arch.layers.length, 5)
    assert.equal(arch.layers.find(l => l.layer === '模型').ok, false)
    assert.match(arch.layers.find(l => l.layer === '底稿与文件').desc, /份底稿/)
  } finally {
    delete process.env.TIANYANCHA_BASE_URL
    tyc.close()
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})
