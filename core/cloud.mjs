// 云端部署（需求：未来云服务器）：账号安全 + 信息同步（预留）。详见 docs/CLOUD.md 与 docs/adr/0005-cloud-sync.md。
//   账号安全：会话存入数据库（服务重启不掉线）、闲置超时、登录失败锁定、系统生成的密码首次登录须修改、管理员查看/强制退出会话
//   设备令牌：给同步客户端（其他办公室的桌面应用、BI、备份程序）用；只存哈希、可吊销，权限等同签发给的那个人
//   信息同步：sync.pull 按变更序号增量拉取，结果经过与界面相同的四层权限过滤和脱敏；sync.push 为预留接口（未启用）
import { createHash, randomBytes } from 'node:crypto'
import { viewer } from './projection.mjs'

export const SYNC_PROTOCOL = 1
// 可同步的集合；密码哈希、会话、设备令牌、密钥、审计等不在其中
export const SYNC_COLLECTIONS = ['projects', 'companies', 'deliverables', 'meetings', 'tasks', 'approvals', 'workflows', 'businessTypes', 'depts', 'users', 'roles']
export const DEFAULT_SECURITY = { idleMinutes: 120, sessionHours: 12, maxFailures: 5, lockMinutes: 15, minPassword: 8, forceChangeGenerated: true }
export const DEFAULT_SYNC = { role: 'off', serverUrl: '', intervalMinutes: 15, collections: SYNC_COLLECTIONS, conflict: 'server-wins' }
export const SYNC_ROLES = { off: '不同步（单机）', server: '作为云端服务器（接受设备拉取）', client: '作为客户端（从云端服务器同步，预留）' }
export const DEVICE_SCOPES = { 'sync.pull': '拉取数据（按签发人的权限过滤）', 'sync.push': '推送修改（预留，暂未启用）' }

const sha = s => createHash('sha256').update(String(s)).digest('hex')
const fail = (m, status = 400) => Object.assign(new Error(m), { status })
const MIN = 60e3

