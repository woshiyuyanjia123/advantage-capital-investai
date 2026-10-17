// 持久化（企业版）：SQLite（Node 内置 node:sqlite）+ 内存索引。
// 每次写入同时记录修改前/后的完整快照 → 历史可追溯、任意版本可回滚（验收要求 7）。
// 单个服务进程独占数据库文件；多台客户端通过服务端接口访问，不要让多机直接共享这个文件。
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const uid = (prefix = '') => prefix + randomUUID().replace(/-/g, '').slice(0, 10)

export class DB {
  constructor(dir) {
    mkdirSync(dir, { recursive: true })
    this.dir = dir
    this.file = join(dir, 'investai.sqlite')
    this.sql = new DatabaseSync(this.file)
    this.sql.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (coll, id));
      CREATE TABLE IF NOT EXISTS history (seq INTEGER PRIMARY KEY AUTOINCREMENT, coll TEXT, id TEXT, rev INTEGER, action TEXT, before TEXT, after TEXT, actor TEXT, actor_name TEXT, reason TEXT, at INTEGER);
      CREATE INDEX IF NOT EXISTS history_doc ON history (coll, id, rev);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
    `)
    this.colls = new Map()
    for (const row of this.sql.prepare('SELECT coll, id, data FROM docs').all()) this.map(row.coll).set(row.id, JSON.parse(row.data))
    this.stmt = {
      put: this.sql.prepare('INSERT INTO docs (coll, id, rev, data, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated = excluded.updated'),
      del: this.sql.prepare('DELETE FROM docs WHERE coll = ? AND id = ?'),
      hist: this.sql.prepare('INSERT INTO history (coll, id, rev, action, before, after, actor, actor_name, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      kvGet: this.sql.prepare('SELECT value FROM kv WHERE key = ?'),
      kvSet: this.sql.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    }
    this.rev = Number(this.kv('rev') ?? 0)
    this.listeners = new Set()
    this.depth = 0
  }

  get empty() { return this.colls.size === 0 }
  map(coll) { let m = this.colls.get(coll); if (!m) { m = new Map(); this.colls.set(coll, m) } return m }
  get(coll, id) { return this.map(coll).get(id) ?? null }
  all(coll) { return [...this.map(coll).values()] }
  find(coll, pred) { return this.all(coll).filter(pred) }
  one(coll, pred) { for (const v of this.map(coll).values()) if (pred(v)) return v; return null }

  kv(key, value) {
    if (value === undefined) return this.stmt.kvGet.get(key)?.value ?? null
    this.stmt.kvSet.run(key, String(value))
  }

  /** 事务：fn 内的所有写入要么全部成功，要么全部撤销（内存同步回退）。 */
  tx(fn) {
    if (this.depth > 0) return fn()
    const snapshot = new Map([...this.colls].map(([k, m]) => [k, new Map(m)]))
    this.depth++
    this.sql.exec('BEGIN')
    try {
      const out = fn()
      this.sql.exec('COMMIT')
      return out
    } catch (e) {
      this.sql.exec('ROLLBACK')
      this.colls = snapshot
      throw e
    } finally { this.depth-- }
  }

  /**
   * 写入一个文档。meta: { actor:{id,name}, action, reason }。
   * 返回带新 rev 的文档（深拷贝后存储，调用方后续修改不会绕过历史记录）。
   */
  put(coll, doc, meta = {}) {
    if (!doc.id) doc.id = uid(coll.slice(0, 2) + '_')
    const before = this.get(coll, doc.id)
    const now = Date.now()
    // 已删除后恢复的文档：版本号接着历史往后排，不从 1 重新开始
    const prev = before?.rev ?? (this.sql.prepare('SELECT MAX(rev) AS r FROM history WHERE coll = ? AND id = ?').get(coll, doc.id)?.r ?? 0)
    const next = structuredClone({ ...doc, rev: prev + 1, updatedAt: now, createdAt: doc.createdAt ?? before?.createdAt ?? now })
    const write = () => {
      this.stmt.put.run(coll, next.id, next.rev, JSON.stringify(next), now)
      this.stmt.hist.run(coll, next.id, next.rev, meta.action ?? (before ? 'update' : 'create'), before ? JSON.stringify(before) : null, JSON.stringify(next), meta.actor?.id ?? 'system', meta.actor?.name ?? '系统', meta.reason ?? '', now)
      this.map(coll).set(next.id, next)
    }
    this.depth > 0 ? write() : this.tx(write)
    this.bump(coll, next.id)
    return next
  }

  remove(coll, id, meta = {}) {
    const before = this.get(coll, id)
    if (!before) return false
    const write = () => {
      this.stmt.del.run(coll, id)
      this.stmt.hist.run(coll, id, before.rev + 1, 'delete', JSON.stringify(before), null, meta.actor?.id ?? 'system', meta.actor?.name ?? '系统', meta.reason ?? '', Date.now())
      this.map(coll).delete(id)
    }
    this.depth > 0 ? write() : this.tx(write)
    this.bump(coll, id)
    return true
  }

  /** 不记历史的高频写入（任务进度、缓存类数据）。 */
  putQuiet(coll, doc) {
    if (!doc.id) doc.id = uid(coll.slice(0, 2) + '_')
    const now = Date.now()
    const next = { ...doc, rev: (this.get(coll, doc.id)?.rev ?? 0) + 1, updatedAt: now, createdAt: doc.createdAt ?? now }
    this.stmt.put.run(coll, next.id, next.rev, JSON.stringify(next), now)
    this.map(coll).set(next.id, next)
    this.bump(coll, next.id)
    return next
  }

  bump(coll, id) {
    // 任务进度高频写入不改变全局版本号（前端单独轮询任务），避免频繁整页刷新
    if (coll !== 'jobs') this.rev++
    if (this.depth === 0 || this.rev % 20 === 0) this.kv('rev', this.rev)
    for (const fn of this.listeners) { try { fn(coll, id) } catch { /* 监听器错误不影响写入 */ } }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }

  history(coll, id, limit = 100) {
    return this.sql.prepare('SELECT seq, rev, action, actor, actor_name, reason, at FROM history WHERE coll = ? AND id = ? ORDER BY seq DESC LIMIT ?').all(coll, id, limit).map(r => ({ ...r }))
  }

  recent(limit = 100, filter = {}) {
    const where = []
    const args = []
    if (filter.coll) { where.push('coll = ?'); args.push(filter.coll) }
    if (filter.actor) { where.push('actor = ?'); args.push(filter.actor) }
    return this.sql.prepare(`SELECT seq, coll, id, rev, action, actor, actor_name, reason, at FROM history ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ?`).all(...args, limit).map(r => ({ ...r }))
  }

  snapshot(coll, id, rev) {
    const r = this.sql.prepare('SELECT after FROM history WHERE coll = ? AND id = ? AND rev = ? AND after IS NOT NULL').get(coll, id, rev)
    return r ? JSON.parse(r.after) : null
  }

  /** 回滚到指定版本：以该版本内容生成一个新版本（历史保留，回滚本身也可追溯/再回滚）。 */
  rollback(coll, id, rev, meta = {}) {
    const snap = this.snapshot(coll, id, rev)
    if (!snap) throw Object.assign(new Error(`没有找到 ${coll}/${id} 的第 ${rev} 版`), { status: 404 })
    const { rev: _r, updatedAt: _u, ...data } = snap
    return this.put(coll, data, { ...meta, action: 'rollback', reason: `回滚到第 ${rev} 版${meta.reason ? `：${meta.reason}` : ''}` })
  }

  close() { this.kv('rev', this.rev); this.sql.close() }
}
