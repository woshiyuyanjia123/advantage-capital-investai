// 深蓝投研工作台 · InvestAI v2 前端外壳（零构建 ES 模块）
// 顶栏 | 左导航（DSH 内嵌时由 DSH 原生侧栏代替）| 中栏视图 | 右栏 AI 协作
import { S, D, ACT, VIEWS, hooks, $, esc, gated, applyVocab, roleName, AI_LEVEL, md, icon, avatar, avColor, ficon, get, post, act, toast, popup, closePopup, closeDrawer, drawer, drawerHead, dialog, pick, toB64, can, proj, fmt, ymd, size, rel, levelTag, EMBED, VERSION, userName, LEVELS, saveB64, rawUrl, downloadFile, currentTheme, toggleTheme } from '/api/investai?asset=ui.js'
import '/api/investai?asset=views/work.js'
import '/api/investai?asset=views/project.js'
import '/api/investai?asset=views/data.js'
import '/api/investai?asset=views/admin.js'
import '/api/investai?asset=views/nb-api-modal.js'
import '/api/investai?asset=views/nb-shelf.js'
import '/api/investai?asset=views/nb-studio-ppt.js'
import '/api/investai?asset=views/nb-studio-word.js'
import '/api/investai?asset=views/nb-studio-audio.js'
import '/api/investai?asset=views/nb-boards.js'
import '/api/investai?asset=views/nb-workspace.js'
import '/api/investai?asset=views/nb-flow-board.js'

const hash = location.hash.slice(1)
if (hash) [S.view, S.sub] = hash.split(':')

// ───────── 载入 / 轮询 ─────────
async function loadState() {
  S.data = await get('state')
  renderChrome()
  refreshView()
  renderAI()
}
hooks.reload = async ({ files = true } = {}) => { if (files) S.files = await get('files').catch(() => []); await loadState(); if (S.view === 'project' && S.sel) await hooks.loadProject?.() }
let polling = false
setInterval(async () => {
  if (!S.data || document.hidden || polling) return
  polling = true
  try { const { rev } = await get('rev'); if (rev !== D().rev) await hooks.reload() } catch { /* 下次重试 */ } finally { polling = false }
}, 2000)

// ───────── 顶栏 ─────────
function modelStat() {
  const m = D().model
  if (m.ok) return m.verified ? ['ok', m.label] : ['warn', `${m.label}（待验证）`]
  return ['warn', '离线引擎']
}
function renderHdr() {
  const d = D()
  const nas = d.mounts.find(m => m.kind === 'nas')
  const [mc, mt] = modelStat()
  const w = d.wisburg
  const route = { hybrid: '混合路由', local: '仅本地', external: '外部模型' }[d.model.mode] ?? d.model.mode
  $('#hdr').innerHTML = `
    <div class="logo"><span class="mk">AC /</span><span class="nm">优势资本 · 智能投研</span><span class="ver">${esc(d.settings.org?.name ?? '')} · DSH 插件版</span></div>
    <div class="gsearch"><span class="ic">${icon('search', 15)}</span><input id="gsearch" placeholder="搜索项目、资料，或直接提问…" autocomplete="off"><span class="kbd">⌘ K</span></div>
    <button class="nb-api-pill" data-act="nb-api" title="点击配置本地离线 API / DSH / 云端 API"><span class="dot ${mc}"></span><span>${esc(route)} · ${esc(mt)}</span></button>
    <button class="btn ghost sm" data-act="top-settings-menu" title="设置、账户与帮助">${icon('set', 15)}<span>设置与帮助</span></button>
    <button class="btn ghost ico bellbtn" data-act="notifications" title="通知">${icon('bell', 17)}${d.unread ? `<i>${d.unread > 99 ? '99+' : d.unread}</i>` : ''}</button>
    <button class="me-btn" data-act="persona" title="${esc(d.me.name)} · ${esc(d.me.title)}（${esc(d.caps.roleNames.join('、'))}）"><span class="avatar" style="background:${avColor(d.me.name)}">${esc(d.me.name.slice(0, 1))}</span><span class="me-n"><b>${esc(d.me.name)}</b><span>${esc(d.caps.roleNames[0] ?? '')}</span></span>${icon('chev', 14)}</button>`
  const input = $('#gsearch')
  input.value = searchTerm
  input.addEventListener('input', () => { searchTerm = input.value; clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 180) })
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && searchTerm.trim() && !$('#popup .it.on')) { closePopup(); fill(searchTerm.trim()); send() } if (e.key === 'Escape') closePopup() })
}

