// 知识库：挂载目录扫描、在线探测、离线缓存、密级、项目关联、权限过滤后检索。
// 权限规则：资料密级 ≤ 用户密级；项目资料还要求用户能看到对应项目（AI 检索与读取走同一过滤）。
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, extname, join, relative, resolve, sep, dirname } from 'node:path'
import { extractAny } from './office.mjs'

const MAX_FILES = 8000
const MAX_EXTRACT = 40 * 1024 * 1024
const KEEP_CHARS = 120000

export function tokens(text) {
  const out = []
  const s = String(text).toLowerCase()
  for (const m of s.matchAll(/[a-z0-9][a-z0-9.%-]+/g)) out.push(m[0])
  for (const m of s.matchAll(/[一-鿿]+/g)) {
    const w = m[0]
    if (w.length === 1) out.push(w)
    for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2))
  }
  return out
}

export class KB {
  constructor({ db, org, dir }) {
    this.db = db
    this.org = org
    this.cacheDir = join(dir, 'cache')
    this.text = new Map()
    this.status = new Map()
    this.progress = {}
  }

  mount(id) { return this.db.get('mounts', id) }
  mounts() { return this.db.all('mounts') }
  file(id) { return this.db.get('files', id) }
  files() { return this.db.all('files') }

  async probe(m) {
    const hit = this.status.get(m.id)
    if (hit && Date.now() - hit.at < 4000 && hit.flag === !!m.simulateOffline && hit.path === m.path) return hit.online
    const online = !m.simulateOffline && await stat(m.path).then(s => s.isDirectory(), () => false)
    this.status.set(m.id, { at: Date.now(), online, flag: !!m.simulateOffline, path: m.path })
    return online
  }

  levelFor(rel, mountId) {
    const rules = this.db.get('settings', 'main')?.materialRules ?? []
    const path = `${this.mount(mountId)?.name ?? ''}/${rel}`
    return rules.find(r => path.includes(r.pattern))?.level ?? 1
  }

  /** 资料关联的公司（目录名 = 公司简称，位于「项目资料/」或项目工作区根下）。 */
  companyFor(f) {
    const parts = f.rel.split('/')
    const short = f.mountId === 'm_ws' ? parts[0] : parts[parts.indexOf('项目资料') + 1]
    if (!short || (f.mountId !== 'm_ws' && !parts.includes('项目资料'))) return null
    return this.db.one('companies', c => c.short === short || c.name === short)
  }

  /** 权限：密级 + 项目范围。 */
  visible(user, f) {
    if (!f || !this.org.canLevel(user, f.level ?? 1)) return false
    const c = this.companyFor(f)
    if (!c) return true
    const ps = this.db.find('projects', p => p.companyId === c.id)
    return !ps.length || ps.some(p => this.org.seesProject(user, p))
  }

  async mountsView() {
    return Promise.all(this.mounts().map(async m => ({ ...m, online: await this.probe(m), files: this.files().filter(f => f.mountId === m.id).length, progress: this.progress[m.id] ?? null })))
  }

  async scanAll() { for (const m of this.mounts()) await this.scan(m.id).catch(e => console.error('[investai] 扫描失败', m.path, e.message)) }