/** 会话：数据库中只存 sid 的哈希；闲置超时与绝对过期都在服务端判定。 */
export function createSessionStore(db, security) {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL, exp INTEGER NOT NULL, ip TEXT, ua TEXT);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);`)
  const q = {
    ins: db.sql.prepare('INSERT INTO sessions (sid, user_id, created, seen, exp, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    get: db.sql.prepare('SELECT * FROM sessions WHERE sid = ?'),
    touch: db.sql.prepare('UPDATE sessions SET seen = ? WHERE sid = ?'),
    del: db.sql.prepare('DELETE FROM sessions WHERE sid = ?'),
    delUser: db.sql.prepare('DELETE FROM sessions WHERE user_id = ? AND sid <> ?'),
    list: db.sql.prepare('SELECT * FROM sessions WHERE exp > ? ORDER BY seen DESC'),
    purge: db.sql.prepare('DELETE FROM sessions WHERE exp < ? OR seen < ?'),
  }
  const sec = () => ({ ...DEFAULT_SECURITY, ...security() })
  return {
    create(user, { ip = '', ua = '' } = {}) {
      const sid = randomBytes(24).toString('hex')
      const now = Date.now()
      q.ins.run(sha(sid), user.id, now, now, now + sec().sessionHours * 3600e3, ip.slice(0, 64), ua.slice(0, 200))
      return sid
    },
    /** 有效则返回 { userId, id }（id 为哈希，可用于管理界面），并刷新最近活动时间。 */
    resolve(sid) {
      if (!sid) return null
      const row = q.get.get(sha(sid))
      const now = Date.now()
      if (!row) return null
      if (row.exp < now || now - row.seen > sec().idleMinutes * MIN) { q.del.run(row.sid); return null }
      if (now - row.seen > MIN) q.touch.run(now, row.sid)
      return { userId: row.user_id, id: row.sid }
    },
    revoke(sid) { if (sid) q.del.run(sha(sid)) },
    revokeId(id) { q.del.run(String(id)) },
    /** 退出该用户的全部会话；exceptSid 为当前会话时保留它。 */
    revokeUser(userId, exceptSid = '') { q.delUser.run(userId, exceptSid ? sha(exceptSid) : '') },
    list() {
      const now = Date.now()
      q.purge.run(now, now - sec().idleMinutes * MIN)
      return q.list.all(now).map(r => ({ id: r.sid, userId: r.user_id, created: r.created, seen: r.seen, exp: r.exp, ip: r.ip, ua: r.ua }))
    },
  }
}

/** 登录保护：同一账号 + 来源地址连续失败 maxFailures 次后锁定 lockMinutes 分钟（内存计数，重启清零）。 */
export function createLoginGuard(security) {
  const fails = new Map()
  const sec = () => ({ ...DEFAULT_SECURITY, ...security() })
  const key = (username, ip) => `${String(username).toLowerCase()}|${ip}`
  return {
    check(username, ip) {
      const f = fails.get(key(username, ip))
      if (f?.until > Date.now()) throw fail(`连续登录失败次数过多，请 ${Math.ceil((f.until - Date.now()) / MIN)} 分钟后再试，或联系管理员`, 429)
    },
    failed(username, ip) {
      const k = key(username, ip)
      const s = sec()
      const f = fails.get(k) ?? { n: 0, until: 0 }
      f.n = f.until && f.until < Date.now() ? 1 : f.n + 1
      f.until = f.n >= s.maxFailures ? Date.now() + s.lockMinutes * MIN : 0
      fails.set(k, f)
      return Math.max(0, s.maxFailures - f.n)
    },
    passed(username, ip) { fails.delete(key(username, ip)) },
  }
}

/** 设备令牌与信息同步。令牌形如 iai_<48 位十六进制>，只在签发时显示一次。 */
export function createSync({ db, org, projection, settings }) {
  const conf = () => ({ ...DEFAULT_SYNC, ...settings()?.sync })
  const meta = (user, reason) => ({ actor: user, reason, action: 'device' })

  function issue(user, { name, userId, scopes = ['sync.pull'], days = 365 }) {
    org.assert(user, 'sync.manage')
    const owner = db.get('users', userId ?? user.id)
    if (!owner || owner.disabled) throw fail('令牌所属人员不存在或已停用')
    const bad = scopes.filter(s => !DEVICE_SCOPES[s])
    if (bad.length) throw fail(`未知的令牌权限：${bad.join('、')}`)
    const token = `iai_${randomBytes(24).toString('hex')}`
    const d = db.put('devices', { name: String(name ?? '').trim().slice(0, 40) || '未命名设备', userId: owner.id, scopes, tokenHash: sha(token), expiresAt: Date.now() + Math.min(Math.max(Number(days) || 365, 1), 730) * 864e5, revoked: false, lastSeen: null, createdBy: user.id }, meta(user, `签发设备令牌（代表 ${owner.name}）`))
    return { device: view(d), token }
  }
  function revoke(user, id) {
    org.assert(user, 'sync.manage')
    const d = db.get('devices', id)
    if (!d) throw fail('设备不存在', 404)
    return view(db.put('devices', { ...d, revoked: true }, meta(user, `吊销设备令牌「${d.name}」`)))
  }
  const view = d => { const { tokenHash, ...rest } = d; return { ...rest, userName: db.get('users', d.userId)?.name } }
  function list(user) { org.assert(user, 'sync.manage'); return db.all('devices').sort((a, b) => b.createdAt - a.createdAt).map(view) }

  /** Bearer 令牌 → { user, device }；无效返回 null。 */
  function authenticate(token) {
    if (!/^iai_[a-f0-9]{48}$/.test(token ?? '')) return null
    const d = db.one('devices', x => x.tokenHash === sha(token))
    if (!d || d.revoked || d.expiresAt < Date.now()) return null
    const user = db.get('users', d.userId)
    if (!user || user.disabled) return null
    if (!d.lastSeen || Date.now() - d.lastSeen > 10 * MIN) db.putQuiet('devices', { ...d, lastSeen: Date.now() })
    return { user, device: d }
  }

  /** 这个人能否看到这条记录（与界面同一套判定）。 */
  function visible(user, coll, doc) {
    if (!doc) return false
    if (coll === 'projects') return org.seesProject(user, doc)
    if (doc.projectId) return org.seesProject(user, db.get('projects', doc.projectId))
    if (coll === 'companies') return org.can(user, 'company.view') || db.all('projects').some(p => p.companyId === doc.id && org.seesProject(user, p))
    if (coll === 'roles') return org.can(user, 'org.manage')
    return true
  }
  function shape(user, coll, doc) {
    const v = projection.snapshot(viewer.human(user), coll, doc)
    if (coll === 'users') { const { pw, mustChange, ...u } = v; return u }
    if (coll === 'deliverables') return { ...v, versions: (v.versions ?? []).map(({ markdown, ...x }) => x) }
    if (coll === 'meetings' && v.asr) return { ...v, asr: { ...v.asr, segments: v.asr.segments?.length ?? 0 } }
    return v
  }

  /**
   * 增量拉取：返回 since 之后变化过的记录的当前状态（同一记录只返回一次）。
   * 看不到的记录以 { seq, coll, id, removed: true } 返回，客户端据此删除本地副本（含权限收回的情况）。
   */
  function pull(user, { since = 0, limit = 200 } = {}) {
    const c = conf()
    if (c.role !== 'server') throw fail('本服务未开启同步（系统配置 → 云端与安全 → 同步角色选「作为云端服务器」）', 409)
    const colls = c.collections.filter(x => SYNC_COLLECTIONS.includes(x))
    const max = Math.min(Math.max(Number(limit) || 200, 1), 1000)
    const rows = db.sql.prepare(`SELECT MAX(seq) AS seq, coll, id FROM history WHERE seq > ? AND coll IN (${colls.map(() => '?').join(',')}) GROUP BY coll, id ORDER BY MAX(seq) LIMIT ?`).all(Number(since) || 0, ...colls, max + 1)
    const more = rows.length > max
    const page = rows.slice(0, max)
    const changes = page.map(r => {
      const doc = db.get(r.coll, r.id)
      return doc && visible(user, r.coll, doc) ? { seq: r.seq, coll: r.coll, id: r.id, rev: doc.rev, doc: shape(user, r.coll, doc) } : { seq: r.seq, coll: r.coll, id: r.id, removed: true }
    })
    return { protocol: SYNC_PROTOCOL, cursor: page.at(-1)?.seq ?? (Number(since) || 0), more, changes }
  }

  function status(user) {
    const c = conf()
    return { protocol: SYNC_PROTOCOL, role: c.role, roles: SYNC_ROLES, serverUrl: c.serverUrl, intervalMinutes: c.intervalMinutes, collections: c.collections, available: SYNC_COLLECTIONS, conflict: c.conflict, cursor: Number(db.sql.prepare('SELECT MAX(seq) AS s FROM history').get().s ?? 0), push: false, user: user && { id: user.id, name: user.name } }
  }

  /** 客户端模式：测试与云端服务器的连接与令牌（预留的同步任务在此基础上实现）。 */
  async function testRemote(user, { serverUrl, token, fetchImpl = fetch }) {
    org.assert(user, 'sync.manage')
    const base = String(serverUrl ?? conf().serverUrl ?? '').replace(/\/+$/, '')
    if (!/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/.test(base)) throw fail('云端服务器地址须为 https://（本机测试可用 http://127.0.0.1）')
    if (!token) throw fail('请先保存设备令牌（由云端服务器管理员签发）')
    const r = await fetchImpl(`${base}/api/investai?op=sync.status`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(e => { throw fail(`无法连接云端服务器：${e.message}`, 502) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw fail(`云端服务器拒绝：${j.error ?? r.status}`, 502)
    return { ok: true, remote: j }
  }

  return { issue, revoke, list, authenticate, pull, status, testRemote, visible, conf }
}
