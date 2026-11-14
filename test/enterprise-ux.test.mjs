// 企业级落地与便捷交互专项验收测试：无公司项目底稿隔离、多源速采与 SSRF 拦截、带材料一键立项、OA 待办催办交接、开箱体检与批量导入、前端死按钮与品牌纯净扫描
import './helpers.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { boot } = await import('./helpers.mjs')
const { createCore } = await import('../core/index.mjs')
const { assertPublicHttpUrl, htmlToCleanMarkdown } = await import('../core/nb-enterprise.mjs')

test('U1 无关联公司项目不会串入全机构其他公司的机密底稿，且本项目粘贴底稿可精准归属', async () => {
  const t = await boot()
  try {
    const created = await t.call('zhangwei', 'project.create', { name: '独立测试专项', businessType: 'financial' })
    assert.equal(created.status, 200)
    const pid = created.body.id
    const detail0 = await t.call('zhangwei', 'project', undefined, { query: `&id=${pid}` })
    assert.equal(detail0.status, 200)
    assert.equal(detail0.body.files.length, 0, '无关联公司的空项目不应混入其他公司底稿')

    const pasted = await t.call('zhangwei', 'nb.source.paste', {
      projectId: pid,
      title: '管理层收入确认沟通要点',
      sourceKind: '沟通纪要',
      text: '2025年经审计主营业务收入为 18,600 万元，毛利率 41.5%，按终验单确认收入。',
    })
    assert.equal(pasted.status, 200, JSON.stringify(pasted.body))
    const detail1 = await t.call('zhangwei', 'project', undefined, { query: `&id=${pid}` })
    assert.equal(detail1.body.files.length, 1)
    assert.match(detail1.body.files[0].name, /管理层收入确认沟通要点/)
  } finally {
    await t.close()
  }
})

