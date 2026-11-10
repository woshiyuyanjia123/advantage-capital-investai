// 优势资本投研 三栏项目工作空间：左栏（左上本地 PPT/Word/录音转文字工坊 + 左下资料源）| 中栏（流程进度%+插件提交 + 对话）| 右栏（笔记与各种看板）
import { S, D, ACT, VIEWS, hooks, $, esc, md, icon, get, act, toast, ficon, levelTag, drawer, drawerHead } from '/api/investai?asset=ui.js'

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
    <div class="nb-col-hd"><b>项目底稿资料 (${x.files.length})</b><span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">📂 项目档案室</button></div>
    <div class="row" style="padding:10px 12px 6px"><button class="btn sm grow" data-act="proj-upload">${icon('plus', 12)} 上传底稿</button>
      <button class="btn sm pri" data-act="nb-tyc-open" data-p="${p.id}">🔍 天眼查穿透</button>
      <button class="btn sm" data-act="nb-note-add" data-p="${p.id}">${icon('plus', 12)} 纪要</button></div>
    <div class="row" style="padding:4px 12px"><span class="dim" style="font-size:11.5px">勾选底稿以定向编制右侧工作成果</span><span class="grow"></span>
      <label class="dim" style="font-size:11.5px;cursor:pointer"><input type="checkbox" class="ck" data-act="nb-src-all" ${checked.size && checked.size === x.files.length ? 'checked' : ''}> 全选</label></div>
    <div class="nb-sources">${x.files.map((f, idx) => `<label class="nb-src-row">
      <span class="mono dim">${idx + 1}</span>${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>
      <input type="checkbox" class="ck" data-act="nb-src-ck" data-id="${f.id}" ${checked.has(f.id) ? 'checked' : ''}></label>`).join('') || '<div class="empty">请点击上方「+ 上传底稿资料」</div>'}
    </div>
  </div>`
}

function renderCenterPane(x, p, f) {
  const d = D()
  const msgs = S.chat.slice(-16)
  const chk = x.deliverables.find(z => z.checkout)
  const os = x.osState ?? { messages: [], autoTasks: [] }
  S.centerTab ??= 'im'
  return `<div class="nb-col">
    <div class="nb-flow-strip">
      <div class="row"><button class="btn ghost sm" data-act="go" data-view="workbench">${icon('left', 13)}投研项目总览</button>
        <b class="ell" style="font-size:14.5px">${esc(p.name)}</b><span class="pill st-3">${esc(p.stage)} · 全周期进度 ${f.overallPct}%</span>
        <span class="grow"></span>
        <button class="btn sm ${S.centerTab === 'im' ? 'pri' : 'ghost'}" data-act="nb-ctab" data-t="im">💬 项目组协同流 (IM×成果共创)</button>
        <button class="btn sm ${S.centerTab === 'qa' ? 'pri' : 'ghost'}" data-act="nb-ctab" data-t="qa">✨ 底稿溯源研判</button>
        <button class="nb-api-pill" data-act="nb-api"><span class="dot ${d.model.ok ? 'ok' : 'warn'}"></span><span>${esc(d.model.ok ? d.model.label : '本地离线引擎')}</span></button></div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
      <div class="row" style="flex-wrap:wrap">
        <span class="dim" style="font-size:11px">⚡ 机构自动化协同流：</span>
        ${(os.autoTasks ?? []).map(at => `<button class="btn sm ${at.enabled ? 'pri' : 'ghost'}" style="padding:2px 7px;font-size:10.5px" data-act="nb-os-at" data-p="${p.id}" data-id="${at.id}" title="${esc(at.desc)}">${at.enabled ? '✓ ' : ''}${esc(at.name)}</button>`).join('')}
        <span class="grow"></span>
        ${chk ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-d="${chk.id}" data-ch="local-checkin">回传本地修订件</button>` : ''}
      </div>
    </div>
    <div class="abody" style="flex:1;padding:14px;overflow:auto">
      ${S.centerTab === 'im' ? (os.messages ?? []).map(m => `<div class="msg ${m.role === 'agent' ? 'ai' : 'me'}" style="margin-bottom:10px;border-left:3px solid ${m.role === 'agent' ? '#3B82F6' : '#10B981'}">
        <div class="row" style="margin-bottom:4px"><b style="font-size:12px">${esc(m.sender)}</b><span class="tag blue">${esc(m.badge || '群协同')}</span></div>
        <div class="md">${md(m.text || '')}</div>
        ${m.actions?.length ? `<div class="row" style="flex-wrap:wrap;margin-top:6px">${m.actions.map(a => `<span class="pill st-3" style="font-size:10.5px">${esc(a)}</span>`).join('')}</div>` : ''}
      </div>`).join('') : (msgs.length ? msgs.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}" style="margin-bottom:12px">
        <div class="dim" style="font-size:11px;margin-bottom:3px">${m.role === 'user' ? esc(d.me.name) : '优势资本 · 智能投研助手'}</div>
        <div class="md">${md(m.text || m.job?.text || (m.job?.status === 'running' ? '正在基于勾选来源深度分析…' : ''))}</div>
        ${m.role !== 'user' ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="nb-save-chatnote" data-p="${p.id}">📌 保存到笔记</button></div>` : ''}</div>`).join('')
        : `<div class="box"><b>基于已勾选 ${S.ctx.fileIds.length} 个来源的深度工作流</b></div>`)}
      <div class="nb-follow-grid">${(x.followUps ?? []).map(q => `<button class="nb-follow-card" data-act="nb-q" data-q="${esc(q)}"><span>${esc(q)}</span><span class="dim">↳ 点击在群内一键执行跨工具任务</span></button>`).join('')}</div>
    </div>
    <div class="composer" style="padding:10px 14px;border-top:1px solid var(--line)"><div class="row">
      <input class="input grow" id="nbChatInput" placeholder="在项目群说一句话：让 Agent 同时改文档、更新表格、发群消息并提交业务流程…">
      <span class="dim" style="font-size:12px">${S.ctx.fileIds.length} 个来源</span>
      <button class="btn pri" data-act="nb-os-send" data-p="${p.id}">⚡ 群聊协同执行</button>
      <button class="btn ghost ico" data-act="nb-chat-send" title="纯问答">${icon('send', 14)}</button></div></div>
  </div>`
}

