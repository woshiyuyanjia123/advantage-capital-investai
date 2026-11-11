// 优势资本投研 三栏项目工作空间：左栏（左上本地 PPT/Word/录音转文字工坊 + 左下资料源）| 中栏（流程进度%+插件提交 + 对话）| 右栏（笔记与各种看板）
import { S, D, ACT, VIEWS, hooks, $, esc, md, icon, get, act, toast, ficon, levelTag, drawer, drawerHead } from '/api/investai?asset=ui.js'

function getRawSourceFiles(x) {
  const all = x?.files ?? []
  const raw = all.filter(f => f.mountId !== 'm_ws' && !String(f.rel || '').includes('Studio成品') && !/^(项目信息表|尽调报告|立项报告|尽调清单|NDA)-v\d+\./i.test(f.name))
  return raw.length ? raw : all
}

async function loadNbProject() {
  if (!S.sel) S.sel = D()?.projects?.[0]?.id
  if (!S.sel) return
  S.project = await get('project', { id: S.sel }).catch(e => ({ error: e.message }))
  const raw = getRawSourceFiles(S.project)
  if (raw.length && !raw.some(f => S.ctx.fileIds.includes(f.id))) S.ctx.fileIds = raw.map(f => f.id)
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
  const rawFiles = getRawSourceFiles(x)
  if (rawFiles.length && !rawFiles.some(f => S.ctx.fileIds.includes(f.id))) S.ctx.fileIds = rawFiles.map(f => f.id)
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const checked = new Set(S.ctx.fileIds)
  v.innerHTML = `<div class="nb-ws">
    ${renderLeftPane(rawFiles, p, checked)}
    ${renderCenterPane(x, p, f, rawFiles)}
    ${renderRightNotes(x, p)}
  </div>`
}

function sourceCredTag(name = '') {
  if (/审计|财务|财报|利润|合同|天眼查|工商/.test(name)) return '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:#064E3B;color:#6EE7B7;white-space:nowrap" title="A级强公信证据：审计/财务/合同/工商底稿">A级·强公信</span>'
  if (/商业计划|BP|路演/i.test(name)) return '<span style="font-size:10px;padding:1px 5px;border-radius:4px;border:1px dashed #F59E0B;color:#FCD34D;white-space:nowrap" title="C级管理层自述：需与A级审计/工商底稿交叉核实">C级·BP自述</span>'
  return '<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:#1E3A8A;color:#93C5FD;white-space:nowrap" title="B级尽调访谈与内部纪要">B级·尽调核实</span>'
}

