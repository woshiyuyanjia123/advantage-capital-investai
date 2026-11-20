// 分部门操作台、管理层独享全局视角、跨部门脱敏进度看板与门禁投票权限专项验收测试
import './helpers.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { boot } = await import('./helpers.mjs')

const EXPECTED_DEPT_KEY = {
  wang: 'executive', li: 'executive', liu: 'executive',
  chen: 'financial', zhangwei: 'financial', linxiao: 'financial', hejing: 'financial',
  zhao: 'industrial', qiancheng: 'industrial',
  zhoumin: 'finance',
  wulv: 'legal',
  sunlin: 'risk',
  zhengjie: 'postinv',
  fengchen: 'fund',
  admin: 'it',
}

const EXEC_USERS = new Set(['wang', 'li', 'liu'])
const ALL_USERS = Object.keys(EXPECTED_DEPT_KEY)
const FORBIDDEN_PROGRESS_KEYS = ['fields', 'amount', 'valuation', 'terms', 'fund_lp', 'trade_secret', 'desc', 'files', 'deliverables', 'members']

test('D1 九部门 15 账号各自进入专属部门操作台（独立导航、KPI、模块与标志性业务视图）', async () => {
  const t = await boot()
  try {
    const titlesByKey = new Map()
    const navByKey = new Map()
    for (const u of ALL_USERS) {
      const st = await t.call(u, 'state')
      assert.equal(st.status, 200, `${u} state 应返回 200`)
      const dp = st.body.deptProfile
      assert.ok(dp, `${u} 应包含 deptProfile`)
      assert.equal(dp.key, EXPECTED_DEPT_KEY[u], `${u} 部门工作台映射错误`)
      assert.equal(dp.isExecutive, EXEC_USERS.has(u), `${u} isExecutive 判定错误`)
      assert.ok(dp.workspaceTitle, `${u} 缺少 workspaceTitle`)
      assert.ok(Array.isArray(dp.nav) && dp.nav.length >= 4, `${u} 导航菜单数量异常`)
      assert.ok(st.body.deptBadges && typeof st.body.deptBadges === 'object', `${u} 缺少 deptBadges`)

      const ws = await t.call(u, 'dept.workspace')
      assert.equal(ws.status, 200, `${u} dept.workspace 应返回 200: ${JSON.stringify(ws.body)}`)
      assert.equal(ws.body.profile.key, EXPECTED_DEPT_KEY[u])
      assert.equal(ws.body.kpis.length, 4, `${u} 应返回 4 张 KPI 卡片`)
      assert.equal(ws.body.modules.length, 4, `${u} 应返回 4 个部门高频业务/AI 模块`)

      titlesByKey.set(dp.key, dp.workspaceTitle)
      navByKey.set(dp.key, dp.nav.map(x => `${x.view}:${x.label}`).join('|'))

      if (dp.key === 'industrial') {
        assert.equal(ws.body.industrialPhases?.length, 4, '产业投资部应返回 4 阶段流程看板')
      }
      if (dp.key === 'financial') {
        assert.equal(ws.body.financialFunnel?.length, 6, '财务投资部应返回 6 阶段股权投资漏斗')
      }
      if (dp.key === 'it') {
        assert.ok(ws.body.systemHealth && Array.isArray(ws.body.systemHealth.items), '信息技术部应返回企业开箱就绪体检')
        assert.equal(ws.body.systemHealth.items.length, 6)
      }
    }
    assert.equal(titlesByKey.size, 9, '应覆盖 9 类部门操作台')
    assert.equal(new Set(titlesByKey.values()).size, 9, '9 类部门操作台标题应互不相同')
    assert.equal(new Set(navByKey.values()).size, 9, '9 类部门左侧导航编排应互不相同')
  } finally {
    await t.close()
  }
})