function renderRightNotes(x, p) {
  const notes = x.notes ?? []
  const arts = x.artifacts?.items ?? []
  S.studioCfg ??= { pageCount: 8, targetMB: 6, theme: 'mck', density: 'standard', specKind: 'ppt' }
  const cfg = S.studioCfg
  const SPECS = {
    ppt: '🖼️ 演示文稿规范：建议 6–14 页 · 单页 130–240 字（3–5 条结论先行要点）· 封面+金字塔摘要+条带卡/2×2 Bento 交替 · 留白率 ≥35% · 画布体积 3–25 MB',
    word: '📄 深度报告规范：建议 7–10 章 · 总字数 2,500–6,500 字 · 深海蓝章节底线 + 左侧蓝条溯源框 + 深蓝表头斑马纹数据表 · 1.4x 舒适行距',
    table: '📋 数据表格规范：4 个标准工作表（工商交易要素 + 原文财务/合同表 + 三维尽调清单 + 勾选资料逐条事实溯源）· 自动列宽与千分位格式',
    audio: '🎙️ 双人播客规范：Host A（合伙人）× Host B（分析师）6–10 轮交叉追问 · 1,400–2,400 字口语化实证交锋 · 支持双声线语音联播',
    video: '🎬 视频分镜规范：Scene 01–08 动态镜头分镜卡 · 每幕含画面视觉高光提示 + 旁白配音词 + 原文角标',
    mindmap: '🌿 思维导图规范：3 层可折叠证据树 · 每个末梢节点强制绑定 [n] 原文出处标签，单分支 ≤6 项防拥挤',
    flashcards: '🗂️ 翻转闪卡规范：6–12 张 2 列网格主动回忆卡 · 正面核心核验问题，点击翻转展示底稿原文答案与出处',
    quiz: '❓ 核验测验规范：4–8 道底稿实证选择题 · 点击选项即刻判分并弹出原文核对依据',
    infographic: '📊 信息图规范：3 列核心量化指标渐流光卡 + 2 列事实证据 Bento 网格 · 零虚构数字',
  }
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
    <div class="nb-col-hd"><b>投研成果编制中心</b><span class="grow"></span>
      <button class="btn sm pri" data-act="nb-dify-open" data-p="${p.id}">🏛️ 机构模板与额度</button>
      <button class="btn sm ghost" data-act="nb-studio-audio" data-p="${p.id}">🎙️ 录音转写</button>
      <button class="btn sm ghost" data-act="nb-studio-ppt" data-p="${p.id}">修订PPT</button>
      <button class="btn sm ghost" data-act="nb-studio-word" data-p="${p.id}">修订文书</button></div>
    <div style="padding:8px 12px;border-bottom:1px solid var(--line);background:#0C162B;font-size:11.5px;display:flex;flex-direction:column;gap:6px">
      <div class="row"><span>📏 页数 / 章节数：<b id="nbPgVal" style="color:#60A5FA">${cfg.pageCount} 页/章</b> <span class="dim">(规范区间 4–24)</span></span><span class="grow"></span>
        <input type="range" min="4" max="24" step="1" value="${cfg.pageCount}" style="width:120px;accent-color:#3B82F6" data-act="nb-cfg-pg"></div>
      <div class="row"><span>💎 目标文件大小：<b id="nbMbVal" style="color:#34D399">~${cfg.targetMB} MB</b> <span class="dim">(高清区间 3–30MB)</span></span><span class="grow"></span>
        <input type="range" min="3" max="30" step="1" value="${cfg.targetMB}" style="width:120px;accent-color:#10B981" data-act="nb-cfg-mb"></div>
      <div class="row">
        <select class="select sm grow" data-act="nb-cfg-theme">
          <option value="mck" ${cfg.theme === 'mck' ? 'selected' : ''}>🎨 麦肯锡深海蓝 (Mck)</option>
          <option value="swiss" ${cfg.theme === 'swiss' ? 'selected' : ''}>🎨 瑞士国际网格 (Swiss)</option>
          <option value="emerald" ${cfg.theme === 'emerald' ? 'selected' : ''}>🎨 黑金翡翠投研 (Emerald)</option>
        </select>
        <select class="select sm grow" data-act="nb-cfg-den">
          <option value="concise" ${cfg.density === 'concise' ? 'selected' : ''}>📐 高管精炼 (每页3要点)</option>
          <option value="standard" ${cfg.density === 'standard' ? 'selected' : ''}>📐 咨询标准 (每页5要点)</option>
          <option value="dense" ${cfg.density === 'dense' ? 'selected' : ''}>📐 尽调详实 (每页6要点)</option>
        </select>
      </div>
      <div class="dim" id="nbSpecHint" style="padding:5px 8px;background:#111F3D;border-radius:6px;border-left:3px solid #3B82F6;line-height:1.45">${esc(SPECS[cfg.specKind] || SPECS.ppt)}</div>
    </div>
    <div class="nb-studio-pillgrid">${studioBtns.map(([k, c, l]) => `<button class="nb-pill-btn" data-act="nb-make" data-p="${p.id}" data-k="${k}">
      <span style="color:${c}">${l}</span></button>`).join('')}</div>
    <div class="nb-notes-list" style="border-top:1px solid var(--line)">
      ${S.makingStudio ? `<div class="nb-art-item" style="border-color:#3B82F6"><span class="spin"></span><div class="grow"><b>正在编制 ${esc(S.makingStudio)}…</b><div class="dim" style="font-size:11px">严格依据已勾选 ${S.ctx.fileIds.length} 份底稿编制并归档至项目档案室</div></div></div>` : ''}
      <div class="row" style="margin:2px 2px 4px"><b>✨ 已编制工作成果 (${arts.length})</b><span class="grow"></span>
        <button class="lnk" data-act="nb-flowboard" data-p="${p.id}">进入阶段门禁与投决 ›</button></div>
      ${arts.map((a, idx) => `<div class="nb-art-item" data-act="nb-open-folder" data-p="${p.id}" data-fp="${esc(a.fullPath)}">
        ${ficon(a.ext, true)}
        <div class="grow" style="min-width:0">
          <div class="ell"><b>${esc(a.name)}</b></div>
          <div class="dim ell" style="font-size:11px">${a.sourceCount || S.ctx.fileIds.length} 份底稿溯源 · ${(a.bytes / 1048576).toFixed(2)} MB · 点击本机检阅</div>
        </div>
        <button class="btn sm pri" data-act="nb-submit-art" data-p="${p.id}" data-i="${idx}" onclick="event.stopPropagation()">报送阶段复核</button>
      </div>`).join('') || '<div class="dim" style="padding:8px;font-size:11.5px">点击上方编制按钮，产出的正式工作成果将陈列于此（右下角）并可直接报送阶段复核</div>'}
      <div class="row" style="margin:10px 2px 4px"><b>📌 尽调纪要与五维管控看板 (${notes.length})</b><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">五维管控看板</button></div>
      ${notes.map(n => `<div class="nb-note-card" data-act="nb-open-board" data-p="${p.id}" data-b="${esc(n.board || 'stages')}" data-n="${esc(n.id)}">
        <div class="row"><span class="tag blue">${esc(n.tag || '笔记')}</span><b class="ell grow">${esc(n.title)}</b></div>
        <div class="dim" style="font-size:11.5px;margin-top:4px">${esc(n.summary || '')}</div></div>`).join('')}
    </div>
  </div>`
}

Object.assign(ACT, {
  'nb-ctab': el => { S.centerTab = el.dataset.t || 'im'; hooks.refresh() },
  'nb-os-at': async el => {
    const r = await act('nb.os.autotask', { projectId: el.dataset.p || S.sel, taskId: el.dataset.id }, '⚡ 已切换 DWS 事件自动任务状态')
    if (r && S.project) { S.project.osState = r; hooks.refresh() }
  },
  'nb-os-send': async el => {
    const v = $('#nbChatInput')?.value?.trim()
    if (!v) return
    $('#nbChatInput').value = ''
    const cfg = S.studioCfg ?? { pageCount: 8, targetMB: 6 }
    toast('⚡ Agent OS 正在群内执行跨工具操作（IM 群聊 × Office 文档 × SaaS 流程）…')
    const r = await act('nb.os.dispatch', { projectId: el?.dataset?.p || S.sel, text: v, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, targetMB: cfg.targetMB })
    if (r) {
      toast(`✅ 跨工具执行完成：已生成《${r.artifact.name}》并同步至项目群与业务流程`, 'ok')
      S.project = await get('project', { id: el?.dataset?.p || S.sel })
      S.centerTab = 'im'
      hooks.refresh()
    }
  },
  'nb-src-ck': el => { const s = new Set(S.ctx.fileIds); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); S.ctx.fileIds = [...s]; hooks.refresh() },
  'nb-src-all': el => { const all = S.project?.files?.map(f => f.id) ?? []; S.ctx.fileIds = el?.checked === false ? [] : (S.ctx.fileIds.length === all.length ? [] : all); hooks.refresh() },
  'nb-q': el => { if ($('#nbChatInput')) { $('#nbChatInput').value = el.dataset.q; S.centerTab === 'im' ? ACT['nb-os-send'](el) : ACT['nb-chat-send']() } },
  'nb-chat-send': () => { const v = $('#nbChatInput')?.value?.trim(); if (!v) return; S.centerTab = 'qa'; hooks.fill(v); hooks.send(); $('#nbChatInput').value = ''; hooks.refresh() },
  'nb-note-add': async el => {
    const r = await act('nb.note.save', { projectId: el.dataset.p, title: `投研笔记 ${new Date().toLocaleTimeString('zh-CN')}`, content: '# 新建投研笔记\n\n- 记录尽调关键发现与看板待办', board: 'tasks' }, '✅ 已新建笔记')
    if (r) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-xlsx': el => ACT['nb-open-board']({ dataset: { p: el.dataset.p, b: 'evidence' } }),
  'nb-cfg-pg': el => { S.studioCfg ??= {}; S.studioCfg.pageCount = Number(el.value) || 8; if ($('#nbPgVal')) $('#nbPgVal').textContent = `${S.studioCfg.pageCount} 页/章` },
  'nb-cfg-mb': el => { S.studioCfg ??= {}; S.studioCfg.targetMB = Number(el.value) || 6; if ($('#nbMbVal')) $('#nbMbVal').textContent = `~${S.studioCfg.targetMB} MB` },
  'nb-cfg-theme': el => { S.studioCfg ??= {}; S.studioCfg.theme = el.value || 'mck' },
  'nb-cfg-den': el => { S.studioCfg ??= {}; S.studioCfg.density = el.value || 'standard' },
  'nb-tyc-open': async el => {
    const pid = el.dataset.p || S.sel
    const p = S.project?.project
    const meta = await get('nb.tyc.meta')
    drawer(`${drawerHead('🔍 天眼查七维商事与司法尽调穿透', '一键调取工商基本、股东穿透、司法风险、对外担保、动产抵押、严重违法与票据催告 7 大维度，自动生成底稿入库并勾选')}
      <div class="body">
        <div class="row" style="margin-bottom:8px">
          <input class="input sm grow" id="nbTycCompany" value="${esc(S.project?.company?.name || p?.name?.split(' ')[0] || '')}" placeholder="输入目标企业全称或简称…">
          <input class="input sm" id="nbTycToken" type="password" style="width:220px" placeholder="可选：天眼查 Open API Token">
          <button class="btn sm pri" data-act="nb-tyc-run" data-p="${pid}">⚡ 立即穿透并写入项目底稿</button>
        </div>
        <div class="box"><b>七大商事与司法尽调核查维度</b>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px">${(meta.dimensions || []).map(d => `<div class="wcard"><b>${esc(d.name)}</b><div class="dim" style="font-size:11px;margin-top:3px">${esc(d.fields)}</div></div>`).join('')}</div>
        </div>
        <div id="nbTycResult" style="margin-top:10px"></div>
      </div>`, true)
  },
  'nb-tyc-run': async el => {
    const pid = el.dataset.p || S.sel
    const companyName = $('#nbTycCompany')?.value?.trim()
    const apiToken = $('#nbTycToken')?.value?.trim()
    toast('🔍 正在执行天眼查七维商事与司法尽调穿透…')
    const r = await act('nb.tyc.query', { projectId: pid, companyName, apiToken })
    if (r?.file) {
      if (!S.ctx.fileIds.includes(r.file.id)) S.ctx.fileIds.push(r.file.id)
      toast(`✅ 已生成《${r.file.name}》（${r.mode}），已自动加入左侧底稿勾选池`, 'ok')
      if ($('#nbTycResult')) $('#nbTycResult').innerHTML = `<div class="box" style="border-color:#10B981"><div class="md">${md(r.markdown || '')}</div></div>`
      S.project = await get('project', { id: pid })
      hooks.refresh()
    }
  },
  'nb-dify-open': async el => {
    const pid = el.dataset.p || S.sel
    const data = await get('nb.dify.templates', { projectId: pid })
    S.difySt = { pid, tpls: data.templates || [], quota: data.quota, perms: data.permissions, curId: data.templates?.[0]?.id || 'ac_dd_word', yaml: data.sampleYaml || '', trace: null }
    renderDifyDrawer()
  },
  'nb-dify-tpl': async el => {
    const pid = S.difySt?.pid || S.sel
    const data = await get('nb.dify.templates', { projectId: pid, tplId: el.value })
    S.difySt = { ...S.difySt, curId: el.value, quota: data.quota, perms: data.permissions, yaml: data.sampleYaml || '', trace: null }
    renderDifyDrawer()
  },
  'nb-dify-run': async () => {
    const st = S.difySt || { pid: S.sel, curId: 'ac_dd_word' }
    const cfg = S.studioCfg ?? { pageCount: 8, targetMB: 6, theme: 'mck', density: 'standard' }
    toast('🏛️ 正在按机构标准工作流节点执行核验并扣减配额…')
    const r = await act('nb.dify.run', { projectId: st.pid, workflowId: st.curId, dslYaml: $('#nbDifyYaml')?.value, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, targetMB: cfg.targetMB, theme: cfg.theme, density: cfg.density, autoSubmit: !!$('#nbDifyAutoSub')?.checked })
    if (r) {
      S.difySt.trace = r.trace
      if (r.gov) { S.difySt.quota = r.gov.quota; S.difySt.tpls = r.gov.templates }
      toast(`✅ 机构工作流「${r.workflowName}」执行完毕，已产出《${r.artifact.name}》`, 'ok')
      S.project = await get('project', { id: st.pid })
      renderDifyDrawer()
      hooks.refresh()
    }
  },
  'nb-make': async el => {
    const k = el.dataset.k
    const cfg = S.studioCfg ?? { pageCount: 8, targetMB: 6, theme: 'mck', density: 'standard' }
    cfg.specKind = k
    S.makingStudio = `${el.textContent.trim()} (${cfg.pageCount}页/章 · ~${cfg.targetMB}MB)`
    hooks.refresh()
    const r = await act('nb.studio.make', { projectId: el.dataset.p || S.sel, kind: k, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, targetMB: cfg.targetMB, theme: cfg.theme, density: cfg.density })
    S.makingStudio = null
    if (r) {
      toast(`✅ 已按规格 (${cfg.pageCount}页/章 · ${(r.bytes / 1048576).toFixed(2)} MB) 编制「${r.name}」并置于右下角`, 'ok')
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

document.addEventListener('keydown', e => { if (e.target?.id === 'nbChatInput' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); S.centerTab === 'im' ? ACT['nb-os-send']({ dataset: { p: S.sel } }) : ACT['nb-chat-send']() } })
document.addEventListener('input', e => { const a = e.target?.dataset?.act; if (a?.startsWith('nb-cfg-') && ACT[a]) ACT[a](e.target) })
VIEWS.notebook = renderNbWorkspace

function renderDifyDrawer() {
  const st = S.difySt || { tpls: [], curId: 'ac_dd_word', yaml: '', quota: { usedCalls: 12, limitCalls: 500, remainCalls: 488, usedRMB: 3.85, monthlyLimitRMB: 200, remainRMB: 196.15 }, perms: {} }
  const cur = st.tpls.find(t => t.id === st.curId) || st.tpls[0] || {}
  const q = st.quota || {}
  drawer(`${drawerHead('🏛️ 优势资本 · 机构模板中心与企业级额度治理', '对标企业级治理规范：个人/部门调用配额与成本归因 · 按全机构使用频次排序的标准模板 · 非管理员密钥脱敏与模型权限锁')}
    <div class="body">
      <div class="box" style="margin-bottom:10px;background:#0F1E3A;border-color:#2563EB">
        <div class="row"><b>📊 当前账号 AI 额度与消费归因</b><span class="grow"></span>
          <span class="pill st-3">剩余调用：${q.remainCalls ?? 488} / ${q.limitCalls ?? 500} 次</span>
          <span class="pill st-4">本月余额：¥${q.remainRMB ?? 196.15} / ¥${q.monthlyLimitRMB ?? 200}</span></div>
        <div class="dim" style="margin-top:6px;font-size:11.5px">权限边界：${st.perms?.canToggleModel ? '管理员（可管理模型供应商、密钥限额与同步机构标准模板）' : '普通成员（已锁定模型供应商开关与API密钥明文查看，保障机构合规）'}</div>
      </div>
      <label class="f">机构标准工作流模板中心（按全机构累计调用频次排序）
        <select class="select" data-act="nb-dify-tpl">${st.tpls.map(t => `<option value="${t.id}" ${t.id === st.curId ? 'selected' : ''}>🔥 [${t.usageCount}次调用] ${esc(t.name)} · ${esc(t.category)}</option>`).join('')}</select></label>
      <div class="box" style="margin:8px 0"><b>标准执行节点流（Workflow Graph）</b>
        <div class="row" style="flex-wrap:wrap;margin-top:6px">${(cur.nodes || []).map((n, i) => `<span class="pill st-3">${i + 1}. ${esc(n)}</span>`).join(' → ')}</div>
        <div class="dim" style="margin-top:6px;font-size:11.5px">${esc(cur.desc || '')}</div></div>
      ${st.trace ? `<div class="box" style="margin:8px 0;border-color:#10B981"><b>✅ 节点执行与计费归因完成</b><div class="row" style="flex-wrap:wrap;margin-top:6px">${st.trace.map(t => `<span class="tag blue">✓ ${esc(t.node)} (${t.ms}ms)</span>`).join('')}</div></div>` : ''}
      <label class="f">工作流编排定义（YAML DSL · 支持导入/导出）
        <textarea class="input area mono" id="nbDifyYaml" style="height:175px">${esc(st.yaml)}</textarea></label>
      <div class="row" style="margin-top:10px">
        <label class="dim"><input type="checkbox" id="nbDifyAutoSub" checked> 执行完成后自动报送至当前阶段复核节点</label>
        <span class="grow"></span>
        <button class="btn pri" data-act="nb-dify-run">▶ 立即执行此机构标准工作流</button>
      </div>
    </div>`, true)
}
