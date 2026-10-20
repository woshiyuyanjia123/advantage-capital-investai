// 云端部署：账号安全（会话入库、闲置超时、登录锁定、强制改密、Secure Cookie）与信息同步预留（设备令牌、权限过滤的增量拉取）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import './helpers.mjs'
const { startServer, DEMO_ACCOUNTS } = await import('../core/http.mjs')

const quiet = () => {}
const demo = new Map(JSON.parse(await readFile(DEMO_ACCOUNTS, 'utf8')).accounts.map(a => [a.username, a.password]))
const newDir = () => mkdtemp(join(tmpdir(), 'investai-cloud-'))
const serve = async (opts = {}) => startServer({ dir: opts.dir ?? await newDir(), port: 0, log: quiet, demoAccounts: true, ...opts })

function client(base) {
  const call = async (op, { body, cookie, headers = {} } = {}) => {
    const r = await fetch(`${base}/api/investai?op=${op}`, body === undefined ? { headers: { ...(cookie ? { cookie } : {}), ...headers } } : { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) })
    return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') }
  }
  const login = async (username, password = demo.get(username), headers = {}) => {
    const r = await call('login', { body: { username, password }, headers })
    return { ...r, sid: r.cookie?.split(';')[0] }
  }
  return { call, login }
}

test('C1 会话保存在数据库：服务重启后仍保持登录；退出后失效', async () => {
  const dir = await newDir()
  let s = await serve({ dir })
  const { sid } = await client(s.url).login('zhangwei')
  await s.close()
  s = await serve({ dir })
  try {
    const c = client(s.url)
    assert.equal((await c.call('state', { cookie: sid })).status, 200)
    await c.call('logout', { body: {}, cookie: sid })
    assert.equal((await c.call('state', { cookie: sid })).status, 401)
  } finally { await s.close() }
})

test('C2 闲置超过设定时间自动退出', async () => {
  const s = await serve()
  try {
    const c = client(s.url)
    const { sid } = await c.login('zhangwei')
    s.core.db.sql.prepare('UPDATE sessions SET seen = ?').run(Date.now() - 121 * 60e3)
    assert.equal((await c.call('state', { cookie: sid })).status, 401)
  } finally { await s.close() }
})

test('C3 连续输错锁定（按账号 + 来源地址）；信任反向代理时按真实来源地址区分', async () => {
  const s = await serve({ env: { INVESTAI_TRUST_PROXY: '1' } })
  try {
    const c = client(s.url)
    const from = ip => ({ 'x-forwarded-for': ip })
    for (let i = 0; i < 4; i++) assert.equal((await c.login('zhangwei', 'wrong-pass', from('203.0.113.9'))).status, 401)
    assert.equal((await c.login('zhangwei', 'wrong-pass', from('203.0.113.9'))).status, 429)
    assert.equal((await c.login('zhangwei', undefined, from('203.0.113.9'))).status, 429, '锁定期间正确密码也拒绝')
    assert.equal((await c.login('zhangwei', undefined, from('198.51.100.7'))).status, 200, '其他来源地址不受影响')
    const { sid } = await c.login('admin', undefined, from('198.51.100.7'))
    const events = (await c.call('audit', { cookie: sid })).body.events
    assert.ok(events.some(e => e.action === '登录失败' && e.target === '203.0.113.9'))
  } finally { await s.close() }
})

test('C4 随机初始密码首次登录必须修改：改密前只能看状态、改密码、退出', async () => {
  const dir = await newDir()
  const s = await serve({ dir, demoAccounts: false })
  try {
    const c = client(s.url)
    const line = (await readFile(join(dir, 'initial-credentials.txt'), 'utf8')).split('\n').find(l => l.startsWith('linxiao\t'))
    const { sid, body } = await c.login('linxiao', line.split('\t')[1])
    assert.equal(body.mustChange, true)
    const st = await c.call('state', { cookie: sid })
    assert.equal(st.status, 200)
    assert.equal(st.body.me.mustChange, true)
    const blocked = await c.call('files', { cookie: sid })
    assert.equal(blocked.status, 403)
    assert.equal(blocked.body.mustChange, true)
    assert.equal((await c.call('me.password', { body: { old: line.split('\t')[1], password: 'linxiao-own-1' }, cookie: sid })).status, 200)
    assert.equal((await c.call('files', { cookie: sid })).status, 200)
    assert.equal((await c.call('state', { cookie: sid })).body.me.mustChange, false)
  } finally { await s.close() }
})

test('C5 管理员重置他人密码：对方首次登录须修改，且原会话被退出；密码长度按策略校验', async () => {
  const s = await serve()
  try {
    const c = client(s.url)
    const admin = (await c.login('admin')).sid
    const victim = (await c.login('zhoumin')).sid
    const id = s.core.db.one('users', u => u.username === 'zhoumin').id
    assert.equal((await c.call('user.save', { body: { id, password: 'short' }, cookie: admin })).status, 400)
    assert.equal((await c.call('user.save', { body: { id, password: 'reset-by-admin-1' }, cookie: admin })).status, 200)
    assert.equal((await c.call('state', { cookie: victim })).status, 401)
    assert.equal((await c.login('zhoumin', 'reset-by-admin-1')).body.mustChange, true)
  } finally { await s.close() }
})

