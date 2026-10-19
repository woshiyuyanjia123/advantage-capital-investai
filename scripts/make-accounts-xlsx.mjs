#!/usr/bin/env node
// 生成「演示账号与权限」Excel：docs/accounts/InvestAI-演示账号与权限.xlsx
//   node scripts/make-accounts-xlsx.mjs
// 账号、岗位与权限直接取自系统种子数据（临时目录启动一次核心），密码取自 fixtures/demo-accounts.json，
// 因此表格与系统实际执行的权限一致；修改岗位或演示密码后重新运行即可。
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { createCore } from '../core/index.mjs'
import { DEMO_ACCOUNTS } from '../core/http.mjs'
import { FUNCTIONS, OPS, FIELD_CATEGORIES, LEVELS, AI_LEVELS, SCOPES } from '../core/org.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'docs', 'accounts', 'InvestAI-演示账号与权限.xlsx')

// 权限分层：按数据范围、资料密级、敏感字段与业务操作的大小归为五层；系统管理员只管配置，单列
const TIERS = {
  partner: [1, '决策层'], head: [2, '管理层'], pm: [3, '执行层'], postinv: [3, '执行层'],
  risk: [4, '专业支持层'], legal: [4, '专业支持层'], finance: [4, '专业支持层'], fund: [4, '专业支持层'],
  analyst: [5, '协作层'], staff: [5, '协作层'], sysadmin: [0, '系统管理（不参与业务）'],
}
const TIER_DESC = [
  ['第 1 层 · 决策层', '合伙人', '全机构项目；资料密级至「绝密」；全部敏感字段；上会表决、投资审批、退出审批、归档确认'],
  ['第 2 层 · 管理层', '部门负责人', '本部门项目；至「绝密」；金额 / 估值 / 条款 / 商业秘密；启动授权、经理确认、材料定稿、上会表决'],
  ['第 3 层 · 执行层', '投资经理、投后管理', '本人负责的项目或投后阶段项目；至「机密」；金额与估值（经理另含条款）；经理确认、材料定稿或退出审批'],
  ['第 4 层 · 专业支持层', '风控、法务、财务、基金募资', '指定授权的项目（风控为全机构，用于独立监督）；按专业开放对应敏感字段；交割确认或上会表决'],
  ['第 5 层 · 协作层', '分析师、综合协作', '只看被指定授权的项目；至「内部」；不看任何敏感字段；无业务操作'],
  ['系统管理（单列）', '系统管理员', '配置流程、岗位、AI 策略、集成与审计；可浏览项目（至「内部」），但不看任何敏感字段，无业务操作'],
]

