// 制作台（三栏）：左栏上方是本地工具（PPT、Word、录音转文字），下面是资料；中栏是阶段进度和对话；右栏是 Studio、成果和笔记
import { S, D, ACT, VIEWS, hooks, $, $$, esc, md, icon, get, act, toast, ficon, menuAt, mi, firstPaint, entered } from '/api/investai?asset=ui.js'

async function loadNbProject() {
  if (!S.sel) S.sel = D()?.projects?.[0]?.id
  if (!S.sel) return
  S.project = await get('project', { id: S.sel }).catch(e => ({ error: e.message }))
  if (S.project?.files && !S.ctx.fileIds.length) S.ctx.fileIds = S.project.files.slice(0, 6).map(f => f.id)
  if (S.view === 'notebook') renderNbWorkspace($('#view'))
  hooks.renderAI?.()
}

const no2 = i => String(i + 1).padStart(2, '0')
const mb = b => `${((b || 0) / 1048576).toFixed(2)} MB`

export function renderNbWorkspace(v) {
  if (!S.project || S.project.project?.id !== S.sel) {
    v.innerHTML = '<div class="nb-loading"><span class="spin"></span></div>'
    loadNbProject()
    return
  }
  const x = S.project
  if (x.error) { v.innerHTML = `<div class="page"><div class="empty">${esc(x.error)}</div></div>`; return }
  const p = x.project
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const fresh = firstPaint(`ws:${p.id}`)
  // 整页重画时保留滚动位置和没发出去的输入
  const keep = Object.fromEntries($$('[data-keep]', v).map(el => [el.dataset.keep, el.scrollTop]))
  const draft = $('#nbChatInput')?.value ?? ''
  v.innerHTML = `<div class="nb-ws ${fresh ? 'enter' : ''}">
    ${renderLeftPane(x, p)}
    ${renderCenterPane(x, p, f)}
    ${renderRightPane(x, p)}
  </div>`
  for (const el of $$('[data-keep]', v)) el.scrollTop = keep[el.dataset.keep] ?? (el.dataset.keep === 'chat' ? el.scrollHeight : 0)
  if (draft && $('#nbChatInput')) $('#nbChatInput').value = draft
  if (fresh) entered(v)
}

// 左上方的三个本地工具：打开后在抽屉里逐页或逐句修改，也可以用本机 Office/WPS 打开
const LOCAL_TOOLS = [
  ['nb-studio-ppt', 'slides', '做 PPT'],
  ['nb-studio-word', 'doc', '写 Word'],
  ['nb-studio-audio', 'mic', '录音转文字'],
]