test('C6 经 HTTPS 反向代理访问时登录 Cookie 带 Secure；HTTP 直连不带', async () => {
  const s = await serve()
  try {
    const c = client(s.url)
    assert.match((await c.login('zhangwei', undefined, { 'x-forwarded-proto': 'https' })).cookie, /; Secure/)
    assert.doesNotMatch((await c.login('zhangwei')).cookie, /Secure/)
  } finally { await s.close() }
})

test('C7 设备令牌：只能调用同步接口；拉取结果按签发对象的权限过滤、脱敏，不含密码；吊销后失效', async () => {
  const s = await serve()
  try {
    const c = client(s.url)
    const admin = (await c.login('admin')).sid
    const linId = s.core.db.one('users', u => u.username === 'linxiao').id
    assert.equal((await c.call('device.issue', { body: { name: '分析师笔记本', userId: linId }, cookie: (await c.login('linxiao')).sid })).status, 403, '没有 sync.manage 不能签发')
    const issued = await c.call('device.issue', { body: { name: '分析师笔记本', userId: linId, scopes: ['sync.pull'], days: 30 }, cookie: admin })
    assert.equal(issued.status, 200)
    const token = issued.body.token
    assert.match(token, /^iai_[a-f0-9]{48}$/)
    assert.ok(!JSON.stringify(s.core.db.all('devices')).includes(token), '数据库只存令牌哈希')
    const dev = { authorization: `Bearer ${token}` }

    assert.equal((await c.call('sync.pull', { headers: dev })).status, 409, '未开启同步时拒绝')
    assert.equal((await c.call('settings.update', { body: { section: 'sync', value: { role: 'server' } }, cookie: admin })).status, 200)
    assert.equal((await c.call('state', { headers: dev })).status, 403, '令牌不能调用界面接口')
    assert.equal((await c.call('sync.push', { body: {}, headers: dev })).status, 403, '没有推送权限')

    const status = await c.call('sync.status', { headers: dev })
    assert.equal(status.body.user.name, '林晓')
    let cursor = 0
    const docs = new Map()
    for (;;) {
      const r = await c.call(`sync.pull&since=${cursor}&limit=50`, { headers: dev })
      assert.equal(r.status, 200)
      for (const ch of r.body.changes) if (ch.removed) docs.delete(`${ch.coll}/${ch.id}`); else docs.set(`${ch.coll}/${ch.id}`, ch.doc)
      cursor = r.body.cursor
      if (!r.body.more) break
    }
    const lin = s.core.db.get('users', linId)
    const projects = [...docs].filter(([k]) => k.startsWith('projects/')).map(([, d]) => d.id).sort()
    assert.deepEqual(projects, s.core.db.all('projects').filter(p => s.core.org.seesProject(lin, p)).map(p => p.id).sort(), '只同步可见项目')
    const text = JSON.stringify([...docs.values()])
    assert.ok(!/"pw"|"hash"|"salt"|mustChange|tokenHash/.test(text), '不含密码与令牌')
    assert.ok(![...docs.keys()].some(k => k.startsWith('roles/')), '岗位配置只同步给有人员管理权限的人')
    for (const [k, d] of docs) if (k.startsWith('deliverables/')) assert.ok((d.versions ?? []).every(v => !('markdown' in v)), '成果不含正文')
    const hiddenFields = [...docs].filter(([k]) => k.startsWith('projects/')).flatMap(([, d]) => Object.values(d.fields ?? {})).filter(v => v && typeof v === 'object' && v.hidden)
    assert.ok(hiddenFields.length > 0, '分析师看不到的敏感字段被脱敏')

    assert.deepEqual((await c.call(`sync.pull&since=${cursor}`, { headers: dev })).body.changes, [], '没有新变化时为空')
    const p = s.core.db.get('projects', projects[0])
    s.core.db.put('projects', { ...p, desc: `${p.desc ?? ''}（已更新）` }, { actor: { id: 'system', name: '测试' }, reason: '测试' })
    const next = await c.call(`sync.pull&since=${cursor}`, { headers: dev })
    assert.deepEqual(next.body.changes.map(x => x.id), [p.id], '增量拉取只返回新变化')

    assert.equal((await c.call('device.revoke', { body: { id: issued.body.device.id }, cookie: admin })).status, 200)
    assert.equal((await c.call('sync.status', { headers: dev })).status, 401)
  } finally { await s.close() }
})

test('C8 推送同步为预留接口：返回 501 与说明', async () => {
  const s = await serve()
  try {
    const c = client(s.url)
    const admin = (await c.login('admin')).sid
    const r = await c.call('sync.push', { body: {}, cookie: admin })
    assert.equal(r.status, 501)
    assert.match(r.body.error, /预留/)
  } finally { await s.close() }
})

test('C9 管理员可查看在线会话并强制退出；系统管理员默认具备同步管理权限', async () => {
  const s = await serve()
  try {
    const c = client(s.url)
    const admin = (await c.login('admin')).sid
    const pm = (await c.login('zhangwei')).sid
    const list = (await c.call('security.sessions', { cookie: admin })).body
    const target = list.find(x => x.userName === '张伟')
    assert.ok(target && !list.some(x => /^[a-f0-9]{48}$/.test(x.id) && pm.endsWith(x.id)), '列表中不出现原始会话号')
    assert.equal((await c.call('security.sessions', { cookie: pm })).status, 403)
    assert.equal((await c.call('security.revoke', { body: { id: target.id }, cookie: admin })).status, 200)
    assert.equal((await c.call('state', { cookie: pm })).status, 401)
    assert.ok(s.core.db.get('roles', 'sysadmin').functions.includes('sync.manage'))
  } finally { await s.close() }
})