// ───────── 左导航 ─────────
export const NAV = () => {
  const d = D()
  return [
    ['workbench', 'grid', '投研项目总览', d.projects.filter(p => p.status === 'active').length],
    ['notebook', 'spark', '尽调与研判工作台'],
    ['flowboard', 'flow', '阶段门禁与投决中心'],
    ['knowledge', 'kb', '底稿资料库', d.kpi.kbFiles],
    ['settings', 'set', '机构治理与模型配置'],
  ]
}
function renderNav() {
  if (EMBED) return
  const d = D()
  const caps = d.caps
  $('#nav').innerHTML = `<div class="menu">${NAV().map(([v, ic, label, n]) => `<button class="${S.view === v || (v === 'pipeline' && S.view === 'project') ? 'on' : ''}" data-act="go" data-view="${v}" title="${label}">${icon(ic, 17)}<span class="lbl">${label}</span>${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="store"><h4>我的权限</h4>
      <div class="sr"><span class="dot ok"></span><span>数据范围</span><span class="ell">${esc(caps.scopes.map(s => ({ own: '本人', dept: '本部门', assigned: '指定授权', postinv: '投后', all: '全机构' }[s])).join('、'))}</span></div>
      <div class="sr"><span class="dot ${caps.clearance >= 2 ? 'ok' : 'warn'}"></span><span>资料密级</span><span>≤ ${LEVELS[caps.clearance]}</span></div>
      <div class="sr"><span class="dot ${caps.ai >= 2 ? 'ok' : 'warn'}"></span><span>AI 参与</span><span>${['关闭', '辅助建议', '起草待确认', '授权执行'][caps.ai]}</span></div>
      <p>${caps.categories.length ? `可见敏感字段：${esc(caps.categories.map(c => ({ amount: '金额', valuation: '估值', terms: '条款', fund_lp: 'LP 信息', trade_secret: '商业秘密' }[c])).join('、'))}` : '敏感字段（金额/估值/条款）已对你脱敏'}</p></div>`
}
function renderChrome() {
  const hideRight = !S.aiOpen || ['notebook', 'workbench', 'flowboard'].includes(S.view)
  const full3Col = ['notebook', 'flowboard'].includes(S.view)
  $('#app').classList.toggle('embed', EMBED || full3Col)
  $('#app').classList.toggle('ai-off', hideRight)
  renderHdr(); renderNav()
}

let searchTerm = ''
let searchTimer
async function runSearch() {
  const q = searchTerm.trim()
  if (!q) return closePopup()
  const r = await get('search', { q }).catch(() => null)
  if (!r || searchTerm.trim() !== q) return
  const box = $('#gsearch').getBoundingClientRect()
  popup([
    r.projects.length ? `<div class="hd">项目</div>${r.projects.map(p => `<div class="it" data-act="open-project" data-id="${p.id}">${icon('grid', 13)}<span class="grow ell">${esc(p.name)}</span><span class="dim">${esc(p.stage)}</span></div>`).join('')}` : '',
    r.companies.length ? `<div class="hd">公司</div>${r.companies.map(c => `<div class="it" data-act="open-company" data-id="${c.id}">${icon('building', 13)}<span class="grow ell">${esc(c.name)}</span></div>`).join('')}` : '',
    r.files.length ? `<div class="hd">资料</div>${r.files.map(f => `<div class="it" data-act="file" data-id="${f.id}">${icon('file', 13)}<div class="grow" style="min-width:0"><div class="ell">${esc(f.name)}</div><div class="dim ell" style="font-size:11px">${esc(f.snippet)}</div></div></div>`).join('')}` : '',
    `<div class="hd">更多</div><div class="it" data-act="wis-search" data-q="${esc(q)}">${icon('globe', 13)}<span class="grow">在智堡研报中搜索「${esc(q)}」</span></div><div class="it" data-act="ask" data-q="${esc(q)}">${icon('bot', 13)}<span class="grow">问 AI：${esc(q)}</span><span class="dim">Enter</span></div>`,
  ].join(''), box.left, box.bottom + 4, Math.max(box.width, 380))
}

// ───────── 路由（DSH 内嵌时与宿主侧栏双向同步） ─────────
function go(view, { sub, fromHost, id } = {}) {
  if (view === 'assistant') { S.aiOpen = true; S.atab = 'chat'; renderChrome(); renderAI(); $('#prompt')?.focus(); return }
  if (['project', 'notebook', 'flowboard'].includes(view) && id) { S.sel = id; S.project = null; sub = id }
  S.sub = sub ?? (view === S.view ? S.sub : '')
  const changed = S.view !== view
  S.view = view
  closePopup()
  renderChrome()
  renderView()
  history.replaceState(null, '', `#${view}${S.sub ? `:${S.sub}` : ''}`)
  if (EMBED && !fromHost && changed) parent.postMessage({ type: 'investai:view', view: view === 'project' ? 'pipeline' : view }, location.origin)
}
hooks.go = go
// 地址栏 #视图[:参数] 变化（手动输入、前进后退）时跳转
window.addEventListener('hashchange', () => {
  const [view, sub] = location.hash.slice(1).split(':')
  if (!S.data || !VIEWS[view] || (view === S.view && (sub ?? '') === (S.sub ?? ''))) return
  view === 'project' && sub ? go('project', { id: sub }) : go(view, { sub })
})
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.data?.type !== 'investai:go') return
  const [view, sub] = String(e.data.view).split(':')
  if (S.data) go(view, { sub, fromHost: true }); else { S.view = view; S.sub = sub ?? '' }
})
function renderView() {
  const v = $('#view')
  const fn = VIEWS[S.view] ?? VIEWS.workbench
  v.innerHTML = ''
  fn(v)
  const nas = D().mounts.find(m => m.kind === 'nas')
  if (nas && !nas.online) v.querySelector('.page')?.insertAdjacentHTML('afterbegin', `<div class="banner">⚠ ${esc(nas.name)} 未连接 · 正在使用缓存索引，预览与 AI 引用读取本地缓存<span class="grow"></span><button class="btn sm" data-act="rescan" data-id="${nas.id}">重新探测</button></div>`)
}
function refreshView() {
  if (document.activeElement?.closest('#view input, #view textarea, #view select')) return
  if ($('#modal') && !$('#modal').hidden) return
  const keep = $('#view .page')?.scrollTop
  renderView()
  if (keep) { const pg = $('#view .page'); if (pg) pg.scrollTop = keep }
}
hooks.refresh = refreshView

