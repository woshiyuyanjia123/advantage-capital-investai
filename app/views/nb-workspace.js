// 制作台（三栏）：左栏上方是本地工具（PPT、Word、录音转文字），下面是资料和成果文件；中栏是进度和对话；右栏是 Studio 和笔记看板
import { S, D, ACT, VIEWS, hooks, $, esc, md, icon, get, act, toast, ficon, levelTag, menuAt, mi } from '/api/investai?asset=ui.js'

async function loadNbProject() {
  if (!S.sel) S.sel = D()?.projects?.[0]?.id
  if (!S.sel) return
  S.project = await get('project', { id: S.sel }).catch(e => ({ error: e.message }))
  if (S.project?.files && !S.ctx.fileIds.length) S.ctx.fileIds = S.project.files.slice(0, 6).map(f => f.id)
  if (S.view === 'notebook') renderNbWorkspace($('#view'))
  hooks.renderAI?.()
}

export function renderNbWorkspace(v) {
  if (!S.project || S.project.project?.id !== S.sel) {
    v.innerHTML = '<div class="page"><span class="spin"></span></div>'
    loadNbProject()
    return
  }
  const x = S.project
  if (x.error) { v.innerHTML = `<div class="page"><div class="empty">${esc(x.error)}</div></div>`; return }
  const p = x.project
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const checked = new Set(S.ctx.fileIds)
  v.innerHTML = `<div class="nb-ws">
    ${renderLeftPane(x, p, checked)}
    ${renderCenterPane(x, p, f)}
    ${renderRightNotes(x, p)}
  </div>`
}

// 左上方的三个本地工具：打开后在抽屉里逐页或逐句修改，也可以用本机 Office/WPS 打开
const LOCAL_TOOLS = [
  ['nb-studio-ppt', 'P', '#3B2A66', '#D8B4FE', '做 PPT'],
  ['nb-studio-word', 'W', '#1E3A66', '#93C5FD', '写 Word'],
  ['nb-studio-audio', '录', '#0F3B3A', '#5EEAD4', '录音转文字'],
]

