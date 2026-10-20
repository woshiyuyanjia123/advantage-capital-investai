// 前端共享：状态、接口、图标、格式化、弹窗/抽屉/浮层、上传下载。各视图模块从这里导入。
import { md, esc, csv } from '/api/investai?asset=md.js'
export { md, esc, csv }

export const API = '/api/investai'
export const $ = (s, el = document) => el.querySelector(s)
export const $$ = (s, el = document) => [...el.querySelectorAll(s)]
export const EMBED = document.documentElement.dataset.embedded === '1'
export const VERSION = 'v2.1'

// ───────── 状态 ─────────
export const S = {
  data: null, meta: null, view: 'workbench', sub: '', sel: null, project: null, ptab: 'works',
  aiOpen: innerWidth >= 1100, atab: 'chat', ctx: { fileIds: [] }, chat: [], live: new Map(),
  files: [], filters: { q: '', bt: '', stage: '', status: 'active', owner: '' }, layout: 'table',
  kb: { mount: '', q: '' }, wis: { resource: 'reports', q: '', items: [], cursor: null, loading: false, err: '' },
}
export const D = () => S.data
export const can = f => !!D()?.caps?.functions?.includes(f)
export const canOp = o => !!D()?.caps?.ops?.includes(o)
export const user = id => D()?.users.find(u => u.id === id)
export const userName = id => user(id)?.name ?? (id === 'system' ? '系统' : id ?? '—')
export const proj = id => D()?.projects.find(p => p.id === id)
export const LEVELS = ['公开', '内部', '机密', '绝密']
export const LEVEL_TONE = ['real', '', 'amber', 'red']
export const DL_STATUS = { draft: '草稿', review: '待审核', final: '已定稿' }
export const WORK_STATUS = { todo: '待开始', doing: '进行中', done: '已完成', rework: '需补充' }
export const P_STATUS = { active: '进行中', paused: '已暂停', terminated: '已放弃', completed: '已完成' }
export const RESULT = { pass: '通过', return: '退回补充', reject: '否决', hold: '继续持有' }
export const RULE = { any: '任一通过', all: '全体通过', majority: '过半数通过', two_thirds: '三分之二通过' }

// 动作与视图注册表：各模块 Object.assign(ACT, {...}) / VIEWS[x] = fn
export const ACT = {}
export const VIEWS = {}
export const hooks = { reload: async () => {}, go: () => {}, send: async () => {}, fill: () => {}, track: () => {}, renderAI: () => {} }