// ───────── 右栏 AI 协作 ─────────
const ATABS = [['chat', '对话'], ['draft', '起草成果'], ['parse', '资料解析']]
function renderAIShell() {
  $('#ai').innerHTML = `<div class="ai-hd"><span class="t grow">AI 协作助手</span><button class="btn ghost sm" data-act="chat-clear" title="清空对话">清空</button><button class="btn ghost sm ico" data-act="ai-info" title="模型路由与 AI 权限说明">${icon('info', 15)}</button><button class="btn ghost sm ico" data-act="ai-toggle" title="收起">${icon('x', 15)}</button></div>
    <div class="atabs" id="atabs"></div><div class="ctxcard" id="actx"></div><div class="abody" id="abody"></div>
    <div class="composer"><div class="cbox"><textarea id="prompt" rows="2"></textarea>
      <div class="bar"><button class="btn ghost sm ico" data-act="attach" title="附件：上传文件给 AI（存入我的上传）">${icon('clip', 15)}</button>
        <span class="route" id="routeHint"></span>
        <button class="send" id="sendBtn" data-act="send" title="发送（Enter）">${icon('send', 15)}</button></div></div></div>`
  const ta = $('#prompt')
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } })
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(160, ta.scrollHeight)}px` })
}
const ctxProject = () => (S.view === 'project' ? proj(S.sel) : null) ?? proj(S.sel)
function renderAI() {
  if (!S.data || !$('#atabs')) return
  const p = ctxProject()
  const caps = D().caps
  $('#atabs').innerHTML = ATABS.map(([k, l]) => `<button class="${S.atab === k ? 'on' : ''}" data-act="atab" data-k="${k}">${l}</button>`).join('')
  const files = S.ctx.fileIds.map(id => S.files.find(f => f.id === id)).filter(Boolean)
  $('#actx').innerHTML = `<div class="hd">${icon('file', 13)}当前上下文<button class="lnk" data-act="pick-project">${p ? '更换项目' : '选择项目'}</button></div>
    <div class="bd">${p ? `<b>${esc(p.name)}</b><span class="tag blue">${esc(p.businessName ?? '')}</span><span class="tag">${esc(p.stage ?? '')}</span>` : '<span class="dim">未选择项目（通用问答）</span>'}</div>
    ${files.length ? `<div class="att">${files.map(f => `<span>📎 ${esc(f.name)}<button data-act="ctx-file" data-id="${f.id}">×</button></span>`).join('')}</div>` : ''}`
  $('#prompt').placeholder = caps.ai === 0 ? '你的岗位未开通 AI 协作' : { chat: `例如：${p ? `检查${p.name}能否发起${p.stage}决策；总结尽调风险` : '搜索智堡最近关于储能的研报并总结'}`, draft: '描述起草要求，例如：重点写风险与估值，篇幅 3 页', parse: '选择上方资料点「解析」，或输入问题' }[S.atab]
  $('#prompt').disabled = caps.ai === 0
  const m = D().model
  $('#routeHint').textContent = `${['关闭', '辅助建议', '起草待确认', '授权执行'][caps.ai]} · ${m.ok ? m.label : '离线引擎'}`
  renderAIBody()
}
hooks.renderAI = renderAI
function renderAIBody(force) {
  const host = $('#abody')
  if (!host || !S.data) return
  const p = ctxProject()
  if (S.atab === 'chat') {
    const near = force || host.scrollHeight - host.scrollTop - host.clientHeight < 80
    host.innerHTML = S.chat.length ? S.chat.map(msgHTML).join('') : `<div class="dim" style="font-size:12.5px;line-height:1.9">AI 按你的岗位权限读取资料：只能看到你有权看到的项目与资料，敏感字段自动脱敏，机密资料只交给本地模型处理。AI 不做表决、定稿、推进阶段等正式决策。<br>试试：<br>${[p ? `${p.name}当前阶段还缺哪些材料？` : '列出我负责的项目和待办', p ? `为${p.name}起草${p.stage === '尽职调查' ? '尽调报告' : '立项报告'}` : '搜索智堡最近一周关于储能的研报', '公司观点库里我们对半导体行业怎么看？'].map(t => `<button class="src" data-act="fill" data-text="${esc(t)}" style="margin:3px 0">${esc(t)}</button>`).join('<br>')}</div>`
    if (near) host.scrollTop = host.scrollHeight
  } else if (S.atab === 'draft') host.innerHTML = draftPanel(p)
  else {
    const files = p ? S.files.filter(f => f.company === p.company && f.chars > 0 && !f.rel.includes('.versions')) : S.files.filter(f => S.ctx.fileIds.includes(f.id))
    const job = S.parse && S.live.get(S.parse.jobId)
    host.innerHTML = `<div class="dim" style="font-size:12px">选择资料，AI 提炼要点、关键数据与风险（逐条引用原文）。机密资料按策略仅本地处理。</div><div class="lst">${files.map(f => `<div class="li" style="cursor:default">${ficon(f.ext, true)}<span class="grow ell" data-act="file" data-id="${f.id}" style="cursor:pointer">${esc(f.name)}</span>${levelTag(f.level)}<button class="btn sm ${S.parse?.fileId === f.id ? 'pri' : ''}" data-act="parse" data-id="${f.id}">解析</button></div>`).join('') || '<div class="empty">没有可解析的文字资料</div>'}</div>${job ? msgHTML({ role: 'ai', jobId: job.id, job }) : ''}`
  }
}

function draftPanel(p) {
  if (!p) return '<div class="empty">先在「项目管理」中打开一个项目，或点上方「选择项目」。</div>'
  const caps = D().caps
  if (caps.ai < 2) return '<div class="empty">你的 AI 参与级别为「辅助建议」，不能让 AI 起草成果。</div>'
  const detail = S.project?.project.id === p.id ? S.project : null
  const works = detail ? detail.works.filter(w => w.stageId === p.stageId) : []
  const types = [...new Set([...works.map(w => w.type), ...(S.draftTypes ?? [])])]
  const cur = S.draftType && types.includes(S.draftType) ? S.draftType : types[0]
  const plan = S.plan?.projectId === p.id && S.plan.type === cur ? S.plan : null
  const live = [...S.live.values()].find(j => j.status === 'running' && j.projectId === p.id && j.kind === 'generate') ?? [...S.live.values()].filter(j => j.projectId === p.id && j.kind === 'generate' && j.type === cur).at(-1)
  const wt = D().workTypes[cur] ?? {}
  const aiCan = detail?.works.find(w => w.type === cur && w.stageId === p.stageId)?.can?.aiWrite ?? detail?.works.find(w => w.type === cur)?.can?.aiWrite
  return `<div class="chips">${types.map(t => `<button class="tag ${t === cur ? 'blue' : ''}" data-act="draft-type" data-t="${esc(t)}" style="cursor:pointer">${esc(t)}</button>`).join('') || '<span class="dim">当前阶段没有工作项</span>'}</div>
    ${cur ? `<div class="paper"><div class="row"><b>${esc(cur)}</b><span class="tag">${esc((wt.format ?? 'docx').toUpperCase())}</span><span class="tag">${esc({ standard: '标准文书 · 固定模板填充', extract: '结构化提取', research: '研究类 · AI 规划结构', table: '表格', meeting: '会议纪要' }[wt.kind] ?? '研究类')}</span></div>
      <div class="dim" style="font-size:12px;margin-top:6px">${wt.kind === 'standard' ? '按机构标准模板填充字段，不调用模型；缺失字段标注【待补充】，不会编造。' : wt.kind === 'extract' ? '从项目资料中提取字段并标注来源页码；缺失与冲突单独列出，需人工确认后入库。' : 'AI 参考历史成果的结构和写作规范拟定大纲，你确认后再起草；每个数字须引用资料编号。'}</div>
      ${wt.kind !== 'standard' && wt.kind !== 'extract' ? `<div class="row" style="margin-top:10px"><button class="btn sm" data-act="plan" data-t="${esc(cur)}">${icon('spark', 13)}AI 规划结构</button><span class="dim" style="font-size:11.5px">${plan ? `已规划 ${plan.outline.length} 节 · ${esc(plan.engine ?? '')}` : '可选：先规划再起草'}</span></div>` : ''}
      ${plan ? `<ol class="outline-ed" id="outlineEd">${plan.outline.map((s, i) => `<li><input class="input" value="${esc(s.title ?? s)}" data-i="${i}" title="${esc((s.points ?? []).join('；'))}"></li>`).join('')}</ol>${plan.reason ? `<div class="dim" style="font-size:11.5px">${esc(plan.reason)}</div>` : ''}` : ''}
      <div class="row" style="margin-top:10px">${gated(aiCan, `<button class="btn pri" data-act="draft-go" data-t="${esc(cur)}" ${live?.status === 'running' ? 'disabled' : ''}>${icon('edit', 14)}${live?.status === 'running' ? '起草中…' : live ? `重新起草${esc(cur)}` : `起草${esc(cur)}`}</button>`)}<span class="grow"></span><button class="btn sm ghost" data-act="open-project" data-id="${p.id}">在项目中查看</button></div></div>` : ''}
    ${live ? msgHTML({ role: 'ai', jobId: live.id, job: live }) : ''}`
}

const PHASES = [['retrieving', '检索资料'], ['generating', '撰写'], ['saving', '保存'], ['review', '待审核']]
function msgHTML(m) {
  if (m.role === 'user') return `<div class="msg u">${esc(m.text)}</div>`
  const job = m.jobId ? (S.live.get(m.jobId) ?? m.job) : null
  if (!job) return `<div class="msg a ${m.tone ?? ''}"><div class="md">${md(m.text ?? '')}</div></div>`
  const running = job.status === 'running'
  const base = x => String(x ?? '').split('/').pop()
  const head = { generate: `✦ 起草 · ${esc(job.title)}`, agent: '✦ 智能体', asr: `🎙 ${esc(job.title)}`, extract: `⧉ ${esc(job.title)}` }[job.kind] ?? `💬 ${esc(job.mode === 'compliance' ? '合规检查' : job.mode === 'summary' ? '资料解析' : '问答')}`
  const steps = job.steps?.length ? `<div class="steps">${job.steps.map(s => `<div class="sp ${s.ok ? '' : 'bad'}"><i>${s.ok ? '✓' : '!'}</i><span class="ell">${esc(s.label)}${s.summary ? ` · <span class="dim">${esc(String(s.summary).slice(0, 60))}</span>` : ''}</span></div>`).join('')}${running ? '<div class="sp"><span class="spin" style="width:14px;height:14px"></span>思考中…</div>' : ''}</div>` : ''
  const readList = (job.reads ?? []).map(r => r.wisburg ? `<button class="src" data-act="wis" data-res="${esc(r.wisburg.resource)}" data-id="${esc(r.wisburg.id)}">🌐 ${esc(r.path)}</button>` : `<button class="src" data-act="file" data-id="${r.fileId}" title="${esc(r.role ?? '')} · ${esc(r.path)}">📎 ${esc(base(r.path))}</button>`).join('')
  const reads = !job.reads?.length || job.kind === 'agent' ? '' : running ? `<div class="srcs">${readList}</div>` : `<details class="rd"><summary>已读取 ${job.reads.length} 份资料</summary><div class="srcs">${readList}</div></details>`
  const pi = PHASES.findIndex(([k]) => k === job.phase)
  const phases = job.kind === 'generate' ? `<div class="phases">${PHASES.map(([k, l], i) => `<span class="${job.status === 'done' || i < pi ? 'done' : i === pi && running ? 'cur' : ''}">${l}</span>`).join('')}</div>` : ''
  const cites = job.cites ?? []
  let body
  if (job.kind === 'generate' && running) body = `<div class="stream ${job.text?.length > 500 ? 'fade' : ''}"><div class="md">${md((job.text ?? '').slice(-1800))}</div></div><div class="prog" style="margin:6px 0"><i style="width:${Math.min(96, (job.text?.length ?? 0) / 30)}%"></i></div>`
  else if (job.deliverableId && job.status === 'done') {
    const cc = job.citeCheck
    body = `${job.kind === 'agent' && job.text ? `<div class="md">${md(job.text, cites)}</div>` : ''}<div>✅ 已保存为成果 v${job.version ?? ''}（草稿，需人工审核定稿）${job.missing?.length ? `；待补充字段 ${job.missing.length} 个` : ''}</div>
      <div class="filecard" data-act="open-deliverable" data-p="${job.projectId}" data-d="${job.deliverableId}">${ficon('.' + String(job.path ?? '.docx').split('.').pop())}<div class="grow" style="min-width:0"><div class="ell" style="font-weight:600">${esc(base(job.path))}</div><div class="dim ell" style="font-size:11px">${esc(job.path ?? '')}</div></div><span class="pill st-0">草稿</span></div>
      ${cc ? `<div class="ccheck ${cc.unverified?.length || cc.unsourced?.length ? 'warn' : 'ok'}">引用核对：${cc.verified}/${cc.total} 条数字在原文中找到${cc.unverified?.length ? `，${cc.unverified.length} 条未能核对` : ''}${cc.unsourced?.length ? `，${cc.unsourced.length} 处数字未标注来源` : ''}</div>` : ''}
      ${cites.length ? `<div class="srcs">${cites.map(c => c.wisburg ? `<button class="src" data-act="wis" data-res="${esc(c.wisburg.resource)}" data-id="${esc(c.wisburg.id)}">[${c.n}] 🌐 ${esc(c.wisburg.title ?? c.path)}</button>` : `<button class="src" data-act="file" data-id="${c.fileId}" title="${esc(c.path)}">[${c.n}] ${esc(base(c.path))}</button>`).join('')}</div>` : ''}`
  } else body = `<div class="md">${md(job.text ?? '', cites.length ? cites : job.sources?.map(s => ({ n: s.n, fileId: s.fileId, wisburg: s.wisburg, path: s.path })))}</div>${running && !job.steps?.length ? '<span class="spin"></span>' : ''}`
  const route = job.route?.reason ? `<div class="dim" style="font-size:11px;margin-top:6px">🛡 ${esc(job.route.reason)}</div>` : ''
  const tail = (job.fallback ? `<div class="dim" style="font-size:11px;margin-top:6px">⚠ 模型不可用，已用离线引擎：${esc(job.fallback)}</div>` : '') + (job.status === 'failed' ? `<div style="color:#FCA5A5;margin-top:6px;font-size:12px">✕ ${esc(job.error ?? '')}</div>` : job.status === 'cancelled' ? '<div class="dim" style="margin-top:6px">已取消，未写入任何文件。</div>' : '')
  return `<div class="msg a" data-job="${job.id}"><div class="who">${head}<span class="grow"></span>${esc(job.engine ?? '')}${running ? `<button class="btn sm" data-act="cancel" data-id="${job.id}">取消</button>` : ''}</div>${phases}${steps}${reads}${body}${route}${tail}</div>`
}
function updateJobMsg(job) {
  const el = document.querySelector(`#abody [data-job="${job.id}"]`)
  if (!el) return renderAIBody()
  const box = $('#abody')
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80
  el.outerHTML = msgHTML({ role: 'ai', jobId: job.id, job })
  if (near) box.scrollTop = box.scrollHeight
}

