// NotebookLM 三栏项目工作空间：左栏（左上本地 PPT/Word/录音转文字工坊 + 左下资料源）| 中栏（流程进度%+插件提交 + 对话）| 右栏（笔记与各种看板）
import { S, D, ACT, VIEWS, hooks, $, esc, md, icon, get, act, toast, ficon, levelTag } from '/api/investai?asset=ui.js'

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

function renderLeftPane(x, p, checked) {
  return `<div class="nb-col">
    <div class="nb-col-hd"><b>来源 (${x.files.length})</b><span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">📂 专属文件夹</button></div>
    <div class="row" style="padding:10px 12px 6px"><button class="btn sm grow" data-act="proj-upload">${icon('plus', 12)} 添加来源</button>
      <button class="btn sm grow" data-act="nb-note-add" data-p="${p.id}">${icon('plus', 12)} 创建笔记</button></div>
    <div class="row" style="padding:4px 12px"><span class="dim" style="font-size:11.5px">勾选来源以针对性生成右侧 Studio 成品</span><span class="grow"></span>
      <label class="dim" style="font-size:11.5px;cursor:pointer"><input type="checkbox" class="ck" data-act="nb-src-all" ${checked.size && checked.size === x.files.length ? 'checked' : ''}> 全选</label></div>
    <div class="nb-sources">${x.files.map((f, idx) => `<label class="nb-src-row">
      <span class="mono dim">${idx + 1}</span>${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>
      <input type="checkbox" class="ck" data-act="nb-src-ck" data-id="${f.id}" ${checked.has(f.id) ? 'checked' : ''}></label>`).join('') || '<div class="empty">请点击上方「+ 添加来源」</div>'}
    </div>
  </div>`
}

function renderCenterPane(x, p, f) {
  const d = D()
  const msgs = S.chat.slice(-16)
  const chk = x.deliverables.find(z => z.checkout)
  return `<div class="nb-col">
    <div class="nb-flow-strip">
      <div class="row"><button class="btn ghost sm" data-act="go" data-view="workbench">${icon('left', 13)}项目库</button>
        <b class="ell" style="font-size:14.5px">${esc(p.name)}</b><span class="pill st-3">${esc(p.stage)} · 总进度 ${f.overallPct}%</span>
        <span class="grow"></span>
        <button class="nb-api-pill" data-act="nb-api"><span class="dot ${d.model.ok ? 'ok' : 'warn'}"></span><span>${esc(d.model.ok ? d.model.label : '本地离线引擎')}</span></button></div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
      <div class="row" style="flex-wrap:wrap">
        ${f.stageDetails.map(st => `<span class="nb-st-node ${st.state}">${st.state === 'done' ? '✓' : st.index + 1}. ${esc(st.name)} <b>${st.pct}%</b></span>`).join('')}
        <span class="grow"></span>
        <button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-ch="plugin-draft">${icon('spark', 12)}插件提交草稿</button>
        <button class="btn sm" data-act="nb-plug-upload" data-p="${p.id}">${icon('upload', 12)}本地件提交</button>
        ${chk ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-d="${chk.id}" data-ch="local-checkin">回传 Office 修改</button>` : ''}
        ${f.readinessOk ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-ch="gate-submit">发起门禁</button>` : ''}
      </div>
    </div>
    <div class="abody" style="flex:1;padding:14px;overflow:auto">
      ${msgs.length ? msgs.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}" style="margin-bottom:12px">
        <div class="dim" style="font-size:11px;margin-bottom:3px">${m.role === 'user' ? esc(d.me.name) : 'Gemini Notebook · FDE 助手'}</div>
        <div class="md">${md(m.text || m.job?.text || (m.job?.status === 'running' ? '正在基于勾选来源深度分析…' : ''))}</div>
        ${m.role !== 'user' ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="nb-save-chatnote" data-p="${p.id}">📌 保存到笔记</button></div>` : ''}</div>`).join('')
        : `<div class="box"><b>三、基于已勾选 ${S.ctx.fileIds.length} 个来源的深度工作流</b>
          <p class="dim" style="margin:6px 0">只针对左侧打勾的资料进行问答、生成 ≥3MB 麦肯锡版式 PPT 或专项报告，自动写入本项目专属文件夹并显示在左下角。</p></div>`}
      <div class="nb-follow-grid">${(x.followUps ?? []).map(q => `<button class="nb-follow-card" data-act="nb-q" data-q="${esc(q)}"><span>${esc(q)}</span><span class="dim">↳ 点击继续追问或执行下一步</span></button>`).join('')}</div>
    </div>
    <div class="composer" style="padding:10px 14px;border-top:1px solid var(--line)"><div class="row">
      <input class="input grow" id="nbChatInput" placeholder="提问或针对勾选资料创作内容…">
      <span class="dim" style="font-size:12px">${S.ctx.fileIds.length} 个来源</span>
      <button class="btn pri ico" data-act="nb-chat-send" style="border-radius:99px">${icon('send', 14)}</button></div></div>
  </div>`
}

