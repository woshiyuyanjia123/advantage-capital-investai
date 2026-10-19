// 演示账号 Excel、登录模式与跨平台问题的回归测试。服务通过真实 HTTP 启动（与桌面应用、server.mjs 相同的 startServer）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import './helpers.mjs'
const { startServer, DEMO_ACCOUNTS } = await import('../core/http.mjs')
const { PYTHON_EXE, TOOLKNIT_CMD } = await import('../core/api.mjs')
const { asrSetupCommand } = await import('../core/meetings.mjs')
const { createCore } = await import('../core/index.mjs')

const XLSX = fileURLToPath(new URL('../docs/accounts/InvestAI-演示账号与权限.xlsx', import.meta.url))
const quiet = () => {}

async function serve(opts) {
  const dir = await mkdtemp(join(tmpdir(), 'investai-acct-'))
  return startServer({ dir, port: 0, log: quiet, ...opts })
}
async function login(base, username, password) {
  const r = await fetch(`${base}/api/investai?op=login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] }
}
const api = (base, cookie, op, body) => fetch(`${base}/api/investai?op=${op}`, body === undefined ? { headers: { cookie } } : { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function excelAccounts() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(XLSX)
  const ws = wb.getWorksheet('账号密码')
  const head = ws.getRow(1).values
  const col = name => head.indexOf(name)
  const rows = []
  ws.eachRow((r, i) => { if (i > 1) rows.push({ username: r.getCell(col('账号')).value, password: r.getCell(col('初始密码')).value, roles: r.getCell(col('岗位')).value, visible: r.getCell(col('演示数据中可见项目')).value }) })
  return rows
}

test('A1 Excel 中每个演示账号都能用表中密码登录，岗位与可见项目数与表格一致', async () => {
  const rows = await excelAccounts()
  assert.equal(rows.length, 15)
  const json = JSON.parse(await readFile(DEMO_ACCOUNTS, 'utf8')).accounts
  assert.deepEqual(new Map(rows.map(r => [r.username, r.password])), new Map(json.map(a => [a.username, a.password])), 'Excel 与 fixtures/demo-accounts.json 不一致：请运行 node scripts/make-accounts-xlsx.mjs')
  const s = await serve({ demoAccounts: true })
  try {
    for (const r of rows) {
      const { status, cookie } = await login(s.url, r.username, r.password)
      assert.equal(status, 200, `${r.username} 登录失败`)
      const st = await (await api(s.url, cookie, 'state')).json()
      assert.equal(st.mode, 'saas')
      assert.equal(st.caps.roleNames.join('、'), r.roles, `${r.username} 岗位不一致`)
      assert.equal(`${st.projects.length} / ${s.core.db.all('projects').length}`, r.visible, `${r.username} 可见项目数不一致`)
    }
  } finally { await s.close() }
})

test('A2 未启用演示账号时，公开的演示密码不能登录（正式部署用随机密码）', async () => {
  const [first] = await excelAccounts()
  const s = await serve({ demoAccounts: false })
  try { assert.equal((await login(s.url, first.username, first.password)).status, 401) } finally { await s.close() }
})

test('A3 修改本人密码：校验原密码、至少 8 位，旧密码失效，其他会话退出', async () => {
  const [first] = await excelAccounts()
  const s = await serve({ demoAccounts: true })
  try {
    const a = await login(s.url, first.username, first.password)
    const b = await login(s.url, first.username, first.password)
    assert.equal((await api(s.url, a.cookie, 'me.password', { old: 'wrong-password', password: 'new-pass-123' })).status, 403)
    assert.equal((await api(s.url, a.cookie, 'me.password', { old: first.password, password: 'short' })).status, 400)
    assert.equal((await api(s.url, a.cookie, 'me.password', { old: first.password, password: 'new-pass-123' })).status, 200)
    assert.equal((await api(s.url, a.cookie, 'state')).status, 200, '当前会话保持登录')
    assert.equal((await api(s.url, b.cookie, 'state')).status, 401, '其他会话被退出')
    assert.equal((await login(s.url, first.username, first.password)).status, 401, '旧密码失效')
    assert.equal((await login(s.url, first.username, 'new-pass-123')).status, 200)
  } finally { await s.close() }
})

test('A4 已有密码的账号重启时不会被演示密码覆盖', async () => {
  const [first] = await excelAccounts()
  const dir = await mkdtemp(join(tmpdir(), 'investai-acct-'))
  let s = await startServer({ dir, port: 0, log: quiet, demoAccounts: true })
  const a = await login(s.url, first.username, first.password)
  await api(s.url, a.cookie, 'me.password', { old: first.password, password: 'mine-12345' })
  await s.close()
  s = await startServer({ dir, port: 0, log: quiet, demoAccounts: true })
  try {
    assert.equal((await login(s.url, first.username, first.password)).status, 401)
    assert.equal((await login(s.url, first.username, 'mine-12345')).status, 200)
  } finally { await s.close() }
})

test('A5 Windows 路径：转写 Python 与 toolknit 命令可填 C:\\…\\*.exe，仍拒绝其他程序与 shell 拼接', () => {
  for (const ok of ['/usr/bin/python3', 'C:\\Users\\张伟\\AppData\\Roaming\\InvestAI\\runtime\\asr-venv\\Scripts\\python.exe']) assert.ok(PYTHON_EXE.test(ok), ok)
  for (const bad of ['/bin/sh', 'C:\\Windows\\System32\\cmd.exe']) assert.ok(!PYTHON_EXE.test(bad), bad)
  for (const ok of ['toolknit', '/usr/local/bin/toolknit', 'C:\\Program Files\\toolknit\\toolknit.exe']) assert.ok(TOOLKNIT_CMD.test(ok), ok)
  for (const bad of ['/bin/sh', 'toolknit; rm -rf /', 'C:\\x\\toolknit.exe & calc']) assert.ok(!TOOLKNIT_CMD.test(bad), bad)
})

test('A6 转写安装命令按系统给出，并指向本程序实际读取的目录', () => {
  const win = asrSetupCommand('win32', 'C:\\Users\\a\\AppData\\Roaming\\InvestAI\\runtime')
  assert.match(win, /^powershell .*setup-asr\.ps1" -Runtime "C:\\Users\\a\\AppData\\Roaming\\InvestAI\\runtime"$/)
  const mac = asrSetupCommand('darwin', '/Users/a/Library/Application Support/InvestAI/runtime')
  assert.match(mac, /^INVESTAI_RUNTIME="\/Users\/a\/Library\/Application Support\/InvestAI\/runtime" sh ".*setup-asr\.sh"$/)
})

test('A7 启动后立即关闭不会在已关闭的数据库上继续扫描资料', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'investai-acct-'))
  const errors = []
  const orig = console.error
  const origLog = console.log
  console.error = console.log = (...a) => { if (/扫描失败|database is not open|finalized/.test(a.join(' '))) errors.push(a.join(' ')) }
  try {
    const core = await createCore({ dir, mode: 'desktop', autostart: false })
    await core.close()
  } finally { console.error = orig; console.log = origLog }
  assert.deepEqual(errors, [])
})