// ───────── 接口 ─────────
export async function call(op, body, params = {}) {
  const r = await fetch(`${API}?${new URLSearchParams({ op, ...params })}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({ error: `服务响应异常（${r.status}）` }))
  if (r.status === 401 && j.login) { window.dispatchEvent(new CustomEvent('investai:login', { detail: j })); throw new Error('请先登录') }
  if (!r.ok) throw Object.assign(new Error(j.error ?? '请求失败'), { status: r.status })
  return j
}
export const get = (op, params) => call(op, undefined, params)
export const post = (op, body = {}) => call(op, body)
/** 执行接口并提示结果；失败时弹出权限/校验原因。 */
export async function act(op, body, okText) {
  try { const r = await post(op, body); if (okText) toast(okText, 'ok'); return r } catch (e) { toast(e.message, 'deny'); return null }
}

// ───────── 图标 ─────────
const P = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
  flow: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  extract: '<path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6M8 14h8M8 18h5"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18"/>',
  industry: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  kb: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M8 7h8M8 11h6"/>',
  tpl: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  bot: '<path d="M12 3v3M8 21h8M5 10a7 7 0 0 1 14 0v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M9.5 12h.01M14.5 12h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  chev: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 18-6-6 6-6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  send: '<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', circle: '<circle cx="12" cy="12" r="8"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>', vote: '<path d="M9 12l2 2 4-4M5 4h14v16H5z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>', play: '<path d="M7 4l12 8-12 8z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', open: '<path d="M14 3h7v7M10 14 21 3M21 14v7H3V3h7"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z"/>',
}
export const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] ?? P.file}</svg>`
const AV = ['#4F46E5', '#2563EB', '#0891B2', '#7C3AED', '#DB2777', '#059669', '#D97706', '#DC2626']
export const avColor = name => AV[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length]
export const avatar = (name, size = 26) => `<span class="av" style="width:${size}px;height:${size}px;background:${avColor(name)};font-size:${Math.round(size * .42)}px" title="${esc(name)}">${esc(String(name ?? '?').slice(0, 1))}</span>`
const FTYPE = { '.md': ['MD', '#2563EB'], '.csv': ['CSV', '#059669'], '.xlsx': ['X', '#059669'], '.docx': ['W', '#2563EB'], '.pptx': ['P', '#EA580C'], '.pdf': ['PDF', '#DC2626'], '.txt': ['TXT', '#64748B'], '.m4a': ['♪', '#7C3AED'], '.mp3': ['♪', '#7C3AED'], '.wav': ['♪', '#7C3AED'] }
export const ficon = (ext, small) => { const [t, c] = FTYPE[ext] ?? ['F', '#64748B']; return `<span class="fi${small ? ' sm' : ''}" style="background:${c}">${t}</span>` }
export const levelTag = l => `<span class="tag lv${l ?? 1}" title="资料密级">${LEVELS[l ?? 1]}</span>`

// ───────── 格式化 ─────────
const pad = n => String(n).padStart(2, '0')
export const ymd = ts => { if (!ts) return '—'; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const fmt = ts => ts ? `${ymd(ts)} ${hm(ts)}` : '—'
export const rel = ts => { if (!ts) return '—'; const s = (Date.now() - ts) / 1000; return s < 0 ? `${Math.ceil(-s / 86400)} 天后` : s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前` }
export const size = b => b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(1)} GB`
export const due = ts => { if (!ts) return '<span class="dim">无期限</span>'; const d = Math.ceil((ts - Date.now()) / 864e5); return `<span class="${d < 0 ? 'bad' : d <= 2 ? 'warn-t' : ''}">${ymd(ts)}${d < 0 ? `（逾期 ${-d} 天）` : d <= 2 ? `（${d} 天内）` : ''}</span>` }
export const opts = (list, cur, all) => (all !== undefined ? `<option value="">${esc(all)}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')
export const empty = (text, extra = '') => `<div class="empty">${esc(text)}${extra}</div>`
export const lockBtn = (ok, html, why) => ok ? html : html.replace('<button', `<button disabled title="${esc(why ?? '当前岗位无此权限')}"`)
/**
 * 按后端的权限判定绘制按钮：允许时正常可点；不允许时显示为灰色但仍可点，点击会说明原因与可操作的人
 * （比直接禁用更易理解）。can 来自接口返回的 { ok, why }。
 */
export function gated(can, html) {
  if (!can || can.ok) return html
  return html.replace(/<button([^>]*?)class="([^"]*)"/, `<button$1class="$2 nope" data-why="${esc(can.why ?? '当前不可操作')}"`).replace(/data-act="[^"]*"/, 'data-act="explain"')
}
/** 后端词表同步到前端常量（meta 接口返回 vocab）。 */
export function applyVocab(v) {
  if (!v) return
  Object.assign(DL_STATUS, v.deliverable); Object.assign(WORK_STATUS, v.work); Object.assign(P_STATUS, v.project); Object.assign(RESULT, v.result); Object.assign(RULE, v.rule)
}
export const roleName = id => S.meta?.roles?.find(r => r.id === id)?.name ?? id
export const AI_LEVEL = ['关闭', '辅助建议', '起草待确认', '授权执行']

// ───────── 提示 / 弹窗 / 抽屉 / 浮层 ─────────
export function toast(text, tone = '') { const el = document.createElement('div'); el.className = `toast ${tone}`; el.textContent = tone === 'deny' && !/^⚠/.test(text) ? `⚠️ ${text}` : text; $('#toasts').append(el); setTimeout(() => el.remove(), tone === 'deny' ? 5000 : 2800) }

export function dialog(html, { wide } = {}) {
  const el = $('#modal')
  el.innerHTML = `<div class="dialog${wide ? ' wide' : ''}">${html}</div>`
  el.hidden = false
  return new Promise(resolve => {
    const done = v => { el.hidden = true; el.onclick = null; resolve(v) }
    el.onclick = e => {
      const b = e.target.closest('[data-dlg]')
      if (e.target === el || b?.dataset.dlg === 'no') done(null)
      if (b?.dataset.dlg === 'ok') {
        const vals = {}
        for (const i of el.querySelectorAll('[name]')) {
          if (i.type === 'checkbox') { if (i.dataset.multi !== undefined) { (vals[i.name] ??= []); if (i.checked) vals[i.name].push(i.value) } else vals[i.name] = i.checked }
          else if (i.type === 'radio') { if (i.checked) vals[i.name] = i.value }
          else if (i.multiple) vals[i.name] = [...i.selectedOptions].map(o => o.value)
          else vals[i.name] = i.value
        }
        const req = [...el.querySelectorAll('[required]')].find(i => !i.value.trim())
        if (req) { req.focus(); req.classList.add('err'); return }
        done(vals)
      }
    }
    setTimeout(() => el.querySelector('input:not([type=checkbox]):not([type=radio]), textarea')?.focus(), 30)
  })
}
export const confirmBox = (title, body, { danger, okText = '确认', typed } = {}) => dialog(`<h3>${esc(title)}</h3><div class="${danger ? 'warnbox' : 'infobox'}">${body}</div>${typed ? `<label class="f">请输入「${esc(typed)}」以确认<input class="input" name="confirm" autocomplete="off" required></label>` : ''}<div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn ${danger ? 'danger' : 'pri'}" data-dlg="ok">${esc(okText)}</button></div>`)
export const askText = (title, label, { placeholder = '', required = true, value = '', area = true } = {}) => dialog(`<h3>${esc(title)}</h3><label class="f">${esc(label)}${area ? `<textarea class="input area" name="text" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>${esc(value)}</textarea>` : `<input class="input" name="text" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>`}</label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">确定</button></div>`).then(r => r?.text ?? null)

export function drawer(html, wide) { const el = $('#drawer'); el.className = `drawer${wide ? ' wide' : ''}`; el.innerHTML = html; el.hidden = false }
export function closeDrawer() { $('#drawer').hidden = true; S.drawer = null }
export const drawerHead = (title, sub = '', extra = '') => `<header><div class="row"><span class="fn grow ell">${title}</span>${extra}<button class="btn ghost sm ico" data-act="drawer-close" title="关闭">${icon('x', 15)}</button></div>${sub ? `<div class="dsub">${sub}</div>` : ''}</header>`

export function popup(content, x, y, w = 220) {
  closePopup()
  const el = document.createElement('div')
  el.className = 'popup'
  el.id = 'popup'
  el.style.cssText = `left:${Math.max(8, Math.min(x, innerWidth - w - 8))}px;top:${y}px;width:${w}px;max-height:70vh;overflow:auto`
  el.innerHTML = content
  document.body.append(el)
  const r = el.getBoundingClientRect()
  if (r.bottom > innerHeight - 8) el.style.top = `${Math.max(8, innerHeight - r.height - 8)}px`
}
export function closePopup() { $('#popup')?.remove() }
export function menuAt(el, items, w = 220) { const r = el.getBoundingClientRect(); popup(items.filter(Boolean).join(''), r.right - w, r.bottom + 4, w) }
export const mi = (actName, label, data = {}, { ic, danger, disabled, why } = {}) => `<div class="it${danger ? ' danger' : ''}${disabled ? ' off' : ''}" ${disabled ? `title="${esc(why ?? '无权限')}"` : `data-act="${actName}"`} ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${ic ? icon(ic, 13) : ''}<span class="grow">${esc(label)}</span>${disabled ? icon('lock', 12) : ''}</div>`

// ───────── 上传 / 下载 ─────────
export const toB64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file) })
export function pick({ multiple = true, accept = '' } = {}) {
  return new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.multiple = multiple; input.accept = accept; input.onchange = () => resolve([...input.files]); input.click() })
}
export function saveBlob(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 8000)
}
export const saveText = (name, text, type = 'text/markdown') => saveBlob(name, new Blob([text], { type }))
export function saveB64(name, b64, type) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); saveBlob(name, new Blob([u], { type })) }
export const rawUrl = (fileId, inline) => `${API}?op=file.raw&id=${encodeURIComponent(fileId)}${inline ? '&inline=1' : ''}`
export function downloadFile(fileId) { const a = document.createElement('a'); a.href = rawUrl(fileId); a.download = ''; document.body.append(a); a.click(); a.remove() }