function renderRightNotes(x, p) {
  const notes = x.notes ?? []
  const arts = x.artifacts?.items ?? []
  const studioBtns = [
    ['audio', '#38BDF8', '🎙️ 音频概览'],
    ['ppt', '#C084FC', '🖼️ 演示文稿'],
    ['video', '#4ADE80', '🎬 视频概览'],
    ['mindmap', '#818CF8', '🌿 思维导图'],
    ['word', '#F472B6', '📄 报告'],
    ['flashcards', '#FB923C', '🗂️ 闪卡'],
    ['quiz', '#60A5FA', '❓ 测验'],
    ['infographic', '#FBBF24', '📊 信息图'],
    ['table', '#34D399', '📋 数据表格'],
  ]
  return `<div class="nb-col">
    <div class="nb-col-hd"><b>Studio</b><span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-studio-ppt" data-p="${p.id}">编辑PPT</button>
      <button class="btn sm ghost" data-act="nb-studio-word" data-p="${p.id}">编辑Word</button></div>
    <div class="nb-studio-pillgrid">${studioBtns.map(([k, c, l]) => `<button class="nb-pill-btn" data-act="nb-make" data-p="${p.id}" data-k="${k}">
      <span style="color:${c}">${l}</span></button>`).join('')}</div>
    <div class="nb-notes-list" style="border-top:1px solid var(--line)">
      ${S.makingStudio ? `<div class="nb-art-item" style="border-color:#3B82F6"><span class="spin"></span><div class="grow"><b>正在生成 ${esc(S.makingStudio)}…</b><div class="dim" style="font-size:11px">基于已勾选 ${S.ctx.fileIds.length} 个来源制作并写入项目文件夹</div></div></div>` : ''}
      <div class="row" style="margin:2px 2px 4px"><b>✨ Studio 已生成成品 (${arts.length})</b><span class="grow"></span>
        <button class="lnk" data-act="nb-flowboard" data-p="${p.id}">进入项目管理提交看板 ›</button></div>
      ${arts.map((a, idx) => `<div class="nb-art-item" data-act="nb-open-folder" data-p="${p.id}" data-fp="${esc(a.fullPath)}">
        ${ficon(a.ext, true)}
        <div class="grow" style="min-width:0">
          <div class="ell"><b>${esc(a.name)}</b></div>
          <div class="dim ell" style="font-size:11px">${a.sourceCount || S.ctx.fileIds.length} 个来源 · ${(a.bytes / 1048576).toFixed(2)} MB · 点击本机打开</div>
        </div>
        <button class="btn sm pri" data-act="nb-submit-art" data-p="${p.id}" data-i="${idx}" onclick="event.stopPropagation()">提交到项目管理</button>
      </div>`).join('') || '<div class="dim" style="padding:8px;font-size:11.5px">点击上方 Studio 按钮制作，生成的成品将显示在此处（右下角）并可直接提交到项目管理流程</div>'}
      <div class="row" style="margin:10px 2px 4px"><b>📌 笔记与五维看板 (${notes.length})</b><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">全部看板</button></div>
      ${notes.map(n => `<div class="nb-note-card" data-act="nb-open-board" data-p="${p.id}" data-b="${esc(n.board || 'stages')}" data-n="${esc(n.id)}">
        <div class="row"><span class="tag blue">${esc(n.tag || '笔记')}</span><b class="ell grow">${esc(n.title)}</b></div>
        <div class="dim" style="font-size:11.5px;margin-top:4px">${esc(n.summary || '')}</div></div>`).join('')}
    </div>
  </div>`
}

