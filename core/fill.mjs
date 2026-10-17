// 外部项目方自助填写（需求 六·场景一）：授权链接 → 填写 / 上传 → 待内部确认 → 写入同一套公司库。
// 链接只存哈希；有效期 1–14 天；单次提交；可撤销；附件 ≤3 个、合计 ≤5MB；外部人员拿不到任何内部访问权限。
import { createHash, randomBytes } from 'node:crypto'
import { SCHEMAS } from './extract.mjs'

const fail = (m, status = 400) => Object.assign(new Error(m), { status })
const hash = t => createHash('sha256').update(String(t)).digest('hex')
export const FILL_FIELDS = SCHEMAS.bp.fields.map(f => f[0]).filter(k => !['最近年度营业收入', '最近年度净利润'].includes(k)).concat(['最近年度营业收入', '最近年度净利润', '联系人', '联系电话'])
const OK_EXT = ['.pdf', '.pptx', '.docx', '.xlsx', '.csv', '.md', '.txt', '.png', '.jpg', '.jpeg']

export function createFill({ db, kb, org, notify, extractor }) {
  const meta = (user, reason, action) => ({ actor: user, reason, action })

  function create(user, { projectId, fields, days = 7, allowFiles = true, note = '', contact = '' }) {
    org.assert(user, 'fill.manage')
    const p = db.get('projects', projectId)
    org.assertProject(user, p)
    const fs = (fields ?? []).filter(f => FILL_FIELDS.includes(f))
    if (!fs.length) throw fail('请选择需要对方填写的字段')
    const d = Math.min(14, Math.max(1, Number(days) || 7))
    const token = randomBytes(24).toString('base64url')
    const link = db.put('fills', { projectId, companyId: p.companyId, tokenHash: hash(token), fields: fs, allowFiles: !!allowFiles, note: String(note).slice(0, 500), contact: String(contact).slice(0, 60), expiresAt: Date.now() + d * 864e5, status: 'open', createdBy: user.id }, meta(user, `发起外部填报（${d} 天有效）`, 'create'))
    return { ...link, token }
  }

  function revoke(user, id) {
    org.assert(user, 'fill.manage')
    const f = db.get('fills', id)
    if (!f) throw fail('链接不存在', 404)
    org.assertProject(user, db.get('projects', f.projectId))
    if (f.status !== 'open') throw fail('链接已结束', 409)
    return db.put('fills', { ...f, status: 'revoked' }, meta(user, '撤销填报链接', 'revoke'))
  }

  function byToken(token) {
    const f = db.one('fills', x => x.tokenHash === hash(token))
    if (!f) throw fail('链接无效', 404)
    if (f.status === 'revoked') throw fail('链接已被撤销', 410)
    if (f.status === 'submitted') throw fail('该链接已提交过，不能重复提交', 410)
    if (f.expiresAt < Date.now()) throw fail('链接已过期', 410)
    return f
  }

  /** 公开读取：只返回对方需要看到的内容（公司名、字段名、说明），不含任何内部数据。 */
  function publicGet(token) {
    const f = byToken(token)
    const c = f.companyId ? db.get('companies', f.companyId) : null
    return { company: c?.name ?? '', fields: f.fields, allowFiles: f.allowFiles, note: f.note, expiresAt: f.expiresAt, org: db.get('settings', 'main')?.org?.name }
  }

  async function publicSubmit(token, { values = {}, files = [], submitter = '' }) {
    const f = byToken(token)
    const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) => f.fields.includes(k) && String(v ?? '').trim()).map(([k, v]) => [k, String(v).trim().slice(0, 1000)]))
    if (!Object.keys(clean).length && !files.length) throw fail('请至少填写一项')
    if (files.length && !f.allowFiles) throw fail('该链接不允许上传附件')
    if (files.length > 3) throw fail('附件最多 3 个')
    const bufs = files.map(x => ({ name: String(x.name ?? 'file').slice(0, 100), buf: Buffer.from(String(x.data ?? ''), 'base64') }))
    if (bufs.reduce((s, x) => s + x.buf.length, 0) > 5 * 1024 * 1024) throw fail('附件合计不超过 5MB', 413)
    for (const x of bufs) { const ext = (x.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase(); if (!OK_EXT.includes(ext)) throw fail(`不支持的附件类型：${ext}`) }
    // 先占用链接（单次提交，防并发重复）
    const claimed = db.put('fills', { ...f, status: 'submitted', submittedAt: Date.now(), submitter: String(submitter).slice(0, 40) }, { actor: { id: 'external', name: `外部填报：${submitter || '未署名'}` }, reason: '外部提交', action: 'submit' })
    const c = f.companyId ? db.get('companies', f.companyId) : null
    const saved = []
    for (const x of bufs) saved.push(await kb.upload('m_up', x.name, x.buf, { level: 2, by: `外部填报：${submitter || '未署名'}`, subdir: `外部填报/${c?.short ?? f.projectId}` }))
    const rows = Object.entries(clean).map(([key, value]) => ({ key, value, status: 'found', source: { path: `外部填报（${submitter || '未署名'}）`, quote: value.slice(0, 120) } }))
    // 附件（营业执照、BP、财报等）自动提取：补充对方未填的字段；与填写值不一致的标为冲突，待内部核实
    const fromFiles = extractor ? await extractor.bpFromFiles(saved.map(x => x.id)).catch(() => []) : []
    for (const r of fromFiles.filter(r => r.value)) {
      const mine = rows.find(x => x.key === r.key)
      if (!mine) rows.push({ ...r, status: r.status === 'conflict' ? 'conflict' : 'found' })
      else if (String(mine.value).replace(/\s/g, '') !== String(r.value).replace(/\s/g, '')) Object.assign(mine, { status: 'conflict', alternatives: [{ value: r.value, source: r.source }] })
    }
    const x = db.put('extractions', { projectId: f.projectId, companyId: f.companyId, schema: 'bp', name: '外部填报信息', origin: 'fill', fillId: f.id, rows, missing: f.fields.filter(k => !rows.some(r => r.key === k)), conflicts: rows.filter(r => r.status === 'conflict').map(r => r.key), sources: saved.map((s, i) => ({ n: i + 1, fileId: s.id, path: `我的上传/${s.rel}` })), engine: fromFiles.length ? '外部填写 + 附件提取' : '外部填写', status: 'pending', by: `外部：${submitter || '未署名'}` }, { actor: { id: 'external', name: '外部填报' }, reason: '外部填报待确认', action: 'create' })
    await notify.notify([f.createdBy], { kind: 'fill', title: `外部填报已提交：${c?.short ?? ''}`, text: `${Object.keys(clean).length} 个字段、${saved.length} 个附件，待内部确认后入库。`, projectId: f.projectId })
    return { ok: true, receipt: claimed.id.slice(-6), extractionId: x.id }
  }

  return { create, revoke, publicGet, publicSubmit, FILL_FIELDS }
}
