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

test('D5 底稿、项目专属文件夹与会议录音强隔离：0 授权基金部与无 material.view 的 IT 部门零越权', async () => {
  const t = await boot()
  try {
    await t.core.kb.scanAll()
    const fcFiles = await t.call('fengchen', 'files')
    assert.equal(fcFiles.status, 200)
    const leaked = fcFiles.body.filter(f => /(?:^|\/)(?:项目资料|项目专属文件夹|会议录音)(?:\/|$)/.test(f.rel) || f.mountId === 'm_ws')
    assert.deepEqual(leaked, [], '基金运营部（0授权项目）绝不能在资料库看到项目成品夹或会议录音')

    const adminFiles = await t.call('admin', 'files')
    assert.equal(adminFiles.status, 200)
    assert.equal(adminFiles.body.length, 0, '信息技术部（无 material.view）不应返回任何业务底稿')

    // 审计日志与企业开箱体检强门禁
    const fcArch = await t.call('fengchen', 'nb.arch.status')
    assert.equal(fcArch.status, 200)
    assert.deepEqual(fcArch.body.recentChanges, [], '非审计岗位调用 nb.arch.status 不应返回全院变更记录')
    const fcEnt = await t.call('fengchen', 'nb.enterprise.status')
    assert.equal(fcEnt.status, 403, '非管理层/非管理员调用 nb.enterprise.status 必须返回 403')

    // 管理层部门新增普通 staff 助理不得误获管理层驾驶舱权限
    const addRes = await t.call('admin', 'user.save', { name: '管理层助理', username: 'mgmt_staff', deptId: 'd_mgmt', roles: ['staff'], title: '行政助理' })
    assert.equal(addRes.status, 200)
    const staffExec = await t.call('mgmt_staff', 'dept.executive')
    assert.equal(staffExec.status, 403, 'd_mgmt 下非合伙人岗位绝不能越权访问管理层驾驶舱')
  } finally {
    await t.close()
  }
})

test('D6 敏感字段二次读取/成果编制/成品预览全链路脱敏与无编辑权拦截', async () => {
  const t = await boot()
  try {
    await t.core.kb.scanAll()
    const zwState = await t.call('zhangwei', 'state')
    const cg = zwState.body.projects.find(p => p.name.includes('澄光'))
    assert.ok(cg)

    // 1) 提取缓存二次读取必须按查看者权限重新脱敏
    const exZw = await t.call('zhangwei', 'extract.run', { projectId: cg.id, schema: 'bp' })
    assert.equal(exZw.status, 200)
    const exLin = await t.call('linxiao', 'extraction', undefined, { query: `&id=${exZw.body.id}` })
    assert.equal(exLin.status, 200)
    for (const key of ['本轮融资金额', '投前估值']) {
      const row = exLin.body.rows.find(r => r.key === key)
      assert.equal(row?.status, 'hidden', `分析师读取他人提取记录时 ${key} 必须脱敏`)
      assert.equal(row?.value, null)
    }

    // 2) 机密底稿生成的 Studio 成品保持机密密级，低密级分析师不可预览，无编辑权合伙人不可调用编制
    const zwArt = await t.call('zhangwei', 'nb.studio.make', { projectId: cg.id, kind: 'word' })
    assert.equal(zwArt.status, 200)
    assert.ok((t.core.kb.file(zwArt.body.fileId)?.level ?? 0) >= 2, '基于机密底稿生成的成品密级不得降级')
    const linPrev = await t.call('linxiao', 'nb.artifact.preview', undefined, { query: `&projectId=${cg.id}&name=${encodeURIComponent(zwArt.body.name)}` })
    assert.equal(linPrev.status, 403, '低密级分析师不应预览机密成品')

    // 3) 分析师基于内部底稿自制成果时，项目登记的金额/估值/对赌条款不得泄露进成品
    await t.call('linxiao', 'nb.source.paste', { projectId: cg.id, title: '内部调研笔记', text: '澄光半导体已通过客户产线验证，客户导入顺利。', level: 1 })
    const linArt = await t.call('linxiao', 'nb.studio.make', { projectId: cg.id, kind: 'word' })
    assert.equal(linArt.status, 200)
    const selfPrev = await t.call('linxiao', 'nb.artifact.preview', undefined, { query: `&projectId=${cg.id}&name=${encodeURIComponent(linArt.body.name)}` })
    assert.equal(selfPrev.status, 200)
    const joined = (selfPrev.body.paras ?? []).join('\n')
    assert.equal(joined.includes('8000 万元'), false, '分析师自制成果不得泄露项目拟投金额')
    assert.equal(joined.includes('投前 30 亿元'), false, '分析师自制成果不得泄露项目投前估值')
    assert.equal(joined.includes('8% 年化回购'), false, '分析师自制成果不得泄露项目回购条款')

    // 4) 无 deliverable.edit 的合伙人不可通过 Studio/Harness/FlowSubmit 绕过编辑权限
    const wangWord = await t.call('wang', 'nb.studio.make', { projectId: cg.id, kind: 'word' })
    const wangTable = await t.call('wang', 'nb.studio.make', { projectId: cg.id, kind: 'table' })
    assert.equal(wangWord.status, 403)
    assert.equal(wangTable.status, 403)

    // 5) SaaS 模式禁止 nb.folder.open 任意路径打开
    const openHack = await t.call('zhangwei', 'nb.folder.open', { projectId: cg.id, filePath: 'C:\\Windows\\System32\\calc.exe' })
    assert.equal(openHack.status, 403)
  } finally {
    await t.close()
  }
})

test('D7 阶段工作项 role 归属与 IT 部门重新扫描权限校验', async () => {
  const t = await boot()
  try {
    const zwState = await t.call('zhangwei', 'state')
    const cg = zwState.body.projects.find(p => p.name.includes('澄光'))
    const fb = await t.call('wulv', 'nb.flow.board', undefined, { query: `&projectId=${cg.id}` })
    assert.equal(fb.status, 200)
    const prep = fb.body.stages.find(s => s.id === 's_prep')
    const nda = prep?.works?.find(w => w.type === 'NDA')
    assert.equal(nda?.role, 'legal', '立项准备阶段 NDA 工作项应标注 legal 部门职责')

    // IT 管理员具备 kb.mount，应允许触发目录重扫；动态岗位数应与角色表真实数量一致
    const rescan = await t.call('admin', 'mount.rescan', { id: 'm_nas' })
    assert.equal(rescan.status, 200)
    const wsIt = await t.call('admin', 'dept.workspace')
    const staffKpi = wsIt.body.kpis.find(k => k.label === '机构在册人员')
    assert.match(staffKpi?.sub ?? '', new RegExp(`${t.core.db.all('roles').length} 类岗位`))
  } finally {
    await t.close()
  }
})