Object.assign(ACT, {
  'nb-src-ck': el => { const s = new Set(S.ctx.fileIds); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); S.ctx.fileIds = [...s]; hooks.refresh() },
  'nb-src-all': () => { const all = S.project?.files?.map(f => f.id) ?? []; S.ctx.fileIds = S.ctx.fileIds.length === all.length ? [] : all; hooks.refresh() },
  'nb-q': el => { if ($('#nbChatInput')) { $('#nbChatInput').value = el.dataset.q; ACT['nb-chat-send']() } },
  'nb-chat-send': () => { const v = $('#nbChatInput')?.value?.trim(); if (!v) return; hooks.fill(v); hooks.send(); $('#nbChatInput').value = '' },
  'nb-note-add': async el => {
    const r = await act('nb.note.save', { projectId: el.dataset.p, title: `投研笔记 ${new Date().toLocaleTimeString('zh-CN')}`, content: '# 新建投研笔记\n\n- 记录尽调关键发现与看板待办', board: 'tasks' }, '✅ 已新建笔记')
    if (r) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-xlsx': el => ACT['nb-open-board']({ dataset: { p: el.dataset.p, b: 'evidence' } }),
  'nb-make': async el => {
    const k = el.dataset.k
    if (k === 'audio') return ACT['nb-studio-audio'](el)
    S.makingStudio = el.textContent.trim()
    hooks.refresh()
    const r = await act('nb.studio.make', { projectId: el.dataset.p || S.sel, kind: k, fileIds: S.ctx.fileIds })
    S.makingStudio = null
    if (r) {
      toast(`✅ 已生成「${r.name}」（${(r.bytes / 1048576).toFixed(2)} MB），已陈列在右下角 Studio 成品区`, 'ok')
      S.project = await get('project', { id: el.dataset.p || S.sel })
    }
    hooks.refresh()
  },
  'nb-submit-art': async el => {
    const pid = el.dataset.p || S.sel
    const art = S.project?.artifacts?.items?.[Number(el.dataset.i)]
    if (art) {
      const r = await act('nb.flow.submit', { projectId: pid, artifactPath: art.fullPath, artifactName: art.name, autoSubmitReview: true })
      if (r) toast(`✅ 已将右下角成品「${art.name}」提交至项目管理节点「${r.workType}」v${r.version}`, 'ok')
    }
    S.sel = pid
    hooks.go('flowboard', { id: pid })
  },
  'nb-save-chatnote': async el => {
    const last = S.chat.filter(m => m.role !== 'user').at(-1)
    const r = await act('nb.note.save', { projectId: el.dataset.p || S.sel, title: `问答结论笔记 ${new Date().toLocaleTimeString('zh-CN')}`, content: last?.text || '问答摘要', board: 'stages' }, '📌 已保存到右侧笔记与看板')
    if (r && S.project) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-tts': () => {
    const p = S.project?.project
    const txt = `${p?.name || '当前项目'}投研简报：当前处于${p?.stage || '推进'}阶段，全流程进度百分之${p?.flow?.overallPct ?? p?.progress ?? 0}。左上方工坊可本地修改PPT、Word与录音文字稿，右侧点击笔记可切换五大管理看板。`
    if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(txt)); toast('🎧 正在使用本机离线语音播报项目简报…', 'ok') }
    else toast(txt)
  },
})

document.addEventListener('keydown', e => { if (e.target?.id === 'nbChatInput' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ACT['nb-chat-send']() } })
VIEWS.notebook = renderNbWorkspace
