// Agentic Harness 端到端测试：验证可控思考蓝图规划、操作能力调用成套制作能力、全格式解压质检门禁与自动报送阶段工作项
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCore } from '../core/index.mjs'
import { planHarnessExecution, runHarnessPipeline, inferKindsFromGoal } from '../core/nb-harness.mjs'

test('Agentic Harness: 受控思考蓝图规划 -> 操作调用全套材料编译 -> 体积/页数解压质检门禁 -> 自动报送阶段工作项', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ac-harness-e2e-'))
  const core = await createCore({ dir, mode: 'dsh' })
  const req = async (op, method = 'GET', body = null) => {
    const u = method === 'GET' && body
      ? `http://127.0.0.1/?op=${op}&${new URLSearchParams(body)}`
      : `http://127.0.0.1/?op=${op}`
    const r = await core.handle(new Request(u, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json', origin: 'http://127.0.0.1' } : {},
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    }))
    const j = await r.json()
    assert.equal(r.status, 200, `${op} failed: ${JSON.stringify(j)}`)
    return j
  }

  try {
    // 1. 验证意图推断器：能根据自然语言准确路由成套成果
    const inferred = inferKindsFromGoal('请帮我准备投委会全套上会材料包和答辩闪卡', '投决阶段')
    assert.ok(inferred.includes('ic_memo') && inferred.includes('ppt') && inferred.includes('word') && inferred.includes('table') && inferred.includes('flashcards'))

    const st = await req('state')
    const p = st.projects[0]
    assert.ok(p?.id, '存在演示项目')

    // 2. HTTP 接口验证第一阶段：可控思考蓝图规划（Controllable Thinking Plan）
    const plan = await req('nb.harness.plan', 'POST', {
      projectId: p.id,
      goal: '重点核查衡远储能 C轮收入确认口径与毛利率真实性，制作立项与投决核心四件套',
      thinkingDepth: 'deep',
      kinds: ['ic_memo', 'ppt', 'word', 'table'],
      pageCount: 6,
      targetMB: 4,
      withTianyancha: true,
      autoSubmitStage: true,
    })
    assert.equal(plan.status, 'planned')
    assert.ok(plan.thoughtSteps.length >= 3, '输出至少 3 步透明可控思考步骤')
    assert.ok(plan.steps.some(s => s.tool === 'tianyancha_enrich'), '操作蓝图包含天眼查七维穿透动作')
    assert.ok(plan.steps.some(s => s.tool === 'agent_mesh_crosscheck'), '操作蓝图包含 Agent×Agent 互校动作')
    assert.equal(plan.kinds.length, 4, '锁定 4 类目标材料')

    // 3. HTTP 接口验证第二阶段：审批执行蓝图（Action -> Production -> Quality Gate -> Stage Submit）
    const run = await req('nb.harness.run', 'POST', {
      projectId: p.id,
      planId: plan.id,
      pageCount: 6,
      targetMB: 4,
      withTianyancha: true,
      autoSubmitStage: true,
    })
    assert.equal(run.status, 'completed')
    assert.equal(run.artifacts.length, 4, '完整编译产出 4 份异构材料')
    assert.equal(run.qualityGate.length, 4, '每份材料均经过解压质检门禁')
    for (const q of run.qualityGate) {
      assert.equal(q.passed, true, `${q.kind} 质检必须通过: ${q.detail}`)
    }

    const pptArt = run.artifacts.find(a => a.kind === 'ppt')
    assert.ok(pptArt && existsSync(pptArt.fullPath), 'PPT 二进制落盘存在')
    assert.ok(pptArt.bytes >= 3 * 1024 * 1024, `PPT 体积应 >= 3MB，实测 ${(pptArt.bytes / 1048576).toFixed(2)}MB`)

    // 4. 验证查询接口与历史记录持久化
    const hStat = await req('nb.harness.status', 'GET', { projectId: p.id })
    assert.ok(hStat.presets.length >= 3, '包含预设成套任务包')
    assert.ok(hStat.runs.some(r => r.id === run.id && r.status === 'completed'), '执行记录与质检报告已持久化')
  } finally {
    await core.close()
  }
})
