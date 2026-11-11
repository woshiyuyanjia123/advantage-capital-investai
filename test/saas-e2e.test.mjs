import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCore } from '../core/index.mjs'
import { generateStudioArtifact } from '../core/nb-studio-gen.mjs'
import { previewAnyArtifact, gradeDocCredibility } from '../core/nb-agent-mesh.mjs'
import { runTianyanchaDueDiligence } from '../core/nb-tianyancha.mjs'
import { runDifyWorkflow } from '../core/nb-dify-dsl.mjs'
import { submitArtifactToNode, buildFlowBoardState } from '../core/nb-flow-board.mjs'

test('一级市场机构 SaaS 全链路验收：天眼查穿透 · Agent×Agent 网状互校 · 9大类成品解压检阅 · 配额工作流 · 阶段门禁闭环', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nb-saas-e2e-'))
  const core = await createCore({ dir, mode: 'desktop', autostart: false })
  try {
    await core.kb.scanAll()
    const u = core.db.get('users', 'u_zhang')
    const p = core.db.all('projects')[1] // 衡远储能 C轮
    assert.ok(p, '测试项目存在')

    // 1. 证据信用分级与天眼查七维商事司法穿透入库
    assert.equal(gradeDocCredibility('2025审计报告.pdf').grade, 'A')
    assert.equal(gradeDocCredibility('衡远储能商业计划书BP.pdf').grade, 'C')
    const tyc = await runTianyanchaDueDiligence({ db: core.db, kb: core.kb }, u, p, { companyName: '衡远储能科技有限公司' })
    assert.ok(tyc.file?.id, '天眼查穿透底稿入库成功')
    assert.equal(gradeDocCredibility(tyc.file.name).grade, 'A')

    // 2. 9 大类投研成果全量实机生成 + 应用内全格式解压直览核验
    const kinds = ['ic_memo', 'ppt', 'word', 'table', 'mindmap', 'audio', 'video', 'flashcards', 'quiz']
    for (const k of kinds) {
      const t0 = Date.now()
      const art = await generateStudioArtifact(
        { db: core.db, kb: core.kb, org: core.org, deliverables: core.deliverables, ai: core.ai },
        u, p, { kind: k, pageCount: 6, targetMB: 4 }
      )
      console.log(`  ✔ [${k}] 生成成功: ${art.name} (${(art.bytes / 1048576).toFixed(2)}MB, ${Date.now() - t0}ms)`)
      assert.ok(art.bytes > 1000, `${k} 成品字节有效`)
      const prev = await previewAnyArtifact(art.fullPath)
      if (k === 'ppt') {
        assert.ok(art.bytes >= 3 * 1024 * 1024, `PPT 体积达标 ≥3MB (实际 ${(art.bytes / 1048576).toFixed(2)}MB)`)
        assert.equal(prev.kind, 'pptx')
        assert.equal(prev.slides.length, 6, 'PPT 页数严格等于滑块设定的 6 页')
        console.log('  [PPT 实机解压主标题抽检]:', prev.slides.map(s => `P${s.page}:${s.title}`).join(' | '))
      }
      if (k === 'word') {
        assert.equal(prev.kind, 'docx')
        assert.ok(prev.paras.length >= 25, `Word 报告内容充实 (${prev.paras.length} 段)`)
      }
      if (k === 'table') {
        assert.equal(prev.kind, 'xlsx')
        assert.ok(prev.sheets.some(s => s.name.includes('跨源矛盾对质台账')), 'Excel 包含第 5 张 Agent 跨源矛盾对质工作表')
      }
      if (k === 'ic_memo') {
        assert.equal(prev.kind, 'html')
        assert.ok(prev.content.includes('Agent × Agent 网状实时互校签章'), 'IC Memo 包含网状互校签章')
        assert.ok(prev.content.includes('投决现场压力测试沙盘'), 'IC Memo 包含动态估值敏感性滑块沙盘')
      }
    }

    // 3. 机构标准工作流（Dify DSL）与企业级月度配额扣减校验
    const wf = await runDifyWorkflow(
      { db: core.db, kb: core.kb, org: core.org, deliverables: core.deliverables, ai: core.ai },
      u, p, { workflowId: 'ac_ic_memo', pageCount: 6, targetMB: 4 }
    )
    assert.ok(wf.artifact?.name, '机构标准工作流产出成果')
    assert.ok(wf.gov.quota.usedCalls >= 1, '企业级调用配额账本准确扣减')

    // 4. 阶段门禁报送与定稿闭环校验
    const pptArt = core.db.get('kvstate', `artifacts_${p.id}`).list.find(x => x.kind === 'ppt')
    const sub = await submitArtifactToNode(
      { db: core.db, kb: core.kb, org: core.org, deliverables: core.deliverables, lifecycle: core.lifecycle, dir },
      u, p, { artifactPath: pptArt.fullPath, artifactName: pptArt.name, autoSubmitReview: true }
    )
    assert.ok(sub.version >= 1, '右下角成品成功报送至阶段工作项并生成版本号')
    const board = await buildFlowBoardState({ db: core.db, org: core.org, engine: core.engine, lifecycle: core.lifecycle, dir }, u, p)
    assert.ok(board.stages.length >= 5, '多阶段门禁看板状态完整')
    assert.ok(core.db.recent(10).length > 0, '工程化底座审计快照留痕完整')
  } finally {
    await core.close()
  }
})