function renderLeftPane(x, p, checked) {
  const arts = x.artifacts?.items ?? []
  const folderPath = x.artifacts?.folderPath || ''
  return `<div class="nb-col">
    <div class="nb-studio-top"><div class="nb-tools">${LOCAL_TOOLS.map(([actName, mark, bg, fg, label]) => `<button class="nb-st-tile" data-act="${actName}" data-p="${p.id}">
      <span class="ic" style="background:${bg};color:${fg}">${mark}</span><span class="t1">${label}</span></button>`).join('')}</div></div>
    <div class="nb-col-hd"><b>资料</b><span class="dim">${x.files.length}</span><span class="grow"></span>
      <label class="dim" style="font-size:11.5px;cursor:pointer" title="勾选的资料用于对话和生成"><input type="checkbox" class="ck" data-act="nb-src-all" ${checked.size && checked.size === x.files.length ? 'checked' : ''}> 全选</label>
      <button class="btn sm ghost ico" data-act="proj-upload" title="添加资料">${icon('plus', 14)}</button></div>
    <div class="nb-sources">${x.files.map((f, idx) => `<label class="nb-src-row">
      <span class="mono dim">${idx + 1}</span>${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>
      <input type="checkbox" class="ck" data-act="nb-src-ck" data-id="${f.id}" ${checked.has(f.id) ? 'checked' : ''}></label>`).join('') || `<button class="nb-empty-add" data-act="proj-upload">${icon('plus', 16)}添加资料</button>`}
      <div class="sec nb-art-head">成果文件<span class="dim">${arts.length}</span><span class="grow"></span>
        <button class="btn sm ghost ico" data-act="nb-open-folder" data-p="${p.id}" title="${esc(folderPath || '打开项目文件夹')}">${icon('open', 14)}</button></div>
      ${arts.map(a => `<div class="nb-art-item" data-act="nb-open-folder" data-p="${p.id}" data-fp="${esc(a.fullPath)}" title="用本机程序打开">
        ${ficon(a.ext, true)}<div class="grow" style="min-width:0"><div class="ell"><b>${esc(a.name)}</b></div>
          <div class="dim ell" style="font-size:10.5px">${(a.bytes / 1048576).toFixed(2)} MB${a.summary ? ` · ${esc(a.summary)}` : ''}</div></div>
        <button class="btn sm" data-act="nb-flowboard" data-p="${p.id}">提交</button></div>`).join('') || '<div class="dim" style="padding:6px;font-size:11.5px">生成的 PPT、Word 会出现在这里</div>'}
    </div>
  </div>`
}

function renderCenterPane(x, p, f) {
  const d = D()
  const msgs = S.chat.slice(-16)
  return `<div class="nb-col">
    <div class="nb-flow-strip">
      <div class="row"><button class="btn ghost sm" data-act="go" data-view="workbench">${icon('left', 13)}项目</button>
        <b class="ell" style="font-size:14.5px">${esc(p.name)}</b><span class="pill st-3">${esc(p.stage)} · ${f.overallPct}%</span>
        <span class="grow"></span>
        <button class="btn sm pri" data-act="nb-submit-menu" data-p="${p.id}">${icon('upload', 12)}提交</button>
        <button class="nb-api-pill" data-act="nb-api"><span class="dot ${d.model.ok ? 'ok' : 'warn'}"></span><span>${esc(d.model.ok ? d.model.label : '本地离线引擎')}</span></button></div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
      <div class="row" style="flex-wrap:wrap">
        ${f.stageDetails.map(st => `<span class="nb-st-node ${st.state}">${st.state === 'done' ? '✓' : `${st.index + 1}.`} ${esc(st.name)} <b>${st.pct}%</b></span>`).join('')}
      </div>
    </div>
    <div class="abody" style="flex:1;padding:14px;overflow:auto">
      ${msgs.length ? msgs.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}" style="margin-bottom:12px">
        <div class="dim" style="font-size:11px;margin-bottom:3px">${m.role === 'user' ? esc(d.me.name) : '助手'}</div>
        <div class="md">${md(m.text || m.job?.text || (m.job?.status === 'running' ? '正在读勾选的资料…' : ''))}</div>
        ${m.role !== 'user' ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="nb-save-chatnote" data-p="${p.id}">${icon('clip', 12)}存为笔记</button></div>` : ''}</div>`).join('')
        : `<div class="nb-chat-empty"><b>${esc(p.name)}</b><span class="dim">已勾选 ${S.ctx.fileIds.length} 份资料</span></div>`}
      <div class="nb-follow-grid">${(x.followUps ?? []).map(q => `<button class="nb-follow-card" data-act="nb-q" data-q="${esc(q)}"><span>${esc(q)}</span></button>`).join('')}</div>
    </div>
    <div class="composer" style="padding:10px 14px;border-top:1px solid var(--line)"><div class="row">
      <input class="input grow" id="nbChatInput" placeholder="问问勾选的资料">
      <span class="dim" style="font-size:12px">${S.ctx.fileIds.length} 份资料</span>
      <button class="btn pri ico" data-act="nb-chat-send" title="发送" style="border-radius:99px">${icon('send', 14)}</button></div></div>
  </div>`
}

function renderRightNotes(x, p) {
  const notes = x.notes ?? []
  const studioBtns = [
    ['audio', '#38BDF8', '音频概览'],
    ['ppt', '#C084FC', '演示文稿'],
    ['video', '#4ADE80', '视频概览'],
    ['mindmap', '#818CF8', '思维导图'],
    ['word', '#F472B6', '报告'],
    ['flashcards', '#FB923C', '闪卡'],
    ['quiz', '#60A5FA', '测验'],
    ['infographic', '#FBBF24', '信息图'],
    ['table', '#34D399', '数据表格'],
  ]
  return `<div class="nb-col">
    <div class="nb-col-hd"><b>Studio</b><span class="dim">用 ${S.ctx.fileIds.length} 份资料</span></div>
    <div class="nb-studio-pillgrid">${studioBtns.map(([k, c, l]) => `<button class="nb-pill-btn" data-act="nb-make" data-p="${p.id}" data-k="${k}">
      <i class="nb-dot" style="background:${c}"></i><span>${l}</span></button>`).join('')}</div>
    <div class="nb-col-hd" style="border-top:1px solid var(--line)"><b>笔记</b><span class="dim">${notes.length}</span><span class="grow"></span>
      <button class="btn sm ghost ico" data-act="nb-note-add" data-p="${p.id}" title="新建笔记">${icon('plus', 14)}</button>
      <button class="btn sm pri" data-act="nb-open-board" data-p="${p.id}" data-b="stages">看板</button></div>
    <div class="nb-notes-list">
      ${notes.map(n => `<div class="nb-note-card" data-act="nb-open-board" data-p="${p.id}" data-b="${esc(n.board || 'stages')}" data-n="${esc(n.id)}">
        <div class="row"><span class="tag blue">${esc(n.tag || '笔记')}</span><b class="ell grow">${esc(n.title)}</b></div>
        ${n.summary ? `<div class="dim" style="font-size:11.5px;margin-top:5px">${esc(n.summary)}</div>` : ''}</div>`).join('') || '<div class="dim" style="padding:6px;font-size:11.5px">点笔记可以打开它关联的看板</div>'}
    </div>
  </div>`
}