  async scan(mountId) {
    const m = this.mount(mountId)
    if (!m || !(await this.probe(m))) return { ok: false, reason: '目录不可达，保留缓存索引' }
    const found = []
    const walk = async (d, depth) => {
      if (depth > 8 || found.length >= MAX_FILES) return
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (e.name.startsWith('.') || e.name.startsWith('~$') || e.name === 'node_modules' || e.name.includes('-编辑中')) continue
        const full = join(d, e.name)
        if (e.isDirectory()) await walk(full, depth + 1)
        else if (e.isFile()) found.push(full)
      }
    }
    await walk(m.path, 0)
    this.progress[mountId] = { done: 0, total: found.length, state: 'scanning', at: Date.now() }
    const seen = new Set()
    for (const full of found) {
      const rel = relative(m.path, full).split(sep).join('/')
      const id = this.idFor(mountId, rel)
      seen.add(id)
      const s = await stat(full).catch(() => null)
      const old = this.file(id)
      if (s && (!old || old.mtime !== s.mtimeMs || old.size !== s.size)) await this.index(m, rel, id, full, s, old)
      this.progress[mountId].done++
    }
    for (const f of this.files()) if (f.mountId === mountId && !seen.has(f.id)) this.db.remove('files', f.id, { reason: '源文件已删除' })
    this.progress[mountId] = { done: found.length, total: found.length, state: 'done', at: Date.now() }
    this.db.putQuiet('mounts', { ...m, lastScan: Date.now() })
    return { ok: true, files: found.length }
  }

  idFor(mountId, rel) { return createHash('sha1').update(`${mountId}:${rel}`).digest('hex').slice(0, 16) }

  async index(m, rel, id, full, s, old, extra = {}) {
    const ext = extname(full).toLowerCase()
    let r = { text: '', note: '' }
    if (s.size <= MAX_EXTRACT) r = await extractAny(await readFile(full), ext)
    else r.note = '文件过大，仅登记元数据'
    const text = (r.text ?? '').slice(0, KEEP_CHARS)
    this.text.set(id, text)
    await mkdir(this.cacheDir, { recursive: true })
    await writeFile(join(this.cacheDir, `${id}.txt`), text)
    const f = { id, mountId: m.id, rel, name: basename(full), ext, size: s.size, mtime: s.mtimeMs, chars: text.length, pages: r.pages ?? null, preview: text.replace(/\[第\d+页\]/g, '').replace(/\s+/g, ' ').slice(0, 160), note: r.note ?? '', refs: old?.refs ?? 0, level: extra.level ?? old?.manualLevel ?? this.levelFor(rel, m.id), manualLevel: extra.level ?? old?.manualLevel, uploadedBy: extra.by ?? old?.uploadedBy, indexedAt: Date.now() }
    this.db.putQuiet('files', f)
    return f
  }

  async cached(id) {
    if (!this.text.has(id)) this.text.set(id, await readFile(join(this.cacheDir, `${id}.txt`), 'utf8').catch(() => ''))
    return this.text.get(id)
  }

  async safePath(m, rel) {
    const rootp = await realpath(m.path)
    const full = resolve(rootp, rel)
    const real = await realpath(full).catch(() => full)
    if (real !== rootp && !real.startsWith(rootp + sep)) throw Object.assign(new Error('路径越界'), { status: 400 })
    return real
  }

  async pathOf(id) {
    const f = this.file(id)
    if (!f) throw Object.assign(new Error('文件不存在'), { status: 404 })
    return this.safePath(this.mount(f.mountId), f.rel)
  }

  /** 读取（含权限检查）。user 为空表示系统内部调用。 */
  async read(id, user) {
    const f = this.file(id)
    if (!f) throw Object.assign(new Error('文件不存在或已移除'), { status: 404 })
    if (user && !this.visible(user, f)) throw Object.assign(new Error(`无权访问该资料（密级：${['公开', '内部', '机密', '绝密'][f.level ?? 1]}）`), { status: 403 })
    const m = this.mount(f.mountId)
    const online = await this.probe(m)
    if (online) {
      try {
        const full = await this.safePath(m, f.rel)
        const s = await stat(full)
        if (s.mtimeMs !== f.mtime) await this.index(m, f.rel, id, full, s, f)
      } catch { /* 读取失败时使用缓存 */ }
    }
    return { file: this.file(id), mount: m.name, path: `${m.name}/${f.rel}`, text: await this.cached(id), offline: !online }
  }

  async raw(id, user) {
    const f = this.file(id)
    if (user && !this.visible(user, f)) throw Object.assign(new Error('无权访问该资料'), { status: 403 })
    return { file: f, buffer: await readFile(await this.pathOf(id)) }
  }

  list(user, opts = {}) {
    const { mountId, q, projectId, limit = 500 } = opts
    let companyId = opts.companyId
    let projName = null
    if (projectId) {
      const p = this.db.get('projects', projectId)
      companyId = p?.companyId ?? null
      projName = p?.name ?? null
    }
    let list = this.files().filter(f => !user || this.visible(user, f))
    if (mountId) list = list.filter(f => f.mountId === mountId)
    if (companyId) list = list.filter(f => this.companyFor(f)?.id === companyId)
    else if (projectId || ('companyId' in opts && opts.companyId === null)) {
      list = projName ? list.filter(f => f.rel.includes(`项目资料/${projName}/`) || f.rel.startsWith(`${projName}/`)) : []
    }
    if (q) { const t = q.toLowerCase(); list = list.filter(f => f.rel.toLowerCase().includes(t) || f.preview.toLowerCase().includes(t)) }
    return list.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
  }

  async search(q, { user, limit = 8, filter } = {}) {
    const qt = [...new Set(tokens(q))]
    if (!qt.length) return []
    const scored = []
    for (const f of this.files()) {
      if (user && !this.visible(user, f)) continue
      if (filter && !filter(f)) continue
      const text = (await this.cached(f.id)).toLowerCase()
      const name = f.rel.toLowerCase()
      let score = 0, best = '', bestCount = 0
      for (const t of qt) {
        let c = 0
        let i = text.indexOf(t)
        while (i >= 0 && c < 6) { c++; i = text.indexOf(t, i + t.length) }
        if (name.includes(t)) score += 6
        score += c
        if (c > bestCount) { bestCount = c; best = t }
      }
      if (score > 0) scored.push({ f, score, best, text })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map(({ f, score, best, text }) => {
      const at = Math.max(0, text.indexOf(best) - 50)
      return { file: f, score, snippet: (this.text.get(f.id) ?? '').slice(at, at + 160).replace(/\s+/g, ' ') }
    })
  }

  async upload(mountId, name, buf, { level, by, subdir } = {}) {
    const m = this.mount(mountId)
    if (!m) throw Object.assign(new Error('目标目录不存在'), { status: 404 })
    if (m.readonly) throw Object.assign(new Error('该目录为只读挂载'), { status: 400 })
    if (!(await this.probe(m))) throw Object.assign(new Error(`${m.name} 当前离线，无法写入`), { status: 409 })
    const safe = basename(String(name)).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'upload.bin'
    const sub = subdir ? String(subdir).split(/[\\/]/).map(x => x.replace(/[:*?"<>|\u0000-\u001f]/g, '_')).filter(x => x && x !== '..').join('/') : ''
    const rel = sub ? `${sub}/${safe}` : safe
    const full = await this.safePath(m, rel).catch(() => join(m.path, rel))
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, buf)
    return this.index(m, rel, this.idFor(mountId, rel), full, await stat(full), this.file(this.idFor(mountId, rel)), { level, by })
  }

  /** 写入项目工作区（交付物版本文件），立即编入知识库。 */
  async writeWorkspace(rel, buf, extra = {}) {
    const m = this.db.one('mounts', x => x.kind === 'workspace')
    const full = join(m.path, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, buf)
    const id = this.idFor(m.id, rel)
    const f = await this.index(m, rel, id, full, await stat(full), this.file(id), extra)
    return { id, path: full, display: `${m.name}/${rel}`, file: f }
  }

  async setLevel(id, level) {
    const f = this.file(id)
    return this.db.putQuiet('files', { ...f, level, manualLevel: level })
  }
}