// 任务轮询：生成/转写/提取实时刷新
let pumping = false
function track(job, onDone) {
  S.live.set(job.id, job)
  if (onDone) (S.onDone ??= new Map()).set(job.id, onDone)
  if (pumping) return
  pumping = true
  const tick = async () => {
    const running = [...S.live.values()].filter(j => j.status === 'running')
    if (!running.length) { pumping = false; return }
    for (const j of running) {
      const next = await get('job', { id: j.id }).catch(() => null)
      if (!next) continue
      S.live.set(j.id, next)
      updateJobMsg(next)
      window.dispatchEvent(new CustomEvent('investai:job', { detail: next }))
      if (next.status !== 'running') {
        if (next.deliverableId && next.status === 'done') toast(`✅ ${next.title || '成果'} 已保存为 v${next.version}（草稿）`, 'ok')
        if (next.status === 'failed' && !/已改用检索问答/.test(next.error ?? '')) toast(`AI 任务失败：${next.error}`, 'deny')
        S.onDone?.get(next.id)?.(next)
        await hooks.reload()
        if (/已改用检索问答/.test(next.error ?? '')) await loadChat()
      }
    }
    setTimeout(tick, 400)
  }
  tick()
}
hooks.track = track

async function loadChat() { S.chat = await get('chat.history').catch(() => []); for (const m of S.chat) if (m.job?.status === 'running') track(m.job); if (S.atab === 'chat') renderAIBody(true) }
async function send(textArg, extra = {}) {
  const ta = $('#prompt')
  const text = (textArg ?? ta.value).trim()
  if (!text) return
  if (!textArg) { ta.value = ''; ta.style.height = 'auto' }
  if (!S.aiOpen) { S.aiOpen = true; renderChrome() }
  if (!extra.silent) { S.atab = extra.tab ?? 'chat'; S.chat.push({ role: 'user', text }); renderAI(); renderAIBody(true) }
  $('#sendBtn').disabled = true
  try {
    const p = ctxProject()
    const r = await post('chat', { text, context: { projectId: p?.id, fileIds: extra.fileIds ?? S.ctx.fileIds } })
    if (r.job) track(r.job, extra.onDone)
    if (r.nav?.projectId && S.view !== 'project') go('project', { id: r.nav.projectId })
    if (!extra.keepCtx) S.ctx.fileIds = []
    S.chat = await get('chat.history')
    for (const m of S.chat) if (m.job && S.live.has(m.job.id)) m.job = S.live.get(m.job.id)
    if (extra.onJob && r.job) extra.onJob(r.job)
    renderAI()
    if (S.atab === 'chat') renderAIBody(true)
  } catch (e) {
    S.chat.push({ role: 'ai', text: `⚠️ ${e.message}`, tone: 'deny' })
    renderAIBody(true)
  } finally { $('#sendBtn').disabled = false }
}
hooks.send = send
function fill(text) {
  if (!S.aiOpen) { S.aiOpen = true; renderChrome() }
  S.atab = 'chat'
  renderAI()
  const ta = $('#prompt')
  ta.value = text
  ta.dispatchEvent(new Event('input'))
  ta.focus()
  ta.setSelectionRange(text.length, text.length)
}
hooks.fill = fill

