// 外部项目方自助填报页（公开，无需登录）：只能看到字段名与说明，不暴露任何内部数据。
import { esc } from '/api/investai?asset=md.js'

const token = location.hash.slice(1)
history.replaceState(null, '', location.pathname + location.search) // 令牌不留在地址栏历史中
const root = document.getElementById('fill')
const api = (op, body) => fetch(`/api/investai?op=${op}${body ? '' : `&token=${encodeURIComponent(token)}`}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? '请求失败'); return j })
const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f) })

try {
  const f = await api('fill.public.get')
  root.innerHTML = `<h1>${esc(f.company || '项目')} · 信息填报</h1>
    <p class="muted">${esc(f.org ?? '')} 邀请您填写以下信息。链接有效期至 ${new Date(f.expiresAt).toLocaleString('zh-CN')}，仅可提交一次。</p>
    ${f.note ? `<div class="infobox">${esc(f.note)}</div>` : ''}
    <form id="ff">${f.fields.map(k => `<label class="f">${esc(k)}<textarea class="input area" name="${esc(k)}" rows="2"></textarea></label>`).join('')}
      ${f.allowFiles ? '<label class="f">附件（最多 3 个，合计不超过 5MB；PDF/Word/PPT/Excel/图片）<input type="file" id="files" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.md,.txt,.png,.jpg,.jpeg"></label>' : ''}
      <label class="f">填写人<input class="input" name="__submitter" placeholder="姓名 / 职务" required></label>
      <div id="err" class="bad" style="min-height:18px;font-size:12.5px"></div>
      <button class="btn pri" style="width:100%;height:40px">提交</button>
      <p class="dim" style="font-size:11.5px;margin-top:10px">提交的信息仅用于本次项目评估，将由机构内部人员核对确认。</p></form>`
  document.getElementById('ff').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const submitter = String(fd.get('__submitter') ?? '').trim()
    if (!submitter) return
    const values = Object.fromEntries([...fd.entries()].filter(([k, v]) => k !== '__submitter' && String(v).trim()))
    const picked = [...(document.getElementById('files')?.files ?? [])]
    if (picked.length > 3) return (document.getElementById('err').textContent = '附件最多 3 个')
    if (picked.reduce((s, x) => s + x.size, 0) > 5 * 1024 * 1024) return (document.getElementById('err').textContent = '附件合计不超过 5MB')
    e.target.querySelector('button').disabled = true
    try {
      const files = await Promise.all(picked.map(async x => ({ name: x.name, data: await toB64(x) })))
      const r = await api('fill.public.submit', { token, values, files, submitter })
      root.innerHTML = `<h1>提交成功</h1><p>感谢您的填写。回执编号：<b class="mono">${esc(r.receipt)}</b>。机构人员核对后会与您联系。</p>`
    } catch (err) { document.getElementById('err').textContent = err.message; e.target.querySelector('button').disabled = false }
  })
} catch (e) { root.innerHTML = `<h1>无法打开</h1><p class="muted">${esc(e.message)}</p>` }