test('D2 仅管理层 / 合伙人（wang/li/liu）享有全机构全局驾驶舱与全量内容权限，其余 12 账号严格 403', async () => {
  const t = await boot()
  try {
    for (const u of ALL_USERS) {
      const ex = await t.call(u, 'dept.executive')
      const ws = await t.call(u, 'dept.workspace')
      if (EXEC_USERS.has(u)) {
        assert.equal(ex.status, 200, `管理层 ${u} 应可访问 dept.executive`)
        assert.ok(ex.body.summary.totalProjects >= 8)
        assert.equal(ex.body.departments.length, 9, '管理层巡检矩阵应覆盖全部 9 个部门')
        assert.equal(ex.body.sensitiveLedger.length, ex.body.summary.totalProjects)
        assert.ok(ex.body.sensitiveLedger.some(p => p.fields && (p.fields.amount || p.fields.valuation)), '管理层敏感台账应包含金额/估值')
        assert.ok(ws.body.executive !== null, `管理层 ${u} dept.workspace.executive 不应为空`)
      } else {
        assert.equal(ex.status, 403, `非管理层 ${u} 访问 dept.executive 必须返回 403`)
        assert.equal(ws.body.executive, null, `非管理层 ${u} dept.workspace.executive 必须为 null`)
      }
    }
  } finally {
    await t.close()
  }
})

test('D3 全院脱敏项目进度看板对所有部门可见（含 0 授权项目的基金运营部），且严格零敏感字段泄露', async () => {
  const t = await boot()
  try {
    const checkUsers = ['fengchen', 'zhengjie', 'zhao', 'qiancheng', 'linxiao', 'zhoumin', 'wulv', 'sunlin', 'admin', 'wang']
    for (const u of checkUsers) {
      const st = await t.call(u, 'state')
      const authorizedIds = new Set(st.body.projects.map(p => p.id))
      const pr = await t.call(u, 'dept.progress')
      assert.equal(pr.status, 200, `${u} dept.progress 应返回 200`)
      assert.equal(pr.body.length, 8, `${u} 应能在跨部门进度看板看到全部 8 个项目的脱敏进度`)
      for (const row of pr.body) {
        assert.ok(row.id && row.name && row.stage, `${u} 进度行缺少基础标识`)
        assert.equal(typeof row.overallPct, 'number')
        assert.ok(Array.isArray(row.stageDetails) && row.stageDetails.length > 0)
        assert.equal(row.canOpen, authorizedIds.has(row.id), `${u} 项目 ${row.id} canOpen 应严格对齐 state.projects 授权`)
        for (const badKey of FORBIDDEN_PROGRESS_KEYS) {
          assert.equal(badKey in row, false, `${u} 脱敏进度行绝不能泄露字段 ${badKey}`)
        }
      }
    }
    // 明确验证基金运营部 fengchen：0 授权穿透底稿项目，但 8/8 脱敏进度全部可视且 canOpen 全为 false
    const fcState = await t.call('fengchen', 'state')
    const fcProg = await t.call('fengchen', 'dept.progress')
    assert.equal(fcState.body.projects.length, 0)
    assert.equal(fcProg.body.length, 8)
    assert.equal(fcProg.body.filter(x => x.canOpen).length, 0)
  } finally {
    await t.close()
  }
})

test('D4 产业投资四阶段流程与门禁表决权限 canVote 校验', async () => {
  const t = await boot()
  try {
    const wsInd = await t.call('zhao', 'dept.workspace')
    const phaseNames = wsInd.body.industrialPhases.map(p => `${p.no} ${p.name}`)
    assert.deepEqual(phaseNames, [
      '01 立项及承接',
      '02 尽调及承做',
      '03 落地及承销（募投）',
      '04 管理与退出',
    ])

    const wangState = await t.call('wang', 'state')
    const cg = wangState.body.projects.find(p => p.name.includes('澄光'))
    assert.ok(cg)
    const fbWang = await t.call('wang', 'nb.flow.board', undefined, { query: `&projectId=${cg.id}` })
    assert.equal(fbWang.status, 200)
    const uWang = fbWang.body.users.find(u => u.id === 'u_wang')
    const uLin = fbWang.body.users.find(u => u.id === 'u_lin')
    assert.equal(uWang?.canVote, true, '管理层合伙人 wang 应具备投决表决权限 canVote=true')
    assert.equal(uLin?.canVote, false, '分析师 linxiao 不应具备投决表决权限 canVote=false')
  } finally {
    await t.close()
  }
})