// ───────── 资料预览抽屉 ─────────
async function openFile(id) {
  closePopup()
  const r = await get('file', { id }).catch(e => { toast(e.message, 'deny'); return null })
  if (!r) return
  const f = r.file
  const audio = ['.m4a', '.mp3', '.wav', '.aac'].includes(f.ext)
  const body = audio ? `<audio controls src="${rawUrl(f.id, true)}" style="width:100%"></audio>` : !r.text ? `<div class="empty">${esc(f.note || '无可预览的文字内容')}</div>` : ['.md', '.txt'].includes(f.ext) ? `<div class="md">${md(r.text)}</div>` : `<pre class="raw">${esc(r.text)}</pre>`
  drawer(`${drawerHead(esc(f.name), `<span class="mono">${esc(r.path)}</span>`)}
    <div class="row" style="padding:0 16px 10px;gap:6px;flex-wrap:wrap">${levelTag(f.level)}<span class="tag">更新 ${fmt(f.mtime)}</span><span class="tag">被引用 ${f.refs ?? 0} 次</span><span class="tag">${size(f.size)}</span>${f.pages ? `<span class="tag">${f.pages} 页</span>` : ''}${f.scanned ? '<span class="tag amber">扫描件：需 OCR</span>' : ''}${r.offline ? '<span class="tag amber">离线缓存</span>' : ''}${f.uploadedBy ? `<span class="tag">上传：${esc(f.uploadedBy)}</span>` : ''}</div>
    <div class="body">${body}</div>
    <footer><button class="btn sm" data-act="download-file" data-id="${f.id}">${icon('download', 13)}下载原文件</button>${can('kb.mount') ? `<select class="select sm" data-act-change="file-level" data-id="${f.id}" title="调整密级">${LEVELS.map((l, i) => `<option value="${i}" ${i === (f.level ?? 1) ? 'selected' : ''}>密级：${l}</option>`).join('')}</select>` : ''}<span class="grow"></span><button class="btn sm pri" data-act="ctx-add" data-id="${f.id}">带入 AI 上下文</button></footer>`)
}
async function openWis(resource, id) {
  closePopup()
  drawer(`${drawerHead('加载中…')}<div class="body"><span class="spin"></span></div>`)
  const cached = S.wis.items.find(i => i.id === id && i.full !== undefined)
  const x = cached ? { title: cached.title, datetime: cached.datetime, source: `智堡 · ${S.meta.wisburg[resource] ?? ''}`, text: cached.full } : await get('wisburg.detail', { resource, id }).catch(e => ({ error: e.message }))
  if (x.error) { drawer(`${drawerHead('智堡')}<div class="body bad">${esc(x.error)}</div>`); return }
  S.drawer = { wis: { resource, id } }
  drawer(`${drawerHead(esc(x.title), `<span class="tag real">${esc(x.source)}</span> <span class="tag">${esc(String(x.datetime ?? '').slice(0, 16).replace('T', ' '))}</span>`)}
    <div class="body"><div class="md">${md(x.text || '（该条目无正文）')}</div></div>
    <footer>${can('material.upload') ? '<button class="btn sm" data-act="wis-save">存入资料库</button>' : ''}<button class="btn sm" data-act="wis-ask">让 AI 解读</button>${x.url ? `<a class="btn sm" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${icon('link', 13)}原文</a>` : ''}<span class="grow"></span><span class="dim" style="font-size:11px">来源：智堡开放接口</span></footer>`)
}

