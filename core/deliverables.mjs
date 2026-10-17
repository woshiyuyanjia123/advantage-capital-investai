// 工作成果（需求 五）：真实 Word/PPT/Excel 文件 + 版本 + 编辑 + 审核 + 定稿 + 回滚。
// 每个版本 = 工作区里的一个真实文件 + 隐藏的 .versions/*.md 文本源（供 AI、差异比对、预览）。
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, dirname, extname } from 'node:path'
import { renderDocx, renderPptx, renderXlsx, blocks, extractAny } from './office.mjs'
import { WORK_TYPES } from './workflow.mjs'

const fail = (m, status = 400) => Object.assign(new Error(m), { status })
import { DL_STATUS as LABEL } from './lifecycle.mjs'

/** Markdown 中的表格 → Excel 工作表；没有表格时按行写入一列。 */
export function sheetsFromMarkdown(md, fallbackName = '内容') {
  const sheets = []
  let heading = fallbackName
  for (const b of blocks(md)) {
    if (b.t === 'h') heading = b.text.replace(/\*\*/g, '')
    if (b.t === 'table') sheets.push({ name: `${sheets.length + 1}-${heading}`.slice(0, 30), columns: b.head.map((h, i) => ({ header: h.replace(/\*\*/g, ''), key: `c${i}`, width: i ? 18 : 26 })), rows: b.rows.map(r => Object.fromEntries(b.head.map((_, i) => [`c${i}`, numeric(r[i])]))) })
  }
  if (!sheets.length) sheets.push({ name: fallbackName, columns: [{ header: '内容', key: 'c0', width: 100 }], rows: String(md).split('\n').filter(Boolean).map(l => ({ c0: l.replace(/^#+\s*|\*\*/g, '') })) })
  return sheets
}
const numeric = v => { const s = String(v ?? '').replace(/,/g, '').trim(); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : String(v ?? '').replace(/\*\*/g, '') }

export function createDeliverables({ db, kb, org, events, lifecycle }) {
  const meta = (user, reason, action) => ({ actor: user, reason, action })
  const projectDir = p => { const c = p.companyId ? db.get('companies', p.companyId) : null; return (c?.short ?? p.name).replace(/[\\/:*?"<>|]/g, '_') }

  async function render(format, { title, subtitle, markdown }) {
    if (format === 'docx') return renderDocx({ title, subtitle, markdown, footer: '本文件由 InvestAI 生成或编辑，正式使用以定稿版本为准。' })
    if (format === 'pptx') return renderPptx({ title, subtitle, markdown })
    if (format === 'xlsx') return renderXlsx({ title, sheets: sheetsFromMarkdown(markdown, title.slice(0, 20)) })
    return Buffer.from(markdown)
  }

  /**
   * 找到或创建某项工作的成果。优先：指定的工作 → 当前阶段同类工作 → 最近的同类工作；
   * 工作已有成果就用它；同类工作在不同阶段各自独立成果（如投前与退出阶段的交易文件）。
   * fresh：总是新建（如每场会议的纪要）。
   */
  function ensure(projectId, type, { workId, format, fresh = false, title } = {}, user) {
    const p = db.get('projects', projectId)
    if (!p) throw fail('项目不存在', 404)
    const works = p.works ?? []
    const work = (workId && works.find(w => w.id === workId)) ?? works.find(w => w.type === type && w.stageId === p.stageId && (!fresh || !w.deliverableId)) ?? (fresh ? null : works.filter(w => w.type === type).at(-1))
    if (!fresh) {
      const linked = work?.deliverableId && db.get('deliverables', work.deliverableId)
      if (linked) return linked
      if (!work) { const any = db.find('deliverables', x => x.projectId === projectId && x.type === type).sort((a, b) => (a.status === 'final') - (b.status === 'final'))[0]; if (any) return any }
    }
    const d = db.put('deliverables', { projectId, workId: work?.id ?? null, type, format: format ?? WORK_TYPES[type]?.format ?? 'docx', title: title ?? `${projectDir(p)} ${type}`, status: 'draft', versions: [] }, meta(user, `创建成果「${type}」`, 'create'))
    if (work && !work.deliverableId) db.put('projects', { ...p, works: works.map(w => w.id === work.id ? { ...w, deliverableId: d.id, status: w.status === 'todo' ? 'doing' : w.status } : w) }, meta(user, `关联成果「${type}」`, 'link'))
    return d
  }

  /** 新增版本：给 markdown 则按成果格式渲染；给 buffer（用户上传/Office 编辑）则原样保存并抽取文字。 */
  async function addVersion(user, d0, { markdown, buffer, ext, engine, cites = [], note = '', sources = 0, outline, citeCheck, review } = {}) {
    const d = db.get('deliverables', d0.id)
    const p = db.get('projects', d.projectId)
    const v = d.versions.length + 1
    const fileExt = ext ?? `.${d.format}`
    const base = `${projectDir(p)}/${d.type}/${d.type}-v${v}`
    let buf = buffer
    let text = markdown
    if (!buf) buf = await render(d.format, { title: d.title, subtitle: `${p.name} · v${v} · ${LABEL.draft}`, markdown })
    if (text === undefined) text = (await extractAny(buf, fileExt)).text
    const saved = await kb.writeWorkspace(`${base}${fileExt}`, buf, { by: user.name })
    const mdRel = `${projectDir(p)}/.versions/${d.type}-v${v}.md`
    const ws = db.one('mounts', x => x.kind === 'workspace')
    await mkdir(dirname(join(ws.path, mdRel)), { recursive: true })
    await writeFile(join(ws.path, mdRel), text ?? '')
    const version = { v, fileId: saved.id, path: saved.display, ext: fileExt, mdRel, by: user.name, byId: user.id, engine: engine ?? '人工', at: Date.now(), cites, note, sources, outline, citeCheck, review, bytes: buf.length }
    for (const c of cites) { const f = c.fileId && kb.file(c.fileId); if (f) db.putQuiet('files', { ...f, refs: (f.refs ?? 0) + 1 }) }
    const next = db.put('deliverables', { ...d, versions: [...d.versions, version], status: d.status === 'final' ? 'draft' : d.status }, meta(user, `新增 v${v}（${engine ?? '人工'}）${note ? `：${note}` : ''}`, 'version'))
    db.put('projects', { ...p, updatedAt: Date.now(), works: (p.works ?? []).map(w => w.deliverableId === d.id && w.status === 'todo' ? { ...w, status: 'doing' } : w) }, meta(user, `「${d.type}」新增 v${v}`, 'touch'))
    events?.emit('deliverable.version', { deliverable: next, version, user })
    return { deliverable: next, version }
  }

  async function versionText(d, v) {
    const ver = d.versions.find(x => x.v === Number(v)) ?? d.versions.at(-1)
    if (!ver) return ''
    const ws = db.one('mounts', x => x.kind === 'workspace')
    return readFile(join(ws.path, ver.mdRel), 'utf8').catch(() => '')
  }

  const canEdit = (user, d) => lifecycle.authorize(user, d, 'edit')

  /** 用本机 Office/WPS 打开：生成工作副本（不覆盖历史版本），返回路径。 */
  async function checkout(user, id, { open = true } = {}) {
    const d = db.get('deliverables', id)
    canEdit(user, d)
    const last = d.versions.at(-1)
    if (!last) throw fail('还没有任何版本可编辑')
    const src = await kb.pathOf(last.fileId)
    const work = src.replace(/(-v\d+)(\.\w+)$/, `-v${d.versions.length + 1}-编辑中$2`)
    await copyFile(src, work)
    const st = await stat(work)
    db.put('deliverables', { ...d, checkout: { by: user.id, name: user.name, path: work, at: Date.now(), mtime: st.mtimeMs } }, meta(user, '打开编辑（工作副本）', 'checkout'))
    if (open) openWithSystem(work)
    return { path: work }
  }

  /** 提交编辑：把工作副本保存为新版本。 */
  async function checkin(user, id, note = '') {
    const d = db.get('deliverables', id)
    canEdit(user, d)
    if (!d.checkout) throw fail('没有进行中的编辑')
    const st = await stat(d.checkout.path).catch(() => null)
    if (!st) throw fail('工作副本不存在（可能已被移动），请重新打开编辑')
    if (st.mtimeMs === d.checkout.mtime) throw fail('工作副本未修改：请在 Word/PPT/Excel 中保存后再提交', 409)
    const buf = await readFile(d.checkout.path)
    const r = await addVersion(user, { ...d, checkout: null }, { buffer: buf, ext: extname(d.checkout.path), engine: '人工编辑（Office）', note })
    db.put('deliverables', { ...db.get('deliverables', id), checkout: null }, meta(user, '编辑已提交', 'checkin'))
    return r
  }

  async function upload(user, id, name, buf, note = '') {
    const d = db.get('deliverables', id)
    canEdit(user, d)
    const ext = extname(name).toLowerCase()
    if (ext !== `.${d.format}` && ext !== '.md') throw fail(`请上传 ${d.format.toUpperCase()} 文件`)
    if (ext === '.md') return addVersion(user, d, { markdown: buf.toString('utf8'), engine: '人工上传（Markdown）', note })
    return addVersion(user, d, { buffer: buf, ext, engine: '人工上传', note })
  }

  async function saveText(user, id, markdown, note = '') {
    const d = db.get('deliverables', id)
    canEdit(user, d)
    return addVersion(user, d, { markdown, engine: '人工编辑', note })
  }

  function submit(user, id) {
    const d = db.get('deliverables', id)
    lifecycle.authorize(user, d, 'submit')
    const next = db.put('deliverables', { ...d, status: 'review', submittedBy: user.id, submittedAt: Date.now() }, meta(user, `提交审核 v${d.versions.length}`, 'submit'))
    events?.emit('deliverable.submitted', { deliverable: next, user })
    return next
  }

  /** 定稿（业务操作权限：材料定稿；只能从「待审核」定稿）。AI 不能调用。 */
  function finalize(user, id, { v } = {}) {
    const d = db.get('deliverables', id)
    const p = lifecycle.authorize(user, d, 'finalize')
    const fv = Number(v) || d.versions.length
    if (!d.versions.some(x => x.v === fv)) throw fail(`版本 v${fv} 不存在`, 404)
    return db.tx(() => {
      const next = db.put('deliverables', { ...d, status: 'final', finalV: fv, finalBy: user.name, finalAt: Date.now() }, meta(user, `定稿 v${fv}`, 'finalize'))
      db.put('projects', { ...p, works: (p.works ?? []).map(w => w.deliverableId === d.id ? { ...w, status: 'done' } : w) }, meta(user, `「${d.type}」定稿`, 'work.done'))
      events?.emit('deliverable.final', { deliverable: next, user })
      return next
    })
  }

  function reopen(user, id, reason) {
    const d = db.get('deliverables', id)
    lifecycle.authorize(user, d, 'reopen')
    if (!String(reason ?? '').trim()) throw fail('请填写撤回原因')
    return db.put('deliverables', { ...d, status: 'draft' }, meta(user, `撤回定稿：${reason}`, 'reopen'))
  }

  function reject(user, id, reason) {
    const d = db.get('deliverables', id)
    lifecycle.authorize(user, d, 'reject')
    if (!String(reason ?? '').trim()) throw fail('请填写退回意见')
    return db.put('deliverables', { ...d, status: 'draft', rejected: { by: user.name, reason, at: Date.now() } }, meta(user, `退回：${reason}`, 'reject'))
  }

  /** 恢复历史版本：复制旧版本为新版本（历史不被覆盖）。 */
  async function restore(user, id, v) {
    const d = db.get('deliverables', id)
    canEdit(user, d)
    const old = d.versions.find(x => x.v === Number(v))
    if (!old) throw fail('版本不存在', 404)
    const buf = await readFile(await kb.pathOf(old.fileId))
    return addVersion(user, d, { buffer: buf, ext: old.ext, markdown: await versionText(d, v), engine: `恢复自 v${old.v}`, cites: old.cites, note: `恢复 v${old.v}` })
  }

  return { ensure, addVersion, versionText, checkout, checkin, upload, saveText, submit, finalize, reopen, reject, restore, render, projectDir }
}

/** 用操作系统默认程序打开文件（Word/WPS/PowerPoint/Excel）。 */
export function openWithSystem(path) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [path]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', path]] : ['xdg-open', [path]]
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref() } catch { /* 无桌面环境时只返回路径 */ }
}

export async function writeTemp(dir, name, buf) {
  await mkdir(dirname(join(dir, name)), { recursive: true })
  await writeFile(join(dir, name), buf)
  return join(dir, name)
}