const NAVY = 'FF0A1120'
const BLUE = 'FF2F6FED'
const thin = { style: 'thin', color: { argb: 'FFD0D7E2' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

function table(ws, columns, rows, { tierCol } = {}) {
  ws.columns = columns.map(([header, width]) => ({ header, width }))
  const head = ws.getRow(1)
  head.height = 24
  head.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = border })
  for (const r of rows) {
    const row = ws.addRow(r)
    row.eachCell({ includeEmpty: true }, c => { c.alignment = { vertical: 'top', wrapText: true }; c.border = border })
  }
  if (tierCol) ws.eachRow((row, i) => { if (i > 1 && i % 2 === 0) row.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FB' } } }) })
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: tierCol ?? 0 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
}

const dir = await mkdtemp(join(tmpdir(), 'investai-accounts-'))
try {
  const core = await createCore({ dir, mode: 'saas' })
  const { db, org } = core
  const demo = new Map(JSON.parse(await readFile(DEMO_ACCOUNTS, 'utf8')).accounts.map(a => [a.username, a.password]))
  const roles = db.all('roles')
  const roleOf = id => roles.find(r => r.id === id)
  const dept = id => db.get('depts', id)?.name ?? ''
  const projects = db.all('projects')
  const users = db.all('users').filter(u => !u.disabled)
    .map(u => ({ u, tier: TIERS[u.roles[0]] ?? [9, '其他'] }))
    .sort((a, b) => (a.tier[0] || 9) - (b.tier[0] || 9) || a.u.username.localeCompare(b.u.username))
  for (const { u } of users) if (!demo.has(u.username)) throw new Error(`fixtures/demo-accounts.json 缺少账号 ${u.username}`)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'InvestAI'

  // ① 账号密码
  const ws1 = wb.addWorksheet('账号密码', { properties: { tabColor: { argb: BLUE } } })
  table(ws1, [['权限层级', 16], ['账号', 12], ['初始密码', 17], ['姓名', 10], ['部门', 13], ['职务', 16], ['岗位', 20], ['数据范围', 16], ['资料密级上限', 12], ['可见敏感字段', 26], ['业务操作权限', 34], ['AI 参与上限', 12], ['演示数据中可见项目', 12]],
    users.map(({ u, tier }) => {
      const e = org.effective(u)
      return [
        tier[0] ? `第 ${tier[0]} 层 · ${tier[1]}` : tier[1], u.username, demo.get(u.username), u.name, dept(u.deptId), u.title,
        e.roleNames.join('、'), e.scopes.map(s => SCOPES[s]).join('、'), LEVELS[e.clearance],
        [...e.categories].map(c => FIELD_CATEGORIES[c]).join('、') || '—', [...e.ops].map(o => OPS[o]).join('、') || '—',
        AI_LEVELS[e.ai], `${projects.filter(p => org.seesProject(u, p)).length} / ${projects.length}`,
      ]
    }), { tierCol: 2 })
  ws1.getColumn(3).font = { name: 'Menlo' }

  // ② 权限分层说明
  const ws2 = wb.addWorksheet('权限分层说明')
  table(ws2, [['层级', 22], ['岗位', 26], ['权限边界', 90]], TIER_DESC)
  ws2.addRow([])
  for (const line of [
    '四层权限：① 功能权限（能用哪些模块与动作）② 数据范围（能看哪些项目）③ 业务操作（流程节点上的授权、定稿、表决、审批）④ 敏感信息（字段类别 + 资料密级）。所有判断在服务端执行，AI 继承当前用户的权限。',
    'AI 参与级别按岗位、业务类型、工作类型、资料密级取最低值；AI 工具里没有表决、定稿、推进、删除、导出。',
    '岗位权限可由系统管理员在「系统配置 → 角色权限」修改；本表反映默认配置。',
  ]) { const r = ws2.addRow([line]); ws2.mergeCells(r.number, 1, r.number, 3); r.getCell(1).alignment = { wrapText: true, vertical: 'top' }; r.height = 34 }

  // ③ 功能权限矩阵（第一层）
  const ws3 = wb.addWorksheet('功能权限矩阵')
  table(ws3, [['功能', 22], ['标识', 20], ...roles.map(r => [r.name, 11])],
    Object.entries(FUNCTIONS).map(([k, label]) => [label, k, ...roles.map(r => r.functions.includes(k) ? '✓' : '')]), { tierCol: 2 })
  // ④ 数据范围、业务操作与敏感信息（第二至四层）
  const ws4 = wb.addWorksheet('数据·操作·敏感信息')
  table(ws4, [['权限项', 26], ...roles.map(r => [r.name, 13])], [
    ['数据范围', ...roles.map(r => SCOPES[r.scope])],
    ['资料密级上限', ...roles.map(r => LEVELS[r.clearance])],
    ['AI 参与上限', ...roles.map(r => AI_LEVELS[r.ai])],
    ...Object.entries(OPS).map(([k, label]) => [`业务操作：${label}`, ...roles.map(r => r.ops.includes(k) ? '✓' : '')]),
    ...Object.entries(FIELD_CATEGORIES).map(([k, label]) => [`敏感字段：${label}`, ...roles.map(r => r.categories.includes(k) ? '✓' : '')]),
  ], { tierCol: 1 })
  for (const ws of [ws3, ws4]) ws.eachRow((row, i) => { if (i > 1) row.eachCell((c, col) => { if (col > (ws === ws3 ? 2 : 1)) c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } }) })

  // ⑤ 使用说明
  const ws5 = wb.addWorksheet('使用说明')
  ws5.getColumn(1).width = 110
  for (const [text, bold] of [
    ['如何使用这些账号登录', true],
    ['桌面应用：菜单「账户 → 登录模式」，应用重新打开后显示登录页，用本表的账号与初始密码登录。切回「本机模式」可免登录切换演示身份。'],
    ['命令行 / 服务器：node server.mjs --demo-accounts（默认 http://127.0.0.1:4310）。'],
    ['同一个数据目录里已经设置过密码的账号不会被覆盖：若之前用随机密码启动过，请换一个新数据目录（--data <目录>）或由管理员重置密码。'],
    [''],
    ['安全提示', true],
    ['这些是公开在仓库里的演示密码，只用于演示与培训。正式部署请不要加 --demo-accounts：系统会为每个账号生成随机初始密码（数据目录 initial-credentials.txt，权限 600）。'],
    ['登录后点右上角头像 →「修改密码」可改成自己的密码（至少 8 位，修改后其他设备上的登录会退出）；管理员可在「系统配置 → 人员」重置任何人的密码。'],
    ['演示数据中的公司、项目、人员均为虚构。'],
  ]) { const r = ws5.addRow([text]); r.getCell(1).alignment = { wrapText: true, vertical: 'top' }; if (bold) r.font = { bold: true, size: 13, color: { argb: BLUE } } }

  await mkdir(dirname(out), { recursive: true })
  await wb.xlsx.writeFile(out)
  await core.close()
  console.log(`已生成 ${out}（${users.length} 个账号，${roles.length} 个岗位）`)
} finally {
  await rm(dir, { recursive: true, force: true })
}