/** 浏览器打印为 PDF（Markdown 渲染为排版页面）。 */
// 打印 / 导出 PDF：在页面内的隐藏 iframe 中排版后调用系统打印对话框（可「存储为 PDF」）。
// 不用 window.open：DSH 桌面版禁止非 http(s) 的新窗口，弹窗拦截也会让它失效。
export function printDoc(title, markdown, meta = '') {
  document.getElementById('print-frame')?.remove()
  const f = document.createElement('iframe')
  f.id = 'print-frame'
  f.setAttribute('aria-hidden', 'true')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.append(f)
  const w = f.contentWindow
  if (!w) return toast('无法打开打印：请改用下载 Word 版本', 'deny')
  w.document.open()
  w.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.75 "PingFang SC","Microsoft YaHei",sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px}h1{font-size:22px;border-bottom:2px solid #1E3A8A;padding-bottom:8px;color:#0F172A}h2{font-size:17px;color:#1E3A8A;margin-top:22px}h3{font-size:15px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}th,td{border:1px solid #CBD5E1;padding:5px 8px;text-align:left}th{background:#EFF4FB}blockquote{border-left:3px solid #94A3B8;margin:8px 0;padding:4px 12px;color:#475569;background:#F8FAFC}.meta{color:#64748B;font-size:12px;margin-bottom:18px}.cite,.cite-x{font-size:10px;color:#1E40AF;vertical-align:super;border:0;background:none;padding:0}@page{margin:18mm}</style></head><body><h1>${esc(title)}</h1><div class="meta">${esc(meta)}</div>${md(markdown)}</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { toast('无法打开打印：请改用下载 Word 版本', 'deny') } }, 300)
}

/** 简易折线图（SVG），用于行情与指标。 */
export function sparkline(series, w = 120, h = 32) {
  const ys = series.map(x => x[1]).filter(Number.isFinite)
  if (ys.length < 2) return ''
  const min = Math.min(...ys), max = Math.max(...ys)
  const pts = ys.map((y, i) => `${(i / (ys.length - 1)) * w},${h - 2 - ((y - min) / (max - min || 1)) * (h - 4)}`).join(' ')
  const up = ys.at(-1) >= ys[0]
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${up ? '#10B981' : '#EF4444'}" stroke-width="1.6"/></svg>`
}