test('U2 网页链接速采：严格拦截内网/回环 SSRF，公网 HTML 自动剥离脚本并转存为溯源底稿', async () => {
  await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1:8080/admin'), /本机或内网|内网或保留/)
  await assert.rejects(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data'), /内网或保留/)
  await assert.rejects(() => assertPublicHttpUrl('http://192.168.1.10/secret'), /内网或保留/)
  await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), /http/)
  await assert.rejects(() => assertPublicHttpUrl('https://intranet.example.com', async () => [{ address: '10.0.0.8', family: 4 }]), /内网或保留/)

  const cleaned = htmlToCleanMarkdown('<html><head><title>某企业中标公告</title><script>alert(1)</script></head><body><h1>中标结果公示</h1><p>中标金额 5,280 万元。</p></body></html>')
  assert.equal(cleaned.title, '某企业中标公告')
  assert.ok(!cleaned.body.includes('alert(1)'))
  assert.ok(cleaned.body.includes('5,280 万元'))

  const dir = await mkdtemp(join(tmpdir(), 'investai-url-'))
  const core = await createCore({
    dir: join(dir, 'data'),
    mode: 'desktop',
    autostart: false,
    fetchImpl: async url => new Response('<html><head><title>公开产线投产报道</title></head><body><article><h2>二期产线贯通</h2><p>年产能达到 12 GWh，良率 96.4%。</p></article></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  })
  await core.ready
  try {
    // 用公网 IP 字面量绕过离线测试环境的外部 DNS 依赖，同时验证公网地址放行
    const cg = core.db.one('projects', p => p.name.includes('澄光'))
    const r = await core.handle(new Request('http://127.0.0.1/api/investai?op=nb.source.url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: cg.id, url: 'https://93.184.216.34/news/line2' }),
    }))
    assert.equal(r.status, 200)
    const body = await r.json()
    assert.equal(body.title, '公开产线投产报道')
    assert.ok(body.file?.id)
  } finally {
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('U3 带底稿一键快速立项：自动识别企业简称、行业与轮次，一步完成建档与底稿入库', async () => {
  const t = await boot()
  try {
    const bpText = '# 星海固态电池 B轮融资概要\n2025年营收 2.4 亿元，研发占比 18%。'
    const res = await t.call('zhangwei', 'nb.project.quick', {
      files: [{ name: '星海固态电池_B轮_商业计划书_2026.md', data: Buffer.from(bpText, 'utf8').toString('base64') }],
      pastedText: '创始人来自头部电池研究院，已完成中试线交付，本轮拟融资 1.5 亿元。',
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.uploadedCount, 2)
    assert.equal(res.body.fileIds.length, 2)
    assert.match(res.body.projectName, /星海固态电池/)

    const p = t.core.db.get('projects', res.body.projectId)
    assert.equal(p.fields.round, 'B轮')
    const comp = t.core.db.get('companies', p.companyId)
    assert.equal(comp.industry, '固态电池')
  } finally {
    await t.close()
  }
})

test('U4 企业 OA 门户待办聚合、一键催办冷却保护与项目交接简报落盘', async () => {
  const t = await boot()
  try {
    const ib = await t.call('zhangwei', 'nb.oa.inbox')
    assert.equal(ib.status, 200)
    assert.equal(typeof ib.body.total, 'number')
    assert.ok(Array.isArray(ib.body.mySteps))

    const cg = t.project('澄光')
    const work = cg.works.find(w => w.status !== 'done' && w.assignee)
    assert.ok(work, '应存在待推进工作项')

    const n1 = await t.call('zhangwei', 'nb.oa.nudge', { projectId: cg.id, workId: work.id, note: '请本周五前提交初稿' })
    assert.equal(n1.status, 200, JSON.stringify(n1.body))
    assert.ok(n1.body.notified.length >= 1)

    const n2 = await t.call('zhangwei', 'nb.oa.nudge', { projectId: cg.id, workId: work.id })
    assert.equal(n2.status, 429, '30 秒内重复催办应被节流拦截')

    const ho = await t.call('zhangwei', 'nb.oa.handover', { projectId: cg.id, saveAsNote: true })
    assert.equal(ho.status, 200)
    assert.match(ho.body.markdown, /项目交接与上会简报/)
    assert.match(ho.body.markdown, /当前阶段准入与成果台账/)
    assert.ok(ho.body.noteId)
  } finally {
    await t.close()
  }
})

test('U5 企业开箱就绪度体检与 CSV 批量导入部门/员工账号（自动建部门与映射中文岗位）', async () => {
  const t = await boot()
  try {
    const st = await t.call('admin', 'nb.enterprise.status')
    assert.equal(st.status, 200)
    assert.equal(st.body.totalCount, 6)
    assert.ok(st.body.scorePct >= 50)

    const csvText = [
      '姓名, 账号, 部门, 岗位, 职务, 邮箱',
      '陆明, luming, 硬科技投资部, 投资经理, 投资副总裁, luming@ac.cn',
      '顾凯, gukai, 合规风控中心, 风控+法务, 风控总监, gukai@ac.cn',
      '周敏, zhoumin, 财务部, 财务+风控, 财务风控专家, zhoumin@ac.cn',
    ].join('\n')
    const imp = await t.call('admin', 'nb.enterprise.importUsers', { csvText })
    assert.equal(imp.status, 200, JSON.stringify(imp.body))
    assert.equal(imp.body.created.length, 2)
    assert.equal(imp.body.updated.length, 1)

    const uNew = t.core.db.one('users', u => u.username === 'gukai')
    assert.ok(uNew)
    assert.deepEqual(uNew.roles.sort(), ['legal', 'risk'])
    const dept = t.core.db.get('depts', uNew.deptId)
    assert.equal(dept.name, '合规风控中心')
  } finally {
    await t.close()
  }
})

test('U6 前端动作注册完整性与展示层自主品牌纯净度校验', async () => {
  const root = join(import.meta.dirname, '..')
  const appFiles = ['app/app.js', 'app/ui.js', 'lib/client.js', ...(await readdir(join(root, 'app/views'))).filter(f => f.endsWith('.js')).map(f => `app/views/${f}`)]
  const registeredActs = new Set(['explain', 'help', 'tour-start', 'top-settings-menu', 'file-level', 'task-add'])
  const usedActs = new Set()
  const banned = /\b(NotebookLM|WorkBuddy|DifyAIA|BannyLon|DifyWordBridg)\b|千问办公/i

  for (const rel of appFiles) {
    const code = await readFile(join(root, rel), 'utf8')
    // 剔除注释后检查界面文案不含外部模仿品牌
    const stripped = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    assert.equal(banned.test(stripped), false, `${rel} 展示代码不应出现外部模仿品牌字样`)

    for (const m of code.matchAll(/['"]([a-z][a-z0-9-]+)['"]\s*:/g)) registeredActs.add(m[1])
    for (const m of code.matchAll(/\b([a-z][a-z0-9_]*)\s*:\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/g)) registeredActs.add(m[1])
    for (const m of code.matchAll(/ACT(?:\[['"]([a-z0-9-]+)['"]\]|\.([a-z0-9_]+))\s*=/gi)) registeredActs.add(m[1] || m[2])
    for (const m of code.matchAll(/data-act(?:-change)?="([a-z0-9-]+)"/g)) usedActs.add(m[1])
  }
  for (const actName of usedActs) {
    assert.ok(registeredActs.has(actName), `前端存在未注册的交互动作 data-act="${actName}"`)
  }
})