// ───────── 通用事件 ─────────
Object.assign(ACT, {
  go: el => go(el.dataset.view, { sub: el.dataset.sub }),
  'open-project': el => { closePopup(); closeDrawer(); go('project', { id: el.dataset.id }) },
  'ai-toggle': () => { S.aiOpen = !S.aiOpen; renderChrome(); renderAI() },
  'ai-info': () => {
    const d = D(), m = d.model
    dialog(`<h3>AI 模型路由与权限</h3><div class="kv">
      <div><span>路由模式</span><b>${esc({ hybrid: '混合：按资料密级自动选择', local: '仅本地模型', external: '外部模型' }[m.mode] ?? m.mode)}</b></div>
      <div><span>外部模型</span><b>${esc(m.cloud.ok ? m.cloud.label : m.cloud.note ?? '未配置')}</b></div>
      <div><span>本地模型</span><b>${esc(m.local.ok ? m.local.label : m.local.note ?? '未配置')}</b></div>
      <div><span>密级策略</span><b>${LEVELS[m.sensitiveLevel] ?? '—'}及以上资料只交给本地模型；无本地模型时用离线引擎（不调用任何模型）</b></div>
      <div><span>我的 AI 级别</span><b>${['关闭', '辅助建议（只读问答）', '起草待确认（可生成草稿）', '授权执行（可建任务等）'][d.caps.ai]}</b></div>
      <div><span>AI 不做</span><b>表决、审批、定稿、推进阶段、删除、导出</b></div></div><div class="acts"><button class="btn pri" data-dlg="no">知道了</button></div>`)
  },
  atab: el => { S.atab = el.dataset.k; if (!S.aiOpen) S.aiOpen = true; renderAI() },
  ask: el => { closePopup(); fill(el.dataset.q); send() },
  fill: el => fill(el.dataset.text),
  send: () => send(),
  attach: async () => {
    const files = await pick()
    for (const file of files) {
      try { const f = await post('kb.upload', { mountId: 'm_up', name: file.name, data: await toB64(file) }); S.ctx.fileIds.push(f.id); toast(`已上传 ${f.name}`, 'ok') } catch (e) { toast(`${file.name}：${e.message}`, 'deny') }
    }
    await hooks.reload()
  },
  cancel: async el => { const j = await act('job.cancel', { id: el.dataset.id }); if (j) { S.live.set(j.id, j); updateJobMsg(j) } },
  'chat-clear': async () => { await post('chat.clear'); S.chat = []; renderAIBody(true) },
  'pick-project': el => { const r = el.getBoundingClientRect(); popup(D().projects.filter(p => p.status === 'active').map(p => `<div class="it ${p.id === S.sel ? 'on' : ''}" data-act="set-sel" data-id="${p.id}"><span class="grow ell">${esc(p.name)}</span><span class="dim">${esc(p.stage)}</span></div>`).join('') || '<div class="it off">没有可见项目</div>', r.right - 300, r.bottom + 4, 300) },
  'set-sel': el => { closePopup(); S.sel = el.dataset.id; renderAI() },
  'ctx-file': el => { S.ctx.fileIds = S.ctx.fileIds.filter(x => x !== el.dataset.id); renderAI() },
  'ctx-add': el => { if (!S.ctx.fileIds.includes(el.dataset.id)) S.ctx.fileIds.push(el.dataset.id); closeDrawer(); S.aiOpen = true; S.atab = 'chat'; renderChrome(); renderAI(); toast('已带入 AI 上下文') },
  'draft-type': el => { S.draftType = el.dataset.t; renderAIBody() },
  plan: async el => {
    const p = ctxProject()
    toast('AI 正在参考历史成果规划结构…')
    const r = await act('ai.plan', { projectId: p.id, type: el.dataset.t })
    if (r) { S.plan = { projectId: p.id, type: el.dataset.t, ...r }; renderAIBody() }
  },
  'draft-go': async el => {
    const p = ctxProject()
    const outline = $('#outlineEd') ? [...document.querySelectorAll('#outlineEd input')].map(i => ({ title: i.value.trim(), points: S.plan?.outline[i.dataset.i]?.points ?? [] })).filter(o => o.title) : undefined
    const job = await act('ai.generate', { projectId: p.id, type: el.dataset.t, prompt: $('#prompt').value.trim(), outline, fileIds: S.ctx.fileIds })
    if (job) { $('#prompt').value = ''; track(job); S.plan = null; renderAIBody() }
  },
  parse: el => { const f = S.files.find(x => x.id === el.dataset.id); send(`解析《${f?.name ?? ''}》：提炼核心观点、关键数据与风险，并引用原文`, { fileIds: [el.dataset.id], keepCtx: true, tab: 'parse', onJob: j => { S.parse = { fileId: el.dataset.id, jobId: j.id }; S.atab = 'parse'; renderAI() } }) },
  file: el => openFile(el.dataset.id),
  'download-file': el => downloadFile(el.dataset.id),
  wis: el => openWis(el.dataset.res, el.dataset.id),
  'wis-search': el => { closePopup(); S.wis.q = el.dataset.q; S.wis.resource = 'reports'; S.wis.cursor = null; S.wis.items = []; go('research', { sub: 'wisburg' }) },
  'wis-save': async () => { const f = await act('wisburg.save', S.drawer.wis, '已存入资料库（我的上传/智堡/手动收藏）'); if (f) hooks.reload() },
  'wis-ask': () => { const w = S.drawer.wis; const t = $('#drawer .fn').textContent; closeDrawer(); send(`读取智堡 ${w.resource}（id=${w.id}）《${t}》，总结核心观点，并说明对我们在看项目的启示`) },
  'drawer-close': closeDrawer,
  rescan: async el => { toast('正在扫描…'); const r = await act('mount.rescan', { id: el.dataset.id }); if (r) toast(r.ok ? `扫描完成：${r.files} 个文件` : `⚠ ${r.reason}`, r.ok ? 'ok' : 'deny'); hooks.reload() },
  notifications: el => {
    get('notifications').then(list => {
      const r = el.getBoundingClientRect()
      popup(`<div class="hd row">通知<span class="grow"></span><span class="lnk" data-act="notif-read-all">全部已读</span></div>${list.slice(0, 30).map(n => `<div class="it notif ${n.read ? 'dim' : ''}" data-act="notif" data-id="${n.id}" data-p="${n.projectId ?? ''}"><span class="nk k-${n.kind}"></span><div class="grow" style="min-width:0"><div class="ell"><b>${esc(n.title)}</b></div><div class="ell" style="font-size:11.5px;color:var(--muted)">${esc(n.text ?? '')}</div></div><span class="dim" style="font-size:11px">${rel(n.at)}</span></div>`).join('') || '<div class="it off">暂无通知</div>'}`, r.right - 380, r.bottom + 6, 380)
    })
  },
  notif: async el => { closePopup(); await post('notification.read', { id: el.dataset.id }); if (el.dataset.p) go('project', { id: el.dataset.p }); else hooks.reload() },
  'notif-read-all': async () => { closePopup(); await post('notification.read', {}); hooks.reload() },
  persona: el => {
    const d = D()
    const r = el.getBoundingClientRect()
    if (d.mode === 'saas') return popup(`<div class="hd">${esc(d.me.name)} · ${esc(d.me.title)}</div><div class="it" data-act="my-password">${icon('edit', 13)}修改密码</div><div class="it" data-act="logout">${icon('x', 13)}退出登录</div>`, r.right - 220, r.bottom + 6, 220)
    const locked = d.settings.desktop?.personaSwitch === false
    popup(`<div class="hd">${locked ? '身份已由管理员锁定' : '切换演示身份：每个身份看到的项目、字段和能做的操作都不同'}</div>${d.users.map(u => `<div class="it ${u.id === d.me.id ? 'on' : ''}" ${locked ? '' : `data-act="set-persona" data-id="${u.id}"`} title="${esc((u.roles ?? []).map(roleName).join('、'))}">${avatar(u.name, 22)}<div class="grow" style="min-width:0"><div>${esc(u.name)} <span class="dim">${esc(u.title)}</span></div><div class="dim ell" style="font-size:11px">${esc((u.roles ?? []).map(roleName).join('、'))}</div></div></div>`).join('')}`, r.right - 300, r.bottom + 6, 300)
  },
  'set-persona': async el => { closePopup(); await post('persona', { userId: el.dataset.id }); S.chat = []; S.project = null; await hooks.reload(); await loadChat(); if (S.view === 'project' && !proj(S.sel)) go('pipeline'); const c = D().caps; toast(`已切换为 ${D().me.name}（${c.roleNames.join('、')}）：数据范围 ${c.scopes.map(x => ({ own: '本人', dept: '本部门', assigned: '指定授权', postinv: '投后', all: '全机构' }[x])).join('、')}，AI ${AI_LEVEL[c.ai]}`) },
  'force-logout': async () => { await post('logout'); location.reload() },
  'my-password': async () => {
    const r = await dialog(`<h3>修改密码</h3><label class="f">原密码<input class="input" type="password" name="old" autocomplete="current-password" required></label><label class="f">新密码（至少 8 位）<input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required></label><label class="f">再次输入新密码<input class="input" type="password" name="again" autocomplete="new-password" required></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`)
    if (!r) return
    if (r.password !== r.again) return toast('两次输入的新密码不一致', 'deny')
    await act('me.password', { old: r.old, password: r.password }, '密码已修改，其他设备上的登录已退出')
  },
  logout: async () => { await post('logout'); location.reload() },
})