function renderLeftPane(x, p) {
  const checked = new Set(S.ctx.fileIds)
  return `<section class="nb-pane nb-left">
    <div class="nb-tools">${LOCAL_TOOLS.map(([actName, ic, label]) => `<button class="nb-tool" data-act="${actName}" data-p="${p.id}">${icon(ic, 19)}<span>${label}</span></button>`).join('')}</div>
    <header class="nb-pane-hd"><b>资料</b><span class="n">${x.files.length}</span><span class="grow"></span>
      <label class="nb-all"><input type="checkbox" class="ck" data-act="nb-src-all" ${checked.size && checked.size === x.files.length ? 'checked' : ''}>全选</label>
      <button class="btn sm ghost ico" data-act="proj-upload" title="添加资料">${icon('plus', 14)}</button></header>
    <div class="nb-src-list" data-keep="src">${x.files.map(f => `<label class="nb-src ${checked.has(f.id) ? 'on' : ''}">
      <input type="checkbox" class="ck" data-act="nb-src-ck" data-id="${f.id}" ${checked.has(f.id) ? 'checked' : ''}>
      ${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>
      <button class="nb-src-open" data-act="file" data-id="${f.id}" title="预览">${icon('open', 13)}</button></label>`).join('')
      || `<button class="nb-empty-add" data-act="proj-upload">${icon('plus', 16)}<span>添加资料</span></button>`}</div>
  </section>`
}

function chatHTML(x, p) {
  const offset = Math.max(0, S.chat.length - 24)
  const msgs = S.chat.slice(offset)
  const follow = (x.followUps ?? []).length ? `<div class="nb-follows">${x.followUps.map(q => `<button class="nb-follow" data-act="nb-q" data-q="${esc(q)}"><span class="grow">${esc(q)}</span>${icon('right', 13)}</button>`).join('')}</div>` : ''
  if (!msgs.length) return `<div class="nb-chat-empty"><h2>${esc(p.name)}</h2><p><span data-src-n>${S.ctx.fileIds.length}</span> 份资料 · ${esc(p.stage || '')}</p></div>${follow}`
  return msgs.map((m, i) => {
    if (m.role === 'user') return `<div class="nb-msg me"><div class="bub">${esc(m.text)}</div></div>`
    const job = m.job ? (S.live.get(m.job.id) ?? m.job) : m.jobId ? S.live.get(m.jobId) : null
    const running = job?.status === 'running'
    const text = m.text || job?.text || ''
    return `<div class="nb-msg bot ${m.tone ?? ''}">
      ${text ? `<div class="md">${md(text, job?.cites)}</div>` : ''}
      ${running ? `<div class="nb-typing"><i></i><i></i><i></i><span>${text ? '' : '正在读勾选的资料'}</span></div>` : ''}
      ${job?.status === 'failed' ? `<div class="bad" style="font-size:12px">${esc(job.error ?? '')}</div>` : ''}
      ${!running && text && m.tone !== 'deny' ? `<div class="nb-msg-acts">${job?.engine ? `<span class="dim">${esc(job.engine)}</span>` : ''}<button class="btn sm ghost" data-act="nb-save-chatnote" data-p="${p.id}" data-i="${offset + i}">${icon('clip', 12)}存为笔记</button></div>` : ''}</div>`
  }).join('') + follow
}

function paintChat(force) {
  const el = $('#nbChat')
  if (!el || S.view !== 'notebook' || !S.project?.project) return
  const near = force || el.scrollHeight - el.scrollTop - el.clientHeight < 140
  el.innerHTML = chatHTML(S.project, S.project.project)
  if (near) el.scrollTop = el.scrollHeight
}
// 回答生成过程中只重画对话区，不动输入框和其他两栏
window.addEventListener('investai:job', () => paintChat())

function renderCenterPane(x, p, f) {
  return `<section class="nb-pane nb-mid">
    <header class="nb-mid-hd">
      <button class="btn ghost sm ico" data-act="go" data-view="workbench" title="返回项目">${icon('left', 15)}</button>
      <h2 class="ell" title="${esc(p.name)}">${esc(p.name)}</h2><span class="tag blue">${esc(p.stage)}</span>
      <span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">看板</button>
      <button class="btn sm pri" data-act="nb-submit-menu" data-p="${p.id}">${icon('upload', 13)}提交</button></header>
    <div class="nb-track">
      <div class="nb-track-pct"><b data-count="${f.overallPct}">${f.overallPct}</b><i>%</i></div>
      <div class="nb-track-segs">${f.stageDetails.map(st => `<button class="nb-seg ${st.state}" data-act="nb-open-board" data-p="${p.id}" data-b="stages" title="${esc(st.name)} ${st.pct}%">
        <span class="bar"><i style="width:${st.pct}%"></i></span><span class="nm ell"><b>${no2(st.index)}</b><span class="t"> ${esc(st.name)}</span></span></button>`).join('')}</div>
    </div>
    <div class="nb-chat" id="nbChat" data-keep="chat">${chatHTML(x, p)}</div>
    <div class="nb-composer"><div class="nb-cbox">
      <textarea id="nbChatInput" rows="1" placeholder="问问勾选的资料"></textarea>
      <span class="n"><span data-src-n>${S.ctx.fileIds.length}</span> 份资料</span>
      <button class="send" data-act="nb-chat-send" title="发送（Enter）">${icon('send', 14)}</button></div></div>
  </section>`
}

const STUDIO = [
  ['audio', 'wave', '音频概览'],
  ['ppt', 'slides', '演示文稿'],
  ['video', 'video', '视频概览'],
  ['mindmap', 'mind', '思维导图'],
  ['word', 'doc', '报告'],
  ['flashcards', 'cards', '闪卡'],
  ['quiz', 'quiz', '测验'],
  ['infographic', 'chart', '信息图'],
  ['table', 'table', '数据表格'],
]

function renderRightPane(x, p) {
  const notes = x.notes ?? []
  const arts = x.artifacts?.items ?? []
  const making = S.makingStudio
  return `<section class="nb-pane nb-right">
    <header class="nb-pane-hd"><b>Studio</b><span class="n">用 <span data-src-n>${S.ctx.fileIds.length}</span> 份资料</span></header>
    <div class="nb-studio">${STUDIO.map(([k, ic, l]) => `<button class="nb-make ${making?.k === k ? 'busy' : ''}" data-act="nb-make" data-p="${p.id}" data-k="${k}" data-l="${l}" ${making ? 'disabled' : ''}>${icon(ic, 18)}<span>${l}</span></button>`).join('')}</div>
    <div class="nb-right-scroll" data-keep="right">
      <header class="nb-pane-hd sticky"><b>成果</b><span class="n">${arts.length}</span><span class="grow"></span>
        <button class="btn sm ghost ico" data-act="nb-open-folder" data-p="${p.id}" title="${esc(x.artifacts?.folderPath || '打开项目文件夹')}">${icon('folder', 14)}</button></header>
      ${making ? `<div class="nb-art making"><span class="spin"></span><div class="grow"><b>正在生成${esc(making.label)}</b><div class="meta">用 ${S.ctx.fileIds.length} 份资料</div></div></div>` : ''}
      ${arts.map((a, idx) => `<div class="nb-art" data-act="nb-open-folder" data-p="${p.id}" data-fp="${esc(a.fullPath)}" title="用本机程序打开">
        ${ficon(a.ext, true)}<div class="grow" style="min-width:0"><b class="ell">${esc(a.name)}</b>
          <div class="meta ell">${mb(a.bytes)}${a.sourceCount ? ` · ${a.sourceCount} 份资料` : ''}</div></div>
        <button class="btn sm" data-act="nb-submit-art" data-p="${p.id}" data-i="${idx}">提交</button></div>`).join('') || (making ? '' : '<div class="nb-none">还没有成果</div>')}
      <header class="nb-pane-hd sticky"><b>笔记</b><span class="n">${notes.length}</span><span class="grow"></span>
        <button class="btn sm ghost ico" data-act="nb-note-add" data-p="${p.id}" title="新建笔记">${icon('plus', 14)}</button></header>
      ${notes.map(n => `<button class="nb-note" data-act="nb-open-board" data-p="${p.id}" data-b="${esc(n.board || 'stages')}" data-n="${esc(n.id)}">
        <span class="hd"><b class="ell grow">${esc(n.title)}</b><span class="tag">${esc(n.tag || '笔记')}</span></span>
        ${n.summary ? `<span class="sum">${esc(n.summary)}</span>` : ''}</button>`).join('') || '<div class="nb-none">还没有笔记</div>'}
    </div>
  </section>`
}

/** 勾选变化后只更新数字和行的状态，不整页重画（焦点在复选框上时整页刷新会被跳过）。 */
function syncSources() {
  const n = S.ctx.fileIds.length
  const set = new Set(S.ctx.fileIds)
  for (const el of $$('[data-src-n]')) el.textContent = n
  for (const ck of $$('.nb-src .ck')) { ck.checked = set.has(ck.dataset.id); ck.closest('.nb-src').classList.toggle('on', ck.checked) }
  const all = $('[data-act="nb-src-all"]')
  if (all) all.checked = n > 0 && n === (S.project?.files?.length ?? 0)
}

Object.assign(ACT, {
  'nb-src-ck': el => { const s = new Set(S.ctx.fileIds); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); S.ctx.fileIds = [...s]; syncSources() },
  'nb-src-all': () => { const all = S.project?.files?.map(f => f.id) ?? []; S.ctx.fileIds = S.ctx.fileIds.length === all.length ? [] : all; syncSources() },
  'nb-q': el => { const box = $('#nbChatInput'); if (box) { box.value = el.dataset.q; ACT['nb-chat-send']() } },
  'nb-chat-send': async () => {
    const box = $('#nbChatInput')
    const v = box?.value?.trim()
    if (!v) return
    box.value = ''
    box.style.height = ''
    // keepCtx：发完不清空勾选；stay：留在制作台，不跳到别的页面
    const pending = hooks.send(v, { keepCtx: true, stay: true })
    paintChat(true)
    await pending
    paintChat(true)
  },
  // 提交菜单：只列当前能用的提交方式
  'nb-submit-menu': el => {
    const x = S.project
    const p = el.dataset.p
    const chk = x?.deliverables?.find(z => z.checkout)
    const rev = x?.deliverables?.find(z => z.status === 'draft' && z.versions?.length)
    const ready = x?.project?.flow?.readinessOk
    menuAt(el, [
      mi('nb-plug-sub', 'AI 起草并提交', { p, ch: 'plugin-draft' }, { ic: 'bot' }),
      mi('nb-plug-upload', '上传文件提交', { p }, { ic: 'upload' }),
      chk && mi('nb-plug-sub', `回传本地修改 · ${chk.type}`, { p, d: chk.id, ch: 'local-checkin' }, { ic: 'check' }),
      rev && mi('nb-plug-sub', `提交审核 · ${rev.type}`, { p, d: rev.id, ch: 'review-submit' }, { ic: 'check' }),
      ready && mi('nb-plug-sub', '发起阶段准入', { p, ch: 'gate-submit' }, { ic: 'vote' }),
      '<hr>',
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
    const pid = el.dataset.p || S.sel
    S.makingStudio = { k, label: el.dataset.l || '' }
    hooks.refresh()
    const r = await act('nb.studio.make', { projectId: pid, kind: k, fileIds: S.ctx.fileIds })
    S.makingStudio = null
    if (r) {
      toast(`已生成 ${r.name}（${mb(r.bytes)}）`, 'ok')
      S.project = await get('project', { id: pid })
    }
    hooks.refresh()
  },
  'nb-submit-art': async el => {
    const pid = el.dataset.p || S.sel
    const art = S.project?.artifacts?.items?.[Number(el.dataset.i)]
    if (art) {
      const r = await act('nb.flow.submit', { projectId: pid, artifactPath: art.fullPath, artifactName: art.name, autoSubmitReview: true })
      if (r) toast(`${art.name} 已提交到“${r.workType}” v${r.version}`, 'ok')
    }
    ACT['nb-flowboard']({ dataset: { p: pid } })
  },
  'nb-save-chatnote': async el => {
    const m = S.chat[Number(el.dataset.i)] ?? S.chat.filter(z => z.role !== 'user').at(-1)
    const job = m?.job ? (S.live.get(m.job.id) ?? m.job) : null
    const r = await act('nb.note.save', { projectId: el.dataset.p || S.sel, title: `问答笔记 ${new Date().toLocaleTimeString('zh-CN')}`, content: m?.text || job?.text || '', board: 'stages' }, '已存为笔记')
    if (r && S.project) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-tts': () => {
    const p = S.project?.project
    const txt = `${p?.name || '当前项目'}，当前在${p?.stage || '推进'}阶段，总进度百分之${p?.flow?.overallPct ?? p?.progress ?? 0}。`
    if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(txt)); toast('正在用本机语音播报', 'ok') }
    else toast(txt)
  },
})

document.addEventListener('keydown', e => { if (e.target?.id === 'nbChatInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ACT['nb-chat-send']() } })
document.addEventListener('input', e => { if (e.target?.id === 'nbChatInput') { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px` } })
VIEWS.notebook = renderNbWorkspace