Object.assign(ACT, {
  'nb-src-ck': el => { const s = new Set(S.ctx.fileIds); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); S.ctx.fileIds = [...s]; hooks.refresh() },
  'nb-src-all': () => { const all = S.project?.files?.map(f => f.id) ?? []; S.ctx.fileIds = S.ctx.fileIds.length === all.length ? [] : all; hooks.refresh() },
  'nb-q': el => { if ($('#nbChatInput')) { $('#nbChatInput').value = el.dataset.q; ACT['nb-chat-send']() } },
  'nb-chat-send': () => { const v = $('#nbChatInput')?.value?.trim(); if (!v) return; hooks.fill(v); hooks.send(); $('#nbChatInput').value = '' },
  // 提交菜单：把原来散在进度条下面的几个提交按钮收到一处，只列当前能用的
  'nb-submit-menu': el => {
    const x = S.project
    const p = el.dataset.p
    const chk = x?.deliverables?.find(z => z.checkout)
    const rev = x?.deliverables?.find(z => z.status === 'draft' && z.versions?.length)
    const ready = x?.project?.flow?.readinessOk
    menuAt(el, [
      mi('nb-plug-sub', 'AI 起草并提交', { p, ch: 'plugin-draft' }, { ic: 'bot' }),
      mi('nb-plug-upload', '上传文件提交', { p }, { ic: 'upload' }),
      chk && mi('nb-plug-sub', `回传本地修改（${chk.type}）`, { p, d: chk.id, ch: 'local-checkin' }, { ic: 'check' }),
      rev && mi('nb-plug-sub', `提交审核（${rev.type}）`, { p, d: rev.id, ch: 'review-submit' }, { ic: 'check' }),
      ready && mi('nb-plug-sub', '发起阶段准入', { p, ch: 'gate-submit' }, { ic: 'vote' }),
      mi('nb-flowboard', '打开流程提交', { p }, { ic: 'flow' }),
    ], 230)
  },
  'nb-note-add': async el => {
    const r = await act('nb.note.save', { projectId: el.dataset.p, title: `笔记 ${new Date().toLocaleTimeString('zh-CN')}`, content: '', board: 'tasks' }, '已新建笔记')
    if (r) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-xlsx': el => ACT['nb-open-board']({ dataset: { p: el.dataset.p, b: 'evidence' } }),
  'nb-make': async el => {
    const k = el.dataset.k
    if (k === 'audio') return ACT['nb-studio-audio'](el)
    toast(`正在用 ${S.ctx.fileIds.length} 份资料生成…`)
    const r = await act('nb.studio.make', { projectId: el.dataset.p || S.sel, kind: k, fileIds: S.ctx.fileIds })
    if (r) {
      toast(`已生成 ${r.name}（${(r.bytes / 1048576).toFixed(2)} MB）`, 'ok')
      S.project = await get('project', { id: el.dataset.p || S.sel })
      hooks.refresh()
    }
  },
  'nb-save-chatnote': async el => {
    const last = S.chat.filter(m => m.role !== 'user').at(-1)
    const r = await act('nb.note.save', { projectId: el.dataset.p || S.sel, title: `问答笔记 ${new Date().toLocaleTimeString('zh-CN')}`, content: last?.text || '', board: 'stages' }, '已存为笔记')
    if (r && S.project) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-tts': () => {
    const p = S.project?.project
    const txt = `${p?.name || '当前项目'}，当前在${p?.stage || '推进'}阶段，总进度百分之${p?.flow?.overallPct ?? p?.progress ?? 0}。`
    if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(txt)); toast('正在用本机语音播报', 'ok') }
    else toast(txt)
  },
})

document.addEventListener('keydown', e => { if (e.target?.id === 'nbChatInput' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ACT['nb-chat-send']() } })
VIEWS.notebook = renderNbWorkspace