/** 系统生成或管理员重置的密码：首次登录必须改成自己的密码，改完前服务端只放行状态、改密码与退出。 */
async function forcePassword() {
  const { minPassword = 8 } = await get('security.policy').catch(() => ({}))
  for (;;) {
    const r = await dialog(`<h3>请先设置自己的密码</h3><div class="infobox">当前密码由系统生成或管理员重置，继续使用前需要改成只有你知道的密码（至少 ${minPassword} 位）。</div><label class="f">当前密码<input class="input" type="password" name="old" autocomplete="current-password" required></label><label class="f">新密码<input class="input" type="password" name="password" autocomplete="new-password" required></label><label class="f">再次输入新密码<input class="input" type="password" name="again" autocomplete="new-password" required></label><div class="acts"><button class="btn" data-act="force-logout">退出登录</button><button class="btn pri" data-dlg="ok">保存并继续</button></div>`)
    if (!r) continue
    if (r.password !== r.again) { toast('两次输入的新密码不一致', 'deny'); continue }
    if (await act('me.password', { old: r.old, password: r.password }, '密码已设置')) { await hooks.reload(); return }
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]')
  if (!el) { if (!e.target.closest('#popup, #gsearch')) closePopup(); return }
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && ['checkbox', 'range', 'radio'].includes(el.type))) return
  if (!el.closest('#popup') && !el.dataset.keepPopup) closePopup()
  const fn = ACT[el.dataset.act]
  if (fn) { e.preventDefault(); fn(el, e) }
})
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act-change], select[data-act], input[type="checkbox"][data-act], input[type="radio"][data-act]')
  if (el) ACT[el.dataset.actChange || el.dataset.act]?.(el, e)
})
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#gsearch')?.focus() }
  if (e.key === 'Escape') { closePopup(); if (!$('#modal').hidden) $('#modal').click(); else closeDrawer() }
})
// 灰色按钮：说明为什么不能做、找谁做
ACT.explain = el => toast(el.dataset.why ?? '当前不可操作', 'deny')
ACT.help = () => openHelp()
ACT['tour-start'] = () => { closeDrawer(); startTour() }
ACT['theme-toggle'] = () => {
  const next = toggleTheme()
  renderChrome()
  toast(next === 'light' ? '已切换至白底清爽投研主题' : '已切换至深蓝旗舰投研主题')
}
ACT['top-settings-menu'] = el => {
  const r = el.getBoundingClientRect()
  const isDark = currentTheme() === 'dark'
  popup(`<div class="hd">⚙️ 系统设置 · 账户 · 帮助中心</div>
    <div class="it" data-act="nb-api">${icon('spark', 14)}<div class="grow"><b>AI 模型与 API 路由设置</b><div class="dim" style="font-size:11px">配置 Carbon / DeepSeek / 本地 Ollama / 混合路由</div></div></div>
    <div class="it" data-act="nb-arch-open">${icon('flow', 14)}<div class="grow"><b>五层生产架构与 Harness / Agent 监控</b><div class="dim" style="font-size:11px">查看受控思考执行器、网状互校日志与快照回滚</div></div></div>
    <div class="it" data-act="theme-toggle">${icon(isDark ? 'sun' : 'moon', 14)}<div class="grow"><b>外观主题切换（当前：${isDark ? '深蓝旗舰' : '白底清爽'}）</b><div class="dim" style="font-size:11px">一键切换深色沉浸模式与日间研报阅读模式</div></div></div>
    <div class="it" data-act="persona">${icon('users', 14)}<div class="grow"><b>账户与岗位视角切换</b><div class="dim" style="font-size:11px">切换 15 个一级市场岗位体验四层权限</div></div></div>
    <div class="it" data-act="go" data-view="settings">${icon('set', 14)}<div class="grow"><b>机构治理与系统配置</b><div class="dim" style="font-size:11px">人员角色、流程模板、密级规则与审计</div></div></div>
    <div class="it" data-act="go" data-view="knowledge">${icon('kb', 14)}<div class="grow"><b>全机构底稿资料库</b><div class="dim" style="font-size:11px">管理 NAS 挂载目录与项目原始底稿</div></div></div>
    <div class="it" data-act="rescan">${icon('refresh', 14)}<div class="grow"><b>重新扫描本地底稿目录</b><div class="dim" style="font-size:11px">同步最新放入文件夹的 PDF/Word/Excel</div></div></div>
    <div class="it" data-act="help">${icon('info', 14)}<div class="grow"><b>使用帮助与一级市场术语指南</b><div class="dim" style="font-size:11px">快速上手、名词解释与常见问题</div></div></div>
    <div class="it" data-act="tour-start">${icon('play', 14)}<div class="grow"><b>重新播放界面导览</b></div></div>`, r.right - 290, r.bottom + 6, 290)
}

const ROLE_GUIDE = [
  ['项目经理 / 投资经理', '在「项目管理」录入项目机会 → 打开项目，按「下一步」逐项完成：AI 起草或上传成果 → 提交审核 → 定稿 → 发起决策。会议录音在「会议纪要」整理。'],
  ['分析师', '在被授权的项目里起草研究成果、运行「智能提取」；敏感字段（金额、估值、条款）对你脱敏；提交后由有定稿权限的人审核。'],
  ['部门负责人', '工作台「轮到你」处理待审核成果与启动审批；在项目「决策审批」中表决；可调整项目成员与授权。'],
  ['合伙人 / 管理层', '在工作台「待我表决」进入投委会、立项会表决，退回或否决需写意见；可查看全机构项目。'],
  ['法务 / 财务 / 风控', '被指定授权或作为会签表决人时可见项目；在交割确认等节点会签；编写法律尽调、财务分析、风控意见。'],
  ['系统管理员', '在「系统配置」维护人员岗位、流程、密级规则、AI 策略、模型、推送与统一登录；管理员看不到项目敏感数据。'],
]
const TERMS = [['阶段', '项目在流程中所处的位置，如「立项准备」「尽职调查」。'], ['工作', '阶段内要完成的一项任务，产出一份成果；标「必做」的是准入条件。'], ['准入条件', '发起本阶段决策前必须全部定稿的成果。'], ['决策节点', '阶段末尾需要有权人员表决的审批、上会或会签。'], ['定稿', '有权人员确认某个版本为正式成果，之后锁定；要改须撤回定稿。'], ['退回补充', '决策退回后，相关成果标为「需补充」，重新定稿后才能再次发起。'], ['密级', '资料的保密等级：公开、内部、机密、绝密；机密及以上默认只交给本机模型。'], ['敏感字段', '金额、估值、交易条款、LP 信息等，只有被授权岗位看到原值。'], ['AI 参与级别', '关闭 / 辅助建议 / 起草待确认 / 授权执行，按岗位、业务、工作、密级取最低。'], ['离线引擎', '不调用任何模型：原文摘录加规则整理，保证资料不外发。']]
const FAQ = [['按钮为什么是灰的？', '点一下灰色按钮会说明原因和可以操作的人。常见原因：岗位没有该权限、成果状态不对（如已定稿）、AI 参与级别被策略限制。'], ['AI 写的内容可靠吗？', '每个数字都要求标注资料编号 [n]，系统会自动把数字和原文逐条核对，结果显示在成果版本上；AI 只产出草稿，必须由人定稿。'], ['机密资料会被发给外部模型吗？', '不会。机密及以上资料只交给本机模型；没有本机模型时使用离线引擎，不调用任何外部服务。'], ['改错了怎么办？', '每次修改都是新版本，可在成果中恢复历史版本；项目、流程、设置的任何变更都可以在「动态与历史」查看快照并回滚。'], ['没有转写引擎能做会议纪要吗？', '可以。在会议中「粘贴文字稿」，系统同样整理出决定事项、待办和责任人。']]
function openHelp() {
  drawer(`${drawerHead('帮助', '快速上手 · 名词解释 · 常见问题')}<div class="body help">
    <h3>三步上手</h3><ol><li>右上角头像切换到你的岗位（演示模式），左侧「工作台」看「轮到你」的事项。</li><li>打开项目，照着「下一步」做：每一步都标明负责人，轮到你的有「去处理」按钮。</li><li>右侧 AI 助手可以问问题、起草成果、解析资料；AI 只产出草稿，定稿与表决由人完成。</li></ol>
    <button class="btn sm" data-act="tour-start">${icon('play', 13)}重新播放界面导览</button>
    <h3>按岗位看怎么用</h3>${ROLE_GUIDE.map(([r, t]) => `<div class="term"><b>${r}</b><span>${t}</span></div>`).join('')}
    <h3>名词解释</h3>${TERMS.map(([k, v]) => `<div class="term"><b>${k}</b><span>${v}</span></div>`).join('')}
    <h3>常见问题</h3>${FAQ.map(([q, a]) => `<details class="faq"><summary>${q}</summary><div>${a}</div></details>`).join('')}</div>`, true)
}

