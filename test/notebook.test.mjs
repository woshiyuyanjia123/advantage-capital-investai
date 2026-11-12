import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCore } from '../core/index.mjs'

const req = (op, body, method = body ? 'POST' : 'GET') => new Request(
  `http://127.0.0.1/api/investai?${new URLSearchParams(method === 'GET' ? { op, ...(body || {}) } : { op })}`,
  method === 'POST' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {},
)
const call = async (core, op, body, method) => (await core.handle(req(op, body, method))).json()

test('NotebookLM × FDE: flow %, plugin submit, local PPT/Word/Audio studio, notes boards & local API', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nb-fde-'))
  const core = await createCore({ dir, mode: 'dsh' })
  try {
    const st = await call(core, 'state')
    assert.ok(st.projects.length > 0)
    const p = st.projects[0]
    assert.equal(typeof p.flow.overallPct, 'number')
    assert.ok(Array.isArray(p.flow.stageDetails) && p.flow.stageDetails.length > 0)

    const d = await call(core, 'deliverable.ensure', { projectId: p.id, type: '立项报告' })
    const saved = await call(core, 'nb.slides.save', { projectId: p.id, deliverableId: d.id, title: '测试汇报', slides: [{ title: '核心投资亮点', bullets: ['毛利率提升至 42%', '订单饱满'] }] })
    assert.equal(saved.version.v, 1)
    const slides = await call(core, 'nb.slides', { id: d.id }, 'GET')
    assert.equal(slides.slides[0].title, '核心投资亮点')

    const sub = await call(core, 'nb.plugin.submit', { projectId: p.id, deliverableId: d.id, channel: 'review-submit' })
    assert.equal(sub.ok, true)

    const notes = await call(core, 'nb.note.save', { projectId: p.id, title: '尽调冲突看板笔记', content: '# 核查结论\n- 收入口径一致', board: 'evidence' })
    assert.ok(notes.some(n => n.title === '尽调冲突看板笔记'))

    const asr = await call(core, 'nb.asr', { projectId: p.id, rawText: '管理层介绍了立项会和尽调报告进度。下一步复核估值模型。' })
    assert.ok(asr.segments.length >= 1)

    const apiSt = await call(core, 'nb.api.connect', { mode: 'local', localBaseURL: 'http://127.0.0.1:11434/v1', localModel: 'qwen2.5:14b' })
    assert.equal(apiSt.mode, 'local')

    const det0 = await call(core, 'project', { id: p.id }, 'GET')
    assert.equal(det0.followUps.length, 3)
    const pickedIds = det0.files.slice(0, 2).map(f => f.id)
    const pptArt = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'ppt', fileIds: pickedIds })
    assert.ok(pptArt.bytes > 20000 && pptArt.check.unmatched.length === 0, '成品里的数字都能在底稿里找到')
    assert.equal(pptArt.sourceCount, pickedIds.length)
    const det1 = await call(core, 'project', { id: p.id }, 'GET')
    assert.ok(det1.artifacts.items.some(a => a.name === pptArt.name))

    const fbState = await call(core, 'nb.flow.board', { projectId: p.id }, 'GET')
    assert.ok(fbState.stages.length > 0 && fbState.users.length > 0)
    const fbSub = await call(core, 'nb.flow.submit', { projectId: p.id, artifactPath: pptArt.fullPath, artifactName: pptArt.name, editedText: '# 人工微调立项汇报\n\n- 核实无误，自主提交节点', autoSubmitReview: true })
    assert.equal(fbSub.ok, true)
  } finally {
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})