function renderLeftPane(rawFiles, p, checked) {
  return `<div class="nb-col">
    <div class="nb-col-hd"><b style="white-space:nowrap">项目底稿资料 (${rawFiles.length})</b><span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">📂 项目档案室</button></div>
    <div class="row" style="padding:10px 12px 6px"><button class="btn sm grow" data-act="proj-upload">${icon('plus', 12)} 上传底稿</button>
      <button class="btn sm pri" data-act="nb-tyc-open" data-p="${p.id}">🔍 天眼查穿透</button>
      <button class="btn sm" data-act="nb-note-add" data-p="${p.id}">${icon('plus', 12)} 纪要</button></div>
    <div class="row" style="padding:4px 12px"><span class="dim" style="font-size:11.5px">已勾选 ${checked.size} 份底稿（自动标注证据效力等级）</span><span class="grow"></span>
      <label class="dim" style="font-size:11.5px;cursor:pointer"><input type="checkbox" class="ck" data-act="nb-src-all" ${checked.size && checked.size >= rawFiles.length ? 'checked' : ''}> 全选</label></div>
    <div class="nb-sources">${rawFiles.map((f, idx) => `<label class="nb-src-row">
      <span class="mono dim">${idx + 1}</span>${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>${sourceCredTag(f.name)}
      <input type="checkbox" class="ck" data-act="nb-src-ck" data-id="${f.id}" ${checked.has(f.id) ? 'checked' : ''}></label>`).join('') || '<div class="empty">请点击上方「+ 上传底稿」</div>'}
    </div>
  </div>`
}

function renderCenterPane(x, p, f, rawFiles) {
  const d = D()
  const msgs = S.chat.slice(-16)
  const chk = x.deliverables.find(z => z.checkout)
  return `<div class="nb-col">
    <div class="nb-flow-strip">
      <div class="row" style="flex-wrap:nowrap">
        <button class="btn ghost sm" style="white-space:nowrap" data-act="go" data-view="workbench">${icon('left', 13)}项目总览</button>
        <b class="ell" style="font-size:14.5px">${esc(p.name)}</b>
        <span class="pill st-3" style="white-space:nowrap">${esc(p.stage)} · ${f.overallPct}%</span>
        <span class="grow"></span>
        ${chk ? `<button class="btn sm pri" style="white-space:nowrap" data-act="nb-plug-sub" data-p="${p.id}" data-d="${chk.id}" data-ch="local-checkin">回传修订件</button>` : ''}
        <button class="btn sm pri" style="white-space:nowrap" data-act="nb-flowboard" data-p="${p.id}">阶段门禁与投决 ›</button>
      </div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
      <div class="row" style="flex-wrap:wrap;gap:4px">
        ${f.stageDetails.map(st => `<span class="nb-st-node ${st.state}">${st.state === 'done' ? '✓' : st.index + 1}. ${esc(st.name)} <b>${st.pct}%</b></span>`).join('')}
      </div>
    </div>
    <div class="abody" id="nbCenterChat" style="flex:1;padding:16px;overflow:auto">
      ${msgs.length ? msgs.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}" ${m.jobId ? `data-nbjob="${m.jobId}"` : ''} style="margin-bottom:12px">
        <div class="dim" style="font-size:11px;margin-bottom:4px">${m.role === 'user' ? esc(d.me.name) : '优势资本 · Carbon 底稿溯源投研助手'}</div>
        <div class="md">${md(m.text || m.job?.text || (m.job?.status === 'running' ? '正在锚定已勾选底稿进行红蓝军交叉研判…' : ''))}</div>
        ${m.role !== 'user' ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="nb-save-chatnote" data-p="${p.id}">📌 存入尽调纪要</button></div>` : ''}</div>`).join('')
        : `<div class="box" style="margin-bottom:14px"><b>✨ 底稿溯源深度研判（已锚定左侧勾选的 ${S.ctx.fileIds.length || rawFiles.length} 份原始底稿）</b>
          <div class="dim" style="margin-top:6px;line-height:1.6">向 AI 提问任何有关财务勾稽、客户合同、估值条款或潜在诉讼的问题，回答将逐句标注 <code>[n]</code> 底稿出处；也可点击下方开启 <b>红蓝军跨源对质</b> 一眼揪出 BP 与财报/尽调底稿的矛盾点。</div>
          <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="nb-q" data-q="请以红蓝军对质视角，逐项比对当前勾选的 C级商业计划书(BP) 与 A级财务报表/合同/尽调访谈底稿，列出所有口径背离、过度承诺与潜在 Deal-breaker 致命风险，并标注 [n] 出处。">⚔️ 启动红蓝军跨源矛盾对质雷达</button></div></div>`}
      <div class="nb-follow-grid">${(x.followUps ?? []).map(q => `<button class="nb-follow-card" data-act="nb-q" data-q="${esc(q)}"><span>${esc(q)}</span><span class="dim">↳ 点击基于已勾选底稿立即深度研判</span></button>`).join('')}</div>
    </div>
    <div class="composer" style="padding:10px 14px;border-top:1px solid var(--line)"><div class="row">
      <input class="input grow" id="nbChatInput" placeholder="围绕左侧已勾选底稿提问（自动标注 [1][2] 原文出处）…">
      <span class="dim" style="font-size:12px;white-space:nowrap">${S.ctx.fileIds.length || rawFiles.length} 份底稿</span>
      <button class="btn pri" style="white-space:nowrap" data-act="nb-chat-send">${icon('send', 13)} 提问研判</button>
      <button class="btn ghost" style="white-space:nowrap" data-act="nb-harness-open" data-p="${p.id}" title="将当前需求交由 Harness 受控思考并调用制作引擎">🧠 受控制作</button></div></div>
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
    ic_memo: '📜 投决备忘录 (IC Memo) 规范：深海蓝 #1a1a4e + 米白纸面 · 罗马章节 I–IX · 5-KPI横条 + 技术三立柱 + 蓝军反驳视角(Red-Flag) + Verdict Box 明确裁定（拒绝主观打星）',
  }
  const studioBtns = [
    ['ic_memo', '#A78BFA', '📜 投决备忘录'],
    ['ppt', '#C084FC', '🖼️ 演示文稿'],
    ['word', '#F472B6', '📄 尽调报告'],
    ['table', '#34D399', '📋 数据表格'],
    ['mindmap', '#818CF8', '🌿 思维导图'],
    ['audio', '#38BDF8', '🎙️ 音频概览'],
    ['video', '#4ADE80', '🎬 视频概览'],
    ['flashcards', '#FB923C', '🗂️ 核验闪卡'],
    ['quiz', '#60A5FA', '❓ 答辩测验'],
  ]
  return `<div class="nb-col">
    <div class="nb-col-hd"><b style="white-space:nowrap">投研成果编制中心</b><span class="grow"></span>
      <button class="btn sm pri" style="white-space:nowrap" data-act="nb-harness-open" data-p="${p.id}" title="打开 Agentic Harness 受控思考与成套材料制作中枢">🧠 Harness 受控制作</button>
      <button class="btn sm ghost" style="white-space:nowrap" data-act="nb-arch-open" data-p="${p.id}" title="查看五层解耦架构与 Agent×Agent 互校日志">🏗️ 底座监控</button>
      <button class="btn sm ghost" style="white-space:nowrap" data-act="nb-dify-open" data-p="${p.id}">🏛️ 模板</button>
      <button class="btn sm ghost" style="white-space:nowrap" data-act="nb-studio-audio" data-p="${p.id}">🎙️ 语音</button></div>
    <div class="nb-studio-pillgrid">${studioBtns.map(([k, c, l]) => `<button class="nb-pill-btn" data-act="nb-make" data-p="${p.id}" data-k="${k}">
      <span style="color:${c}">${l}</span></button>`).join('')}</div>
    <div style="padding:6px 12px;border-top:1px solid var(--line);background:#0B1528;font-size:11.5px">
      <div class="row" style="flex-wrap:nowrap">
        <span style="cursor:pointer" data-act="nb-cfg-toggle">🎛️ 规格：<b style="color:#60A5FA">${cfg.pageCount}页/章</b> · <b style="color:#34D399">~${cfg.targetMB}MB</b> <span class="lnk">${S.showStudioCfg ? '▴' : '▾'}</span></span>
        <span class="grow"></span>
        <button class="btn sm ghost" style="padding:2px 6px;font-size:11px" data-act="nb-studio-ppt" data-p="${p.id}">PPT工坊</button>
        <button class="btn sm ghost" style="padding:2px 6px;font-size:11px" data-act="nb-studio-word" data-p="${p.id}">文书工坊</button>
      </div>
      ${S.showStudioCfg ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        <div class="row"><span>📏 页数 / 章节数：<b id="nbPgVal" style="color:#60A5FA">${cfg.pageCount} 页/章</b> <span class="dim">(4–24)</span></span><span class="grow"></span>
          <input type="range" min="4" max="24" step="1" value="${cfg.pageCount}" style="width:120px;accent-color:#3B82F6" data-act="nb-cfg-pg"></div>
        <div class="row"><span>💎 目标文件大小：<b id="nbMbVal" style="color:#34D399">~${cfg.targetMB} MB</b> <span class="dim">(3–30MB)</span></span><span class="grow"></span>
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
      </div>` : ''}
    </div>
    <div class="nb-notes-list" style="border-top:1px solid var(--line)">
      ${S.makingStudio ? `<div class="nb-art-item" style="border-color:#3B82F6;background:#0F1E3A"><span class="spin"></span><div class="grow"><b>Carbon 深度思考编排中：${esc(S.makingStudio)}</b><div class="dim" style="font-size:11px;margin-top:2px">① 多源底稿采集(${S.ctx.fileIds.length}份) ➔ ② 财务与BP红蓝军互校 ➔ ③ 自主视觉版式设计 ➔ ④ 反幻觉溯源归档</div></div></div>` : ''}
      <div class="row" style="margin:2px 2px 4px"><b>✨ 已编制工作成果 (${arts.length})</b><span class="grow"></span>
        <button class="lnk" data-act="nb-flowboard" data-p="${p.id}">进入阶段门禁与投决 ›</button></div>
      ${arts.map((a, idx) => `<div class="nb-art-item" data-act="nb-preview-art" data-p="${p.id}" data-i="${idx}" data-ext="${esc(a.ext)}" data-fp="${esc(a.fullPath)}">
        ${ficon(a.ext, true)}
        <div class="grow" style="min-width:0">
          <div class="ell"><b>${esc(a.name)}</b></div>
          <div class="dim ell" style="font-size:11px">${a.sourceCount || S.ctx.fileIds.length} 份底稿 · ${(a.bytes / 1048576).toFixed(2)} MB · ${a.meshCert ? `🛡️互校${a.meshCert.rate}%` : '点击应用内秒开检阅'}</div>
        </div>
        <button class="btn sm pri" data-act="nb-submit-art" data-p="${p.id}" data-i="${idx}" onclick="event.stopPropagation()">报送阶段复核</button>
      </div>`).join('') || '<div class="dim" style="padding:8px;font-size:11.5px">点击上方编制按钮，产出的正式工作成果将陈列于此（右下角）并可直接检阅或报送阶段复核</div>'}
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
  'nb-at-toggle': () => { S.showAutoTasks = !S.showAutoTasks; hooks.refresh() },
  'nb-cfg-toggle': () => { S.showStudioCfg = !S.showStudioCfg; hooks.refresh() },
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
  'nb-src-all': el => { const all = getRawSourceFiles(S.project).map(f => f.id); S.ctx.fileIds = el?.checked === false ? [] : (S.ctx.fileIds.length >= all.length ? [] : all); hooks.refresh() },
  'nb-q': el => { if ($('#nbChatInput')) { $('#nbChatInput').value = el.dataset.q; ACT['nb-chat-send']() } },
  'nb-chat-send': async () => {
    const v = $('#nbChatInput')?.value?.trim()
    if (!v) return
    $('#nbChatInput').value = ''
    await hooks.send(v, { keepCtx: true })
    hooks.refresh()
  },
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
    if (S.makingStudio) return toast(`⏳ 正在编制「${S.makingStudio}」，请稍候完成后再发起新任务`)
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
  'nb-preview-art': async el => {
    const { p, fp, i } = el.dataset
    const pid = p || S.sel
    const r = await get('nb.artifact.preview', { projectId: pid, fp }).catch(() => null)
    if (!r) return ACT['nb-open-folder']?.(el)
    const m = r.mesh
    const certHtml = m ? `<div class="row" style="padding:8px 16px;background:#0D1F42;border-bottom:1px solid #1E3A8A;font-size:11.5px;gap:8px;flex-wrap:wrap">
      <span class="tag blue">🛡️ Agent×Agent 网状互校签章</span><span>引擎：<b>${esc(m.engine)}</b></span>
      <span>证据分级：A级${m.credibilityDist?.A ?? 0} / B级${m.credibilityDist?.B ?? 0} / C级${m.credibilityDist?.C ?? 0}</span>
      <span>跨源矛盾拦截：<b>${m.conflicts?.length ?? 0}项</b></span>
      <span>数字原文锚定率：<b style="color:#34D399">${m.numCheck?.rate ?? 100}%</b></span>
      <span class="grow"></span>
      <button class="btn sm" data-act="nb-open-folder" data-p="${pid}" data-fp="${esc(fp)}">💻 唤起本机程序精修</button>
      ${i !== undefined ? `<button class="btn sm pri" data-act="nb-submit-art" data-p="${pid}" data-i="${i}">🚀 报送阶段复核</button>` : ''}</div>`
      : `<div class="row" style="padding:8px 16px;background:#0D1F42;border-bottom:1px solid #1E3A8A"><span class="dim" style="font-size:11.5px">已归档至项目专属档案室</span><span class="grow"></span><button class="btn sm" data-act="nb-open-folder" data-p="${pid}" data-fp="${esc(fp)}">💻 唤起本机程序打开</button>${i !== undefined ? `<button class="btn sm pri" data-act="nb-submit-art" data-p="${pid}" data-i="${i}">🚀 报送阶段复核</button>` : ''}</div>`
    let inner = ''
    if (r.kind === 'html') inner = `<iframe id="nbArtFrame" style="width:100%;height:76vh;border:none;background:#fff"></iframe>`
    else if (r.kind === 'pptx') inner = `<div style="padding:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px">${(r.slides || []).map(s => `<div class="box" style="background:#0B162C;border-color:#1E3A8A"><div class="row" style="margin-bottom:6px"><span class="pill st-3">SLIDE ${String(s.page).padStart(2, '0')}</span><b class="ell grow" title="${esc(s.title || '')}">${esc(s.title || '')}</b></div><div class="dim" style="font-size:11.5px;line-height:1.6">${(s.bullets || s.texts || []).slice(0, 8).map(t => `<div>• ${esc(t)}</div>`).join('')}</div></div>`).join('')}</div>`
    else if (r.kind === 'docx') inner = `<div style="padding:22px 32px;max-width:860px;margin:0 auto;line-height:1.75">${(r.paras || []).map(t => `<p style="margin-bottom:8px;${t.length < 36 ? 'font-weight:700;color:#93C5FD;margin-top:14px' : ''}">${esc(t)}</p>`).join('')}</div>`
    else if (r.kind === 'xlsx') inner = `<div style="padding:16px">${(r.sheets || []).map(sh => `<div class="box" style="margin-bottom:14px"><b>📊 工作表：${esc(sh.name)}</b><div style="overflow:auto;margin-top:8px"><table class="tbl"><thead><tr>${(sh.rows[0] || []).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sh.rows.slice(1, 25).map(rw => `<tr>${rw.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`
    else return ACT['nb-open-folder']?.(el)
    drawer(`${drawerHead(`📄 成果全格式直览 · ${esc(r.name)}`, '支持应用内秒开检阅、核对 Agent×Agent 互校质检签章，或一键唤起本机 Office 精修与报送复核')}${certHtml}<div class="body" style="padding:0;height:76vh;overflow:auto">${inner}</div>`, true)
    if (r.kind === 'html' && $('#nbArtFrame')) $('#nbArtFrame').srcdoc = r.content
  },
  'nb-arch-open': async el => {
    const pid = el?.dataset?.p || S.sel || D()?.projects?.[0]?.id
    const st = await get('nb.arch.status', { projectId: pid })
    const m = st.mesh
    drawer(`${drawerHead('🏗️ 可上生产的五层解耦 Agent 架构与网状互校监控台', '模型可换 · 来源可换 · 本地/云端双模部署 · 情报×撰写×蓝军质检网状实时互校 · 权限与回滚留痕')}
      <div class="body">
        <div class="box" style="margin-bottom:12px;background:#0D1F42;border-color:#00D4FF">
          <div class="row"><b>⚡ 五层解耦生产架构实时在线矩阵</b><span class="grow"></span>
            <span class="pill st-4">${st.carbonOnline ? `Carbon 在线 (${esc(st.carbonModel)})` : '混合模型路由在线'}</span>
            <button class="btn sm" data-act="nb-api">切换模型路由</button></div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${st.layers.map(l => `<div class="wcard" style="display:flex;align-items:center;gap:12px;border-left:3px solid #00D4FF"><b style="min-width:195px">${esc(l.layer)}</b><span class="tag blue" style="min-width:210px">${esc(l.tech)}</span><span class="dim grow" style="font-size:11.5px">${esc(l.desc)}</span><span class="dot ok"></span></div>`).join('')}</div>
        </div>
        <div class="box" style="margin-bottom:12px">
          <div class="row"><b>🕸️ Agent × Agent 网状自主互校最近执行实录（情报 × 撰写 × 蓝军质检）</b><span class="grow"></span>
            ${m ? `<span class="tag blue">数字锚定率 ${m.numCheck?.rate ?? 100}% · 耗时 ${(m.elapsedMs / 1000).toFixed(1)}s</span>` : '<span class="dim">编制任意正式成果自动触发互校</span>'}</div>
          ${m ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${(m.dialogs || []).map(d => `<div class="wcard"><div class="row"><span class="tag blue">${esc(d.from)} ➔ ${esc(d.to)}</span><b>${esc(d.action)}</b></div><div class="dim" style="font-size:11.5px;margin-top:4px">${esc(d.msg)}</div></div>`).join('')}</div>`
            : '<div class="dim" style="margin-top:6px;font-size:11.5px">点击右侧「投决备忘录 / 演示文稿 / 尽调报告 / 数据表格」即刻并发启动情报分级、主线撰写与蓝军跨源对质互校。</div>'}
        </div>
        <div class="box">
          <div class="row"><b>🛡️ 工程化底座：四层权限 · 月度配额 · 审计快照回滚</b><span class="grow"></span>
            <span class="pill st-3">配额剩余 ${st.quota?.remainCalls ?? 488} 次 / ¥${st.quota?.remainRMB ?? 196}</span>
            <button class="btn sm ghost" data-act="go" data-view="settings">进入审计与快照回滚中心 ›</button></div>
          <div class="dim" style="margin-top:6px;font-size:11.5px">最近审计留痕：${(st.recentChanges || []).slice(0, 4).map(c => `[v${c.rev}] ${esc(c.reason || c.coll)}`).join(' · ') || '全库状态一致'}</div>
        </div>
      </div>`, true)
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
  'nb-harness-open': async el => {
    const pid = el?.dataset?.p || S.sel
    const draftGoal = $('#nbChatInput')?.value?.trim() || ''
    const st = await get('nb.harness.status', { projectId: pid })
    S.harnessSt = {
      projectId: pid,
      presets: st.presets || [],
      allKinds: st.kinds || [],
      runs: st.runs || [],
      presetId: 'ic_full_pack',
      goal: draftGoal || '围绕已勾选底稿进行红蓝军跨源核验，制作投委会全套上会标准材料包（IC备忘录 + 演示文稿PPT + 深度尽调Word + 对质数据表XLSX）',
      thinkingDepth: 'deep',
      kinds: ['ic_memo', 'ppt', 'word', 'table'],
      pageCount: S.studioCfg?.pageCount || 8,
      targetMB: S.studioCfg?.targetMB || 6,
      withTianyancha: false,
      autoSubmitStage: false,
      plan: st.runs?.[0]?.status === 'planned' ? st.runs[0] : null,
      lastRun: st.runs?.find(r => r.status === 'completed') || null,
      busy: '',
    }
    renderHarnessDrawer()
  },
  'nb-harness-preset': el => {
    if (!S.harnessSt) return
    const pr = S.harnessSt.presets.find(x => x.id === el.value)
    if (pr) {
      S.harnessSt.presetId = pr.id
      S.harnessSt.goal = pr.desc
      S.harnessSt.kinds = [...pr.kinds]
      S.harnessSt.thinkingDepth = pr.thinkingDepth
      renderHarnessDrawer()
    }
  },
  'nb-harness-kind': el => {
    if (!S.harnessSt) return
    const s = new Set(S.harnessSt.kinds)
    el.checked ? s.add(el.dataset.k) : s.delete(el.dataset.k)
    S.harnessSt.kinds = [...s]
  },
  'nb-harness-plan': async () => {
    const h = S.harnessSt
    if (!h) return
    h.goal = $('#nbHGoal')?.value?.trim() || h.goal
    h.thinkingDepth = $('#nbHDepth')?.value || 'deep'
    h.pageCount = Number($('#nbHPages')?.value) || 8
    h.targetMB = Number($('#nbHMB')?.value) || 6
    h.withTianyancha = Boolean($('#nbHTyc')?.checked)
    h.autoSubmitStage = Boolean($('#nbHSub')?.checked)
    if (!h.kinds.length) { toast('请至少勾选 1 项要制作的成果材料', 'warn'); return }
    h.busy = '① 正在执行受控思考：盘点 A/B/C 底稿证据等级、预判红蓝军冲突并规划制作蓝图…'
    renderHarnessDrawer()
    const plan = await act('nb.harness.plan', {
      projectId: h.projectId, goal: h.goal, thinkingDepth: h.thinkingDepth,
      kinds: h.kinds, pageCount: h.pageCount, targetMB: h.targetMB,
      withTianyancha: h.withTianyancha, autoSubmitStage: h.autoSubmitStage,
      fileIds: S.ctx.fileIds,
    }, '🧠 Harness 受控思考蓝图已生成，请审阅各步决策后点击执行制作')
    h.busy = ''
    if (plan) h.plan = plan
    renderHarnessDrawer()
  },
  'nb-harness-run': async () => {
    const h = S.harnessSt
    if (!h) return
    h.goal = $('#nbHGoal')?.value?.trim() || h.goal
    h.thinkingDepth = $('#nbHDepth')?.value || 'deep'
    h.pageCount = Number($('#nbHPages')?.value) || 8
    h.targetMB = Number($('#nbHMB')?.value) || 6
    h.withTianyancha = Boolean($('#nbHTyc')?.checked)
    h.autoSubmitStage = Boolean($('#nbHSub')?.checked)
    if (!h.kinds.length) { toast('请至少勾选 1 项要制作的成果材料', 'warn'); return }
    h.busy = `② Harness 正在调用操作与制作引擎编译 ${h.kinds.length} 份完整材料（含 Agent×Agent 互校与 ZIP/XML 质检自愈）…`
    renderHarnessDrawer()
    const res = await act('nb.harness.run', {
      projectId: h.projectId, planId: h.plan?.id, goal: h.goal, thinkingDepth: h.thinkingDepth,
      kinds: h.kinds, pageCount: h.pageCount, targetMB: h.targetMB,
      withTianyancha: h.withTianyancha, autoSubmitStage: h.autoSubmitStage,
      theme: S.studioCfg?.theme || 'mck', density: S.studioCfg?.density || 'standard',
      fileIds: S.ctx.fileIds,
    })
    h.busy = ''
    if (res) {
      h.lastRun = res
      h.plan = null
      toast(`✅ Harness 受控制作完成：共交付 ${res.artifacts?.length || 0} 份完整材料并通过质检门禁`, 'ok')
      S.project = await get('project', { id: h.projectId })
      hooks.refresh()
      renderHarnessDrawer()
    }
  },
})

document.addEventListener('keydown', e => { if (e.target?.id === 'nbChatInput' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ACT['nb-chat-send']() } })
document.addEventListener('input', e => { const a = e.target?.dataset?.act; if (a?.startsWith('nb-cfg-') && ACT[a]) ACT[a](e.target) })
window.addEventListener('investai:job', e => {
  const j = e.detail
  const node = j?.id && document.querySelector(`#nbCenterChat [data-nbjob="${j.id}"] .md`)
  if (node) node.innerHTML = md(j.text || (j.status === 'running' ? '正在锚定已勾选底稿进行红蓝军交叉研判…' : ''))
})
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

function renderHarnessDrawer() {
  const h = S.harnessSt
  if (!h) return
  const plan = h.plan
  const run = h.lastRun
  drawer(`${drawerHead('🧠 Agentic Harness · 受控思考与成套材料操作执行中枢', '透明思考链规划 · 操作能力调用制作能力（天眼查穿透 × 红蓝军互校 × 9类成品编译 × 解压体积质检自愈 × 阶段报送）')}
    <div class="body">
      ${h.busy ? `<div class="box" style="margin-bottom:10px;border-color:#3B82F6;background:#0F1E3A"><div class="row"><span class="spin"></span><b>${esc(h.busy)}</b></div></div>` : ''}
      <div class="grid2" style="margin-bottom:8px">
        <label class="f">预设成套任务包
          <select class="select" data-act="nb-harness-preset">${h.presets.map(p => `<option value="${p.id}" ${p.id === h.presetId ? 'selected' : ''}>📦 ${esc(p.name)}</option>`).join('')}</select></label>
        <label class="f">思考控制深度（Controllable Thinking）
          <select class="select" id="nbHDepth">
            <option value="deep" ${h.thinkingDepth === 'deep' ? 'selected' : ''}>🔬 Deep · 深度反思 + 红蓝军互校 + 自愈质检</option>
            <option value="balanced" ${h.thinkingDepth === 'balanced' ? 'selected' : ''}>⚖️ Balanced · 标准规划 + 原文数字核对</option>
            <option value="fast" ${h.thinkingDepth === 'fast' ? 'selected' : ''}>⚡ Fast · 规则快速规划直出</option>
          </select></label>
      </div>
      <label class="f" style="margin-bottom:8px">本次制作目标与定制重点（Harness 将据此分配每份材料的叙事重心）
        <textarea class="input area" id="nbHGoal" style="height:62px">${esc(h.goal)}</textarea></label>
      <div class="box" style="margin-bottom:8px">
        <div class="row" style="margin-bottom:6px"><b>🛠️ 勾选需调用的成果制作能力（可多选组合）</b><span class="grow"></span>
          <span class="dim" style="font-size:11.5px">页数/章 <input class="input sm" id="nbHPages" type="number" min="4" max="24" value="${h.pageCount}" style="width:54px;display:inline-block"> · 目标体积 <input class="input sm" id="nbHMB" type="number" min="3" max="35" value="${h.targetMB}" style="width:54px;display:inline-block"> MB</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${h.allKinds.map(k => `<label class="wcard" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 8px">
          <input type="checkbox" data-act="nb-harness-kind" data-k="${k.id}" ${h.kinds.includes(k.id) ? 'checked' : ''}>
          <span style="font-size:12px">${esc(k.label)}</span></label>`).join('')}</div>
        <div class="row" style="margin-top:8px;gap:16px">
          <label class="dim"><input type="checkbox" id="nbHTyc" ${h.withTianyancha ? 'checked' : ''}> 🔍 先调用天眼查七维穿透补齐 A 级商事司法底稿</label>
          <label class="dim"><input type="checkbox" id="nbHSub" ${h.autoSubmitStage ? 'checked' : ''}> 📤 质检达标后自动挂接报送至当前阶段工作项</label>
        </div>
      </div>
      <div class="row" style="margin-bottom:10px;gap:8px">
        <button class="btn" data-act="nb-harness-plan" ${h.busy ? 'disabled' : ''}>① 先生成受控思考蓝图（可审阅）</button>
        <button class="btn pri grow" data-act="nb-harness-run" ${h.busy ? 'disabled' : ''}>▶ ${plan ? '审批通过并按此蓝图制作全套材料' : '一键受控思考并制作全套完整材料'}</button>
      </div>
      ${plan ? `<div class="box" style="margin-bottom:10px;border-color:#60A5FA">
        <div class="row"><b>🧭 已生成的受控思考蓝图（${esc(plan.engine)}）</b><span class="grow"></span>
          <span class="tag blue">A级${plan.sourceSummary?.gradeA || 0} / B级${plan.sourceSummary?.gradeB || 0} / C级${plan.sourceSummary?.gradeC || 0} 底稿</span></div>
        <div style="margin-top:6px;font-size:12px"><b>核心立论：</b>${esc(plan.coreThesis)}</div>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">${(plan.thoughtSteps || []).map(s => `<div class="wcard"><div class="row"><span class="tag blue">${esc(s.phase)}</span><span class="dim" style="font-size:11.5px">➔ ${esc(s.decision)}</span></div><div style="font-size:11.5px;margin-top:3px">${esc(s.thought)}</div></div>`).join('')}</div>
        ${plan.gaps?.length ? `<div class="dim" style="margin-top:6px;font-size:11.5px">⚠️ 识别到的证据缺口：${plan.gaps.map(esc).join('；')}</div>` : ''}
      </div>` : ''}
      ${run ? `<div class="box" style="border-color:#10B981">
        <div class="row"><b>✅ 最近一次成套材料交付与质检报告（耗时 ${(run.elapsedMs / 1000).toFixed(1)}s · 锚定率 ${run.meshSummary?.anchorRate ?? 100}%）</b></div>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">${(run.qualityGate || []).map(q => `<div class="wcard row">
          <span class="pill ${q.passed ? 'st-4' : 'st-2'}">${q.passed ? '✓ 质检通过' : '需复核'}</span>
          <b class="ell grow">${esc(q.name)}</b>
          <span class="dim" style="font-size:11.5px">${esc(q.detail)}</span></div>`).join('')}</div>
        ${run.submissions?.length ? `<div style="margin-top:6px;font-size:11.5px;color:#34D399">📤 已自动报送阶段工作项：${run.submissions.map(s => `${esc(s.workType)}(v${s.version})`).join('、')}</div>` : ''}
      </div>` : ''}
    </div>`, true)
}