const TOUR = [
  ['#nav, #app.embed .main', '左侧导航', '工作台、项目管理、会议纪要、智能提取、公司库、资料库……在 DSH 中，这些入口出现在 DSH 自己的侧栏里。'],
  ['.kpis, .page .ph', '工作台', '这里汇总轮到你处理的事：待表决、待审核成果、到期任务和最新动态。'],
  ['.me-btn', '你的身份', '每个岗位看到的项目、敏感字段和能做的操作都不同。演示模式下可在这里切换 15 个岗位体验。'],
  ['#ai', 'AI 协作助手', '提问、起草成果、解析资料。AI 只在你的权限范围内工作，只产出草稿，不做表决与定稿。'],
  ['[data-act="help"]', '随时求助', '这里有快速上手、名词解释和常见问题；灰色按钮点一下也会告诉你原因和可以找谁。'],
]
function startTour(i = 0) {
  document.querySelectorAll('.tour-mask').forEach(e => e.remove())
  if (i >= TOUR.length) { try { localStorage.setItem('investai.tour.v2', '1') } catch {} return }
  const [sel, title, text] = TOUR[i]
  const target = sel.split(',').map(x => document.querySelector(x.trim())).find(e => e && e.getBoundingClientRect().width > 0)
  if (!target) return startTour(i + 1)
  const r = target.getBoundingClientRect()
  const mask = document.createElement('div')
  mask.className = 'tour-mask'
  const left = r.right + 360 < innerWidth ? r.right + 14 : Math.max(16, r.left - 354)
  const top = Math.min(innerHeight - 220, Math.max(16, r.top))
  mask.innerHTML = `<div class="tour-hole" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px"></div>
    <div class="tour-card" style="left:${r.width > innerWidth * 0.6 ? Math.max(16, r.left + r.width / 2 - 170) : left}px;top:${r.height > innerHeight * 0.6 ? Math.max(16, r.top + 80) : top}px"><h4>${title}</h4><p>${text}</p>
      <div class="row"><div class="dots">${TOUR.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div><span class="grow"></span><button class="btn sm ghost" data-tour="end">跳过</button><button class="btn sm pri" data-tour="next">${i === TOUR.length - 1 ? '开始使用' : '下一步'}</button></div></div>`
  document.body.append(mask)
  mask.querySelector('[data-tour=next]').onclick = () => startTour(i + 1)
  mask.querySelector('[data-tour=end]').onclick = () => startTour(TOUR.length)
}

ACT['file-level'] = async el => { await act('kb.level', { id: el.dataset.id, level: Number(el.value) }, `已调整为「${LEVELS[el.value]}」`); hooks.reload() }

// ───────── 拖拽上传 ─────────
let dragDepth = 0
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#drop').hidden = false } })
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true } })
window.addEventListener('dragover', e => e.preventDefault())
window.addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true
  const files = [...e.dataTransfer.files]
  if (!files.length) return
  const projectId = ['project', 'notebook', 'flowboard'].includes(S.view) ? S.sel : undefined
  for (const file of files) {
    if (file.size > 40 * 1024 * 1024) { toast(`${file.name} 超过 40MB，请放入 NAS 目录后扫描`, 'deny'); continue }
    await act('kb.upload', { projectId, mountId: projectId ? undefined : 'm_up', name: file.name, data: await toB64(file) }, `已上传 ${file.name}${projectId ? '（项目资料）' : ''}`)
  }
  if (projectId) S.project = await get('project', { id: projectId }).catch(() => S.project)
  await hooks.reload()
  if (projectId) hooks.loadProject?.()
})

// ───────── 登录（SaaS） ─────────
window.addEventListener('investai:login', e => showLogin(e.detail))
function showLogin(info = {}) {
  if ($('.login')) return
  const el = document.createElement('div')
  el.className = 'login'
  el.innerHTML = `<form class="dialog"><div class="row" style="margin-bottom:14px"><span class="logo"><span class="mk">AC /</span><span class="nm">优势资本 · 智能投研工作台</span></span></div>
    <label class="f">账号<input class="input" name="username" autocomplete="username" required></label>
    <label class="f">密码<input class="input" name="password" type="password" autocomplete="current-password" required></label>
    <div id="lerr" style="color:#FCA5A5;min-height:18px;font-size:12px"></div><button class="btn pri" style="width:100%">登录</button>
    ${info.sso ? '<a class="btn" style="width:100%;margin-top:8px" href="/sso/login">统一登录（企业账号）</a>' : ''}
    <div class="dim" style="font-size:11px;margin-top:10px">首次启动的初始密码在服务端数据目录 initial-credentials.txt 中</div></form>`
  document.body.append(el)
  el.querySelector('form').addEventListener('submit', async ev => { ev.preventDefault(); try { await post('login', Object.fromEntries(new FormData(ev.target))); location.reload() } catch (err) { $('#lerr').textContent = err.message } })
}

// ───────── 启动 ─────────
renderAIShell()
try {
  ;[S.data, S.meta, S.files] = await Promise.all([get('state'), get('meta'), get('files').catch(() => [])])
  applyVocab(S.meta.vocab)
  if (!VIEWS[S.view]) S.view = 'workbench'
  if (S.view === 'project' && S.sub) S.sel = S.sub
  renderChrome()
  renderView()
  renderAI()
  await loadChat()
  if (D().me.mustChange) await forcePassword()
  try { if (!localStorage.getItem('investai.tour.v2')) setTimeout(() => startTour(), 600) } catch { /* 无痕模式 */ }
} catch (e) {
  if (!$('.login')) $('#view').innerHTML = `<div class="empty" style="padding:30px">加载失败：${esc(e.message)}</div>`
}
