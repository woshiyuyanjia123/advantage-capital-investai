// 尽调与研判工作台（三栏）：左栏上方是三个修订工具，下面是底稿；中栏是阶段进度和问答；右栏是成果编制、已编制成果和尽调纪要
import { S, D, ACT, VIEWS, hooks, $, $$, esc, md, icon, get, act, toast, ficon, menuAt, mi, drawer, drawerHead, opts, firstPaint, entered } from '/api/investai?asset=ui.js'

/** 左栏只列原始底稿：工作区里的成果版本、「Studio成品」文件夹里生成的成品不算底稿 */
function rawSources(x) {
  const all = x?.files ?? []
  const raw = all.filter(f => f.mountId !== 'm_ws' && !String(f.rel || '').includes('/Studio成品/') && !/^(项目信息表|尽调报告|立项报告|尽调清单|NDA)-v\d+\./i.test(f.name))
  return raw.length ? raw : all
}
/** 换了项目或一份都没勾时，默认勾上全部底稿 */
function defaultChecks(x) {
  const raw = rawSources(x)
  if (raw.length && !raw.some(f => S.ctx.fileIds.includes(f.id))) S.ctx.fileIds = raw.map(f => f.id)
  return raw
}

async function loadNbProject() {
  if (!S.sel) S.sel = D()?.projects?.[0]?.id
  if (!S.sel) return
  S.project = await get('project', { id: S.sel }).catch(e => ({ error: e.message }))
  defaultChecks(S.project)
  if (S.view === 'notebook') renderNbWorkspace($('#view'))
  hooks.renderAI?.()
}

const no2 = i => String(i + 1).padStart(2, '0')

export function renderNbWorkspace(v) {
  if (!S.project || S.project.project?.id !== S.sel) {
    v.innerHTML = '<div class="nb-loading"><span class="spin"></span></div>'
    loadNbProject()
    return
  }
  const x = S.project
  if (x.error) { v.innerHTML = `<div class="page"><div class="empty">${esc(x.error)}</div></div>`; return }
  const p = x.project
  const raw = defaultChecks(x)
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const fresh = firstPaint(`ws:${p.id}`)
  // 整页重画时保留滚动位置和没发出去的输入
  const keep = Object.fromEntries($$('[data-keep]', v).map(el => [el.dataset.keep, el.scrollTop]))
  const draft = $('#nbChatInput')?.value ?? ''
  v.innerHTML = `<div class="nb-ws ${fresh ? 'enter' : ''}">
    ${renderLeftPane(raw, p)}
    ${renderCenterPane(x, p, f)}
    ${renderRightPane(x, p)}
  </div>`
  for (const el of $$('[data-keep]', v)) el.scrollTop = keep[el.dataset.keep] ?? (el.dataset.keep === 'chat' ? el.scrollHeight : 0)
  if (draft && $('#nbChatInput')) $('#nbChatInput').value = draft
  if (fresh) entered(v)
}

// 左上方的三个修订工具：在抽屉里逐页或逐句修改，也可以用本机 Office/WPS 打开
const LOCAL_TOOLS = [
  ['nb-studio-ppt', 'slides', '路演 PPT'],
  ['nb-studio-word', 'doc', '尽调文书'],
  ['nb-studio-audio', 'mic', '访谈录音'],
]

function sourceCredBadge(name = '') {
  if (/审计|财务|财报|利润|合同|天眼查|工商/.test(name)) return '<span class="tag ok" style="font-size:10px;padding:1px 5px" title="A级强公信证据：审计/财务/合同/工商底稿">A级</span>'
  if (/商业计划|BP|路演/i.test(name)) return '<span class="tag amber" style="font-size:10px;padding:1px 5px" title="C级管理层自述：需与A级审计/工商底稿交叉核实">C级</span>'
  return '<span class="tag blue" style="font-size:10px;padding:1px 5px" title="B级尽调访谈与内部纪要">B级</span>'
}

function renderLeftPane(raw, p) {
  const checked = new Set(S.ctx.fileIds)
  const n = raw.filter(f => checked.has(f.id)).length
  return `<section class="nb-pane nb-left">
    <div class="nb-tools">${LOCAL_TOOLS.map(([actName, ic, label]) => `<button class="nb-tool" data-act="${actName}" data-p="${p.id}">${icon(ic, 19)}<span>${label}</span></button>`).join('')}</div>
    <header class="nb-pane-hd"><b>底稿</b><span class="n">${raw.length}</span><span class="grow"></span>
      <label class="nb-all"><input type="checkbox" class="ck" data-act="nb-src-all" ${n && n === raw.length ? 'checked' : ''}>全选</label>
      <button class="btn sm ghost" data-act="nb-tyc-open" data-p="${p.id}">天眼查</button>
      <button class="btn sm ghost ico" data-act="proj-upload" title="上传底稿">${icon('plus', 14)}</button></header>
    <div class="nb-src-list" data-keep="src">${raw.map(f => `<label class="nb-src ${checked.has(f.id) ? 'on' : ''}">
      <input type="checkbox" class="ck" data-act="nb-src-ck" data-id="${f.id}" ${checked.has(f.id) ? 'checked' : ''}>
      ${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>${sourceCredBadge(f.name)}
      <button class="nb-src-open" data-act="file" data-id="${f.id}" title="预览">${icon('open', 13)}</button></label>`).join('')
      || `<button class="nb-empty-add" data-act="proj-upload">${icon('plus', 16)}<span>上传底稿</span></button>`}</div>
  </section>`
}

function chatHTML(x, p) {
  const offset = Math.max(0, S.chat.length - 24)
  const msgs = S.chat.slice(offset)
  const follow = (x.followUps ?? []).length ? `<div class="nb-follows">${x.followUps.map(q => `<button class="nb-follow" data-act="nb-q" data-q="${esc(q)}"><span class="grow">${esc(q)}</span>${icon('right', 13)}</button>`).join('')}</div>` : ''
  if (!msgs.length) return `<div class="nb-chat-empty"><h2>${esc(p.name)}</h2><p><span data-src-n>${S.ctx.fileIds.length}</span> 份底稿 · ${esc(p.stage || '')}</p><div class="row" style="margin-top:12px;gap:8px"><button class="btn sm pri" data-act="nb-q" data-q="请以红蓝军对质视角，逐项比对当前勾选的 C级商业计划书(BP) 与 A级财务报表/合同/尽调访谈底稿，列出所有口径背离、过度承诺与潜在 Deal-breaker 致命风险，并标注 [n] 出处。">${icon('shield', 13)}红蓝军跨源对质</button><button class="btn sm" data-act="nb-harness-open" data-p="${p.id}">${icon('spark', 13)}Harness 受控成套制作</button></div></div>${follow}`
  return msgs.map((m, i) => {
    if (m.role === 'user') return `<div class="nb-msg me"><div class="bub">${esc(m.text)}</div></div>`
    const job = m.job ? (S.live.get(m.job.id) ?? m.job) : m.jobId ? S.live.get(m.jobId) : null
    const running = job?.status === 'running'
    const text = m.text || job?.text || ''
    return `<div class="nb-msg bot ${m.tone ?? ''}">
      ${text ? `<div class="md">${md(text, job?.cites)}</div>` : ''}
      ${running ? `<div class="nb-typing"><i></i><i></i><i></i><span>${text ? '' : '正在读勾选的底稿'}</span></div>` : ''}
      ${job?.status === 'failed' ? `<div class="bad" style="font-size:12px">${esc(job.error ?? '')}</div>` : ''}
      ${!running && text && m.tone !== 'deny' ? `<div class="nb-msg-acts">${job?.engine ? `<span class="dim">${esc(job.engine)}</span>` : ''}<button class="btn sm ghost" data-act="nb-save-chatnote" data-p="${p.id}" data-i="${offset + i}">${icon('clip', 12)}存入尽调纪要</button></div>` : ''}</div>`
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
      <button class="btn ghost sm ico" data-act="go" data-view="workbench" title="投研项目总览">${icon('left', 15)}</button>
      <h2 class="ell" title="${esc(p.name)}">${esc(p.name)}</h2><span class="tag blue">${esc(p.stage)}</span>
      <span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">管控看板</button>
      <button class="btn sm pri" data-act="nb-submit-menu" data-p="${p.id}">${icon('upload', 13)}报送</button></header>
    <div class="nb-track">
      <div class="nb-track-pct"><b data-count="${f.overallPct}">${f.overallPct}</b><i>%</i></div>
      <div class="nb-track-segs">${f.stageDetails.map(st => `<button class="nb-seg ${st.state}" data-act="nb-open-board" data-p="${p.id}" data-b="stages" title="${esc(st.name)} ${st.pct}%">
        <span class="bar"><i style="width:${st.pct}%"></i></span><span class="nm ell"><b>${no2(st.index)}</b><span class="t"> ${esc(st.name)}</span></span></button>`).join('')}</div>
    </div>
    <div class="nb-chat" id="nbChat" data-keep="chat">${chatHTML(x, p)}</div>
    <div class="nb-composer"><div class="nb-cbox">
      <textarea id="nbChatInput" rows="1" placeholder="就勾选的底稿提问，或输入目标后点击「受控制作」"></textarea>
      <span class="n"><span data-src-n>${S.ctx.fileIds.length}</span> 份底稿</span>
      <button class="btn sm ghost" data-act="nb-harness-open" data-p="${p.id}" title="由 Harness 受控思考并调用成套材料制作引擎">受控制作</button>
      <button class="send" data-act="nb-chat-send" title="发送（Enter）">${icon('send', 14)}</button></div></div>
  </section>`
}

const STUDIO = [
  ['ic_memo', 'vote', '投决备忘录'],
  ['ppt', 'slides', '演示文稿'],
  ['word', 'doc', '尽调报告'],
  ['table', 'table', '数据表格'],
  ['mindmap', 'mind', '思维导图'],
  ['audio', 'wave', '音频概览'],
  ['video', 'video', '视频概览'],
  ['flashcards', 'cards', '核验闪卡'],
  ['quiz', 'quiz', '答辩测验'],
]
const THEMES = [['mck', '松绿'], ['swiss', '藏青'], ['emerald', '赭石']]
const DENSITY = [['concise', '精简'], ['standard', '标准'], ['dense', '详细']]
const studioCfg = () => (S.studioCfg ??= { pageCount: 8, targetMB: 6, theme: 'mck', density: 'standard' })
const cfgLine = c => `${c.pageCount} 页 · ~${c.targetMB ?? 6}MB · ${Object.fromEntries(THEMES)[c.theme] ?? ''} · ${Object.fromEntries(DENSITY)[c.density] ?? ''}`

/** 成品行：点击在应用内秒开直览（支持 .pptx/.docx/.xlsx/.html），并提供报送阶段复核 */
function artRow(a, idx, p) {
  const miss = a.check?.unmatched ?? []
  const digest = a.engine === '底稿摘编'
  const flags = [
    a.meshCert ? `<span class="tag blue" title="Agent×Agent 三侧互校原文数字锚定率">互校 ${a.meshCert.rate}%</span>` : '',
    digest ? `<span class="tag amber" title="${esc(a.engineNote || '本稿未调用模型，内容为底稿原文摘编')}">底稿摘编</span>` : '',
    miss.length ? `<span class="tag lv3" title="${esc(miss.slice(0, 12).map(u => u.value).join('、'))}">${miss.length} 处数字待核对</span>` : '',
  ].join('')
  return `<div class="nb-art" data-act="nb-preview-art" data-p="${p.id}" data-i="${idx}" data-ext="${esc(a.ext)}" data-fp="${esc(a.fullPath)}" title="应用内秒开检阅（也可唤起本机 Office 精修）">
    ${ficon(a.ext, true)}<div class="grow" style="min-width:0"><b class="ell">${esc(a.name)}</b>
      <div class="meta ell" title="${esc(a.summary || '')}">${esc(a.summary || `${a.sourceCount || 0} 份底稿 · ${(Number(a.bytes || 0) / 1048576).toFixed(2)} MB`)}</div>
      ${flags ? `<div class="flags">${flags}</div>` : ''}</div>
    <button class="btn sm" data-act="nb-submit-art" data-p="${p.id}" data-i="${idx}" onclick="event.stopPropagation()">报送</button></div>`
}

function renderRightPane(x, p) {
  const notes = x.notes ?? []
  const arts = x.artifacts?.items ?? []
  const making = S.makingStudio
  const cfg = studioCfg()
  return `<section class="nb-pane nb-right">
    <header class="nb-pane-hd"><b>成果编制</b><span class="n">用 <span data-src-n>${S.ctx.fileIds.length}</span> 份底稿</span><span class="grow"></span>
      <button class="btn sm pri" data-act="nb-harness-open" data-p="${p.id}" title="Agentic Harness 受控思考与成套材料制作">Harness</button>
      <button class="btn sm ghost" data-act="nb-arch-open" data-p="${p.id}" title="五层解耦架构与 Agent×Agent 互校监控">底座</button>
      <button class="btn sm ghost" data-act="nb-dify-open" data-p="${p.id}">模板</button></header>
    <div class="nb-studio">${STUDIO.map(([k, ic, l]) => `<button class="nb-make ${making?.k === k ? 'busy' : ''}" data-act="nb-make" data-p="${p.id}" data-k="${k}" data-l="${l}" ${making ? 'disabled' : ''}>${icon(ic, 18)}<span>${l}</span></button>`).join('')}</div>
    <div class="nb-cfg ${S.showStudioCfg ? 'open' : ''}">
      <button class="nb-cfg-hd" data-act="nb-cfg-toggle"><span>规格</span><b class="grow" data-cfg-sum>${cfgLine(cfg)}</b>${icon('chev', 13)}</button>
      ${S.showStudioCfg ? `<div class="nb-cfg-bd">
        <label>页数或章数 (${cfg.pageCount})<input type="range" min="4" max="24" step="1" value="${cfg.pageCount}" data-act="nb-cfg-pg"></label>
        <label style="grid-column:1 / -1">目标体积 (~${cfg.targetMB ?? 6} MB)<input type="range" min="3" max="30" step="1" value="${cfg.targetMB ?? 6}" data-act="nb-cfg-mb"></label>
        <label>配色<select class="select sm" data-act-change="nb-cfg-theme">${opts(THEMES, cfg.theme)}</select></label>
        <label>篇幅<select class="select sm" data-act-change="nb-cfg-den">${opts(DENSITY, cfg.density)}</select></label></div>` : ''}
    </div>
    <div class="nb-right-scroll" data-keep="right">
      <header class="nb-pane-hd sticky"><b>工作成果</b><span class="n">${arts.length}</span><span class="grow"></span>
        <button class="btn sm ghost ico" data-act="nb-open-folder" data-p="${p.id}" title="${esc(x.artifacts?.folderPath || '项目档案室')}">${icon('folder', 14)}</button></header>
      ${making ? `<div class="nb-art making"><span class="spin"></span><div class="grow"><b>正在编制${esc(making.label)}</b><div class="meta">用 ${S.ctx.fileIds.length} 份底稿</div></div></div>` : ''}
      ${arts.map((a, idx) => artRow(a, idx, p)).join('') || (making ? '' : '<div class="nb-none">还没有成果</div>')}
      <header class="nb-pane-hd sticky"><b>尽调纪要</b><span class="n">${notes.length}</span><span class="grow"></span>
        <button class="btn sm ghost ico" data-act="nb-note-add" data-p="${p.id}" title="新建纪要">${icon('plus', 14)}</button></header>
      ${notes.map(n => `<button class="nb-note" data-act="nb-open-board" data-p="${p.id}" data-b="${esc(n.board || 'stages')}" data-n="${esc(n.id)}">
        <span class="hd"><b class="ell grow">${esc(n.title)}</b><span class="tag">${esc(n.tag || '纪要')}</span></span>
        ${n.summary ? `<span class="sum">${esc(n.summary)}</span>` : ''}</button>`).join('') || '<div class="nb-none">还没有纪要</div>'}
    </div>
  </section>`
}

/** 勾选变化后只更新数字和行的状态，不整页重画（焦点在复选框上时整页刷新会被跳过）。 */
function syncSources() {
  const n = S.ctx.fileIds.length
  const set = new Set(S.ctx.fileIds)
  for (const el of $$('[data-src-n]')) el.textContent = n
  let on = 0
  for (const ck of $$('.nb-src .ck')) { ck.checked = set.has(ck.dataset.id); ck.closest('.nb-src').classList.toggle('on', ck.checked); if (ck.checked) on++ }
  const all = $('[data-act="nb-src-all"]')
  if (all) all.checked = on > 0 && on === $$('.nb-src .ck').length
}
const syncCfg = () => { for (const el of $$('[data-cfg-sum]')) el.textContent = cfgLine(studioCfg()) }

// ───────── 天眼查穿透 ─────────
async function openTyc(pid) {
  const p = S.project?.project
  const meta = await get('nb.tyc.meta').catch(() => ({ dimensions: [] }))
  const dims = meta.dimensions ?? []
  drawer(`${drawerHead('天眼查穿透', `${dims.length} 个核查维度`)}
    <div class="body">
      <div class="nb-bar">
        <input class="input grow" id="nbTycCompany" value="${esc(S.project?.company?.name || p?.company || p?.name || '')}" placeholder="企业全称或简称">
        <input class="input nb-tok" id="nbTycToken" type="password" autocomplete="off" placeholder="Open API Token，可不填">
        <button class="btn pri" data-act="nb-tyc-run" data-p="${pid}">${icon('search', 13)}查询并存为底稿</button>
      </div>
      <div class="nb-dims">${dims.map(d => `<div><b>${esc(String(d.name).replace(/^\d+\.\s*/, '').replace(/\s*[（(][A-Za-z ]+[）)]$/, ''))}</b><span>${esc(d.fields)}</span></div>`).join('')}</div>
      <div id="nbTycResult"></div>
    </div>`, true)
}

// ───────── 工作流模板 ─────────
function renderDifyDrawer() {
  const st = S.difySt
  if (!st) return
  const cur = st.tpls.find(t => t.id === st.curId) || st.tpls[0] || {}
  const q = st.quota || {}
  const sub = [q.limitCalls != null ? `本月剩余 ${q.remainCalls}/${q.limitCalls} 次` : '', q.monthlyLimitRMB != null ? `¥${q.remainRMB}/¥${q.monthlyLimitRMB}` : '', st.perms?.canToggleModel ? '可管理模型和密钥' : '模型和密钥已锁定'].filter(Boolean).join(' · ')
  drawer(`${drawerHead('工作流模板', esc(sub))}
    <div class="body nb-fields">
      <label class="f">模板<select class="select" data-act-change="nb-dify-tpl">${st.tpls.map(t => `<option value="${esc(t.id)}" ${t.id === st.curId ? 'selected' : ''}>${esc(t.name)} · ${esc(t.category || '')} · 已用 ${t.usageCount ?? 0} 次</option>`).join('')}</select></label>
      <ol class="nb-nodes">${(cur.nodes || []).map((n, i) => {
        const t = st.trace?.[i]
        return `<li class="${t ? 'done' : ''}"><span class="no">${no2(i)}</span><span class="grow">${esc(n)}</span>${t ? `<span class="ms">${t.ms} ms</span>` : ''}</li>`
      }).join('')}</ol>
      ${cur.desc ? `<p class="nb-tpl-desc">${esc(cur.desc)}</p>` : ''}
      <label class="f">编排定义（YAML）<textarea class="input area mono" id="nbDifyYaml" spellcheck="false">${esc(st.yaml)}</textarea></label>
      <div class="row"><label class="nb-check"><input type="checkbox" class="ck" id="nbDifyAutoSub" ${st.autoSub === false ? '' : 'checked'}>执行后报送到当前阶段</label><span class="grow"></span>
        <button class="btn pri" data-act="nb-dify-run" ${st.running ? 'disabled' : ''}>${st.running ? '<span class="spin"></span>' : icon('play', 13)}执行</button></div>
    </div>`, true)
}

Object.assign(ACT, {
  'nb-src-ck': el => { const s = new Set(S.ctx.fileIds); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); S.ctx.fileIds = [...s]; syncSources() },
  'nb-src-all': el => { S.ctx.fileIds = el?.checked === false ? [] : rawSources(S.project).map(f => f.id); syncSources() },
  'nb-q': el => { const box = $('#nbChatInput'); if (box) { box.value = el.dataset.q; ACT['nb-chat-send']() } },
  'nb-chat-send': async () => {
    const box = $('#nbChatInput')
    const v = box?.value?.trim()
    if (!v) return
    box.value = ''
    box.style.height = ''
    // keepCtx：发完不清空勾选；stay：留在工作台，不跳到别的页面
    const pending = hooks.send(v, { keepCtx: true, stay: true })
    paintChat(true)
    await pending
    paintChat(true)
  },
  // 报送菜单：只列当前能用的报送方式
  'nb-submit-menu': el => {
    const x = S.project
    const p = el.dataset.p
    const chk = x?.deliverables?.find(z => z.checkout)
    const rev = x?.deliverables?.find(z => z.status === 'draft' && z.versions?.length)
    const ready = x?.project?.flow?.readinessOk
    menuAt(el, [
      mi('nb-plug-sub', 'AI 辅助起草并报送', { p, ch: 'plugin-draft' }, { ic: 'bot' }),
      mi('nb-plug-upload', '上传正式成果文件', { p }, { ic: 'upload' }),
      chk && mi('nb-plug-sub', `回传本地修订件 · ${chk.type}`, { p, d: chk.id, ch: 'local-checkin' }, { ic: 'check' }),
      rev && mi('nb-plug-sub', `提请复核 · ${rev.type}`, { p, d: rev.id, ch: 'review-submit' }, { ic: 'check' }),
      ready && mi('nb-plug-sub', '提请决策节点表决', { p, ch: 'gate-submit' }, { ic: 'vote' }),
      '<hr>',
      mi('nb-flowboard', '阶段门禁与投决中心', { p }, { ic: 'flow' }),
    ], 240)
  },
  'nb-note-add': async el => {
    const r = await act('nb.note.save', { projectId: el.dataset.p, title: `尽调纪要 ${new Date().toLocaleTimeString('zh-CN')}`, content: '', board: 'tasks' }, '已新建纪要')
    if (r) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-xlsx': el => ACT['nb-open-board']({ dataset: { p: el.dataset.p, b: 'evidence' } }),
  'nb-cfg-toggle': () => { S.showStudioCfg = !S.showStudioCfg; hooks.refresh() },
  'nb-cfg-pg': el => { studioCfg().pageCount = Math.max(4, Math.min(24, Number(el.value) || 8)); syncCfg() },
  'nb-cfg-mb': el => { studioCfg().targetMB = Math.max(3, Math.min(30, Number(el.value) || 6)); syncCfg() },
  'nb-cfg-theme': el => { studioCfg().theme = el.value || 'mck'; syncCfg() },
  'nb-cfg-den': el => { studioCfg().density = el.value || 'standard'; syncCfg() },
  'nb-make': async el => {
    const k = el.dataset.k
    const pid = el.dataset.p || S.sel
    const cfg = studioCfg()
    S.makingStudio = { k, label: el.dataset.l || '' }
    hooks.refresh()
    const r = await act('nb.studio.make', { projectId: pid, kind: k, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, targetMB: cfg.targetMB || 6, theme: cfg.theme, density: cfg.density })
    S.makingStudio = null
    if (r) {
      toast(`已生成「${r.name}」(${(Number(r.bytes || 0) / 1048576).toFixed(2)} MB)：${r.summary || ''}`, r.engine === '底稿摘编' ? 'info' : 'ok')
      S.project = await get('project', { id: pid })
    }
    hooks.refresh()
  },
  'nb-preview-art': async el => {
    const { p, fp, i } = el.dataset
    const pid = p || S.sel
    const r = await get('nb.artifact.preview', { projectId: pid, fp }).catch(() => null)
    if (!r) return ACT['nb-open-folder']?.(el)
    const m = r.mesh
    const certHtml = m ? `<div class="row" style="padding:8px 16px;background:var(--panel);border-bottom:1px solid var(--line);font-size:11.5px;gap:8px;flex-wrap:wrap">
      <span class="tag blue">Agent×Agent 网状互校签章</span><span>引擎：<b>${esc(m.engine)}</b></span>
      <span>证据分级：A级${m.credibilityDist?.A ?? 0} / B级${m.credibilityDist?.B ?? 0} / C级${m.credibilityDist?.C ?? 0}</span>
      <span>跨源矛盾拦截：<b>${m.conflicts?.length ?? 0}项</b></span>
      <span>数字原文锚定率：<b style="color:var(--green)">${m.numCheck?.rate ?? 100}%</b></span>
      <span class="grow"></span>
      <button class="btn sm" data-act="nb-open-folder" data-p="${pid}" data-fp="${esc(fp)}">本机程序精修</button>
      ${i !== undefined ? `<button class="btn sm pri" data-act="nb-submit-art" data-p="${pid}" data-i="${i}">报送阶段复核</button>` : ''}</div>`
      : `<div class="row" style="padding:8px 16px;background:var(--panel);border-bottom:1px solid var(--line)"><span class="dim" style="font-size:11.5px">已归档至项目专属档案室</span><span class="grow"></span><button class="btn sm" data-act="nb-open-folder" data-p="${pid}" data-fp="${esc(fp)}">本机程序打开</button>${i !== undefined ? `<button class="btn sm pri" data-act="nb-submit-art" data-p="${pid}" data-i="${i}">报送阶段复核</button>` : ''}</div>`
    let inner = ''
    if (r.kind === 'html') inner = `<iframe id="nbArtFrame" style="width:100%;height:76vh;border:none;background:#fff"></iframe>`
    else if (r.kind === 'pptx') inner = `<div style="padding:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px">${(r.slides || []).map(s => `<div class="box"><div class="row" style="margin-bottom:6px"><span class="tag blue">SLIDE ${String(s.page).padStart(2, '0')}</span><b class="ell grow" title="${esc(s.title || '')}">${esc(s.title || '')}</b></div><div class="dim" style="font-size:11.5px;line-height:1.6">${(s.bullets || s.texts || []).slice(0, 8).map(t => `<div>• ${esc(t)}</div>`).join('')}</div></div>`).join('')}</div>`
    else if (r.kind === 'docx') inner = `<div style="padding:22px 32px;max-width:860px;margin:0 auto;line-height:1.75">${(r.paras || []).map(t => `<p style="margin-bottom:8px;${t.length < 36 ? 'font-weight:700;margin-top:14px' : ''}">${esc(t)}</p>`).join('')}</div>`
    else if (r.kind === 'xlsx') inner = `<div style="padding:16px">${(r.sheets || []).map(sh => `<div class="box" style="margin-bottom:14px"><b>工作表：${esc(sh.name)}</b><div style="overflow:auto;margin-top:8px"><table class="tbl"><thead><tr>${(sh.rows[0] || []).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sh.rows.slice(1, 25).map(rw => `<tr>${rw.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`
    else return ACT['nb-open-folder']?.(el)
    drawer(`${drawerHead(`成果全格式直览 · ${esc(r.name)}`, '应用内秒开检阅 · Agent×Agent 互校签章 · 本机精修与报送复核')}${certHtml}<div class="body" style="padding:0;height:76vh;overflow:auto">${inner}</div>`, true)
    if (r.kind === 'html' && $('#nbArtFrame')) $('#nbArtFrame').srcdoc = r.content
  },
  'nb-arch-open': async el => {
    const pid = el?.dataset?.p || S.sel || D()?.projects?.[0]?.id
    const st = await get('nb.arch.status', { projectId: pid })
    const m = st.mesh
    drawer(`${drawerHead('五层解耦 Agent 生产架构与网状互校监控台', '模型可换 · 来源可换 · 本地/云端双模部署 · 情报×撰写×蓝军质检网状实时互校 · 权限与回滚留痕')}
      <div class="body">
        <div class="box" style="margin-bottom:12px">
          <div class="row"><b>五层解耦生产架构实时在线矩阵</b><span class="grow"></span>
            <span class="tag ok">${st.carbonOnline ? `Carbon 在线 (${esc(st.carbonModel)})` : '混合模型路由在线'}</span>
            <button class="btn sm" data-act="nb-api">切换模型路由</button></div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${st.layers.map(l => `<div class="wcard" style="display:flex;align-items:center;gap:12px;border-left:3px solid var(--accent)"><b style="min-width:195px">${esc(l.layer)}</b><span class="tag blue" style="min-width:210px">${esc(l.tech)}</span><span class="dim grow" style="font-size:11.5px">${esc(l.desc)}</span><span class="dot ok"></span></div>`).join('')}</div>
        </div>
        <div class="box" style="margin-bottom:12px">
          <div class="row"><b>Agent × Agent 网状自主互校最近执行实录（情报 × 撰写 × 蓝军质检）</b><span class="grow"></span>
            ${m ? `<span class="tag blue">数字锚定率 ${m.numCheck?.rate ?? 100}% · 耗时 ${(m.elapsedMs / 1000).toFixed(1)}s</span>` : '<span class="dim">编制任意正式成果自动触发互校</span>'}</div>
          ${m ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${(m.dialogs || []).map(d => `<div class="wcard"><div class="row"><span class="tag blue">${esc(d.from)} ➔ ${esc(d.to)}</span><b>${esc(d.action)}</b></div><div class="dim" style="font-size:11.5px;margin-top:4px">${esc(d.msg)}</div></div>`).join('')}</div>`
            : '<div class="dim" style="margin-top:6px;font-size:11.5px">点击右侧「投决备忘录 / 演示文稿 / 尽调报告 / 数据表格」或打开 Harness，即刻并发启动情报分级、主线撰写与蓝军跨源对质互校。</div>'}
        </div>
        <div class="box">
          <div class="row"><b>工程化底座：四层权限 · 月度配额 · 审计快照回滚</b><span class="grow"></span>
            <span class="tag">配额剩余 ${st.quota?.remainCalls ?? 488} 次 / ¥${st.quota?.remainRMB ?? 196}</span>
            <button class="btn sm ghost" data-act="go" data-view="settings">审计与快照回滚中心 ›</button></div>
          <div class="dim" style="margin-top:6px;font-size:11.5px">最近审计留痕：${(st.recentChanges || []).slice(0, 4).map(c => `[v${c.rev}] ${esc(c.reason || c.coll)}`).join(' · ') || '全库状态一致'}</div>
        </div>
      </div>`, true)
  },
  'nb-harness-open': async el => {
    const pid = el?.dataset?.p || S.sel || D()?.projects?.[0]?.id
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
      pageCount: studioCfg().pageCount || 8,
      targetMB: studioCfg().targetMB || 6,
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
    }, 'Harness 受控思考蓝图已生成，请审阅各步决策后点击执行制作')
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
      theme: studioCfg().theme || 'mck', density: studioCfg().density || 'standard',
      fileIds: S.ctx.fileIds,
    })
    h.busy = ''
    if (res) {
      h.lastRun = res
      h.plan = null
      toast(`Harness 受控制作完成：共交付 ${res.artifacts?.length || 0} 份完整材料并通过质检门禁`, 'ok')
      S.project = await get('project', { id: h.projectId })
      hooks.refresh()
      renderHarnessDrawer()
    }
  },
  'nb-submit-art': async el => {
    const pid = el.dataset.p || S.sel
    const art = S.project?.artifacts?.items?.[Number(el.dataset.i)]
    if (art) {
      const r = await act('nb.flow.submit', { projectId: pid, artifactPath: art.fullPath, artifactName: art.name, autoSubmitReview: true })
      if (r) toast(`「${art.name}」已报送到工作项「${r.workType}」v${r.version}`, 'ok')
    }
    ACT['nb-flowboard']({ dataset: { p: pid } })
  },
  'nb-save-chatnote': async el => {
    const m = S.chat[Number(el.dataset.i)] ?? S.chat.filter(z => z.role !== 'user').at(-1)
    const job = m?.job ? (S.live.get(m.job.id) ?? m.job) : null
    const r = await act('nb.note.save', { projectId: el.dataset.p || S.sel, title: `问答纪要 ${new Date().toLocaleTimeString('zh-CN')}`, content: m?.text || job?.text || '', board: 'stages' }, '已存入尽调纪要')
    if (r && S.project) { S.project.notes = r; hooks.refresh() }
  },
  'nb-studio-tts': () => {
    const p = S.project?.project
    const txt = `${p?.name || '当前项目'}，当前在${p?.stage || '推进'}阶段，全周期进度百分之${p?.flow?.overallPct ?? p?.progress ?? 0}。`
    if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(txt)); toast('正在用本机语音播报', 'ok') }
    else toast(txt)
  },
  'nb-tyc-open': el => openTyc(el.dataset.p || S.sel),
  'nb-tyc-run': async el => {
    const pid = el.dataset.p || S.sel
    const companyName = $('#nbTycCompany')?.value?.trim()
    if (!companyName) { $('#nbTycCompany')?.focus(); return }
    const apiToken = $('#nbTycToken')?.value?.trim()
    el.disabled = true
    const r = await act('nb.tyc.query', { projectId: pid, companyName, apiToken })
    el.disabled = false
    if (!r?.file) return
    if (!S.ctx.fileIds.includes(r.file.id)) S.ctx.fileIds.push(r.file.id)
    toast(`已生成《${r.file.name}》并勾选为底稿`, 'ok')
    if ($('#nbTycResult')) $('#nbTycResult').innerHTML = `<div class="sec">${esc(r.mode || '查询结果')}</div><div class="box"><div class="md">${md(r.markdown || '')}</div></div>`
    S.project = await get('project', { id: pid })
    hooks.refresh()
  },
  'nb-dify-open': async el => {
    const pid = el.dataset.p || S.sel
    const data = await get('nb.dify.templates', { projectId: pid }).catch(e => { toast(e.message, 'deny'); return null })
    if (!data) return
    S.difySt = { pid, tpls: data.templates || [], quota: data.quota, perms: data.permissions, curId: data.templates?.[0]?.id, yaml: data.sampleYaml || '', trace: null }
    renderDifyDrawer()
  },
  'nb-dify-tpl': async el => {
    const pid = S.difySt?.pid || S.sel
    const data = await get('nb.dify.templates', { projectId: pid, tplId: el.value }).catch(e => { toast(e.message, 'deny'); return null })
    if (!data) return
    S.difySt = { ...S.difySt, autoSub: $('#nbDifyAutoSub')?.checked, curId: el.value, quota: data.quota, perms: data.permissions, yaml: data.sampleYaml || '', trace: null }
    renderDifyDrawer()
  },
  'nb-dify-run': async () => {
    const st = S.difySt
    if (!st) return
    const cfg = studioCfg()
    const body = { projectId: st.pid, workflowId: st.curId, dslYaml: $('#nbDifyYaml')?.value, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, targetMB: cfg.targetMB || 6, theme: cfg.theme, density: cfg.density, autoSubmit: !!$('#nbDifyAutoSub')?.checked }
    st.yaml = body.dslYaml ?? st.yaml
    st.autoSub = body.autoSubmit
    st.running = true
    renderDifyDrawer()
    const r = await act('nb.dify.run', body)
    st.running = false
    if (r) {
      st.trace = r.trace
      if (r.gov) { st.quota = r.gov.quota; st.tpls = r.gov.templates }
      toast(`「${r.workflowName}」已执行，产出《${r.artifact.name}》`, 'ok')
      S.project = await get('project', { id: st.pid })
      hooks.refresh()
    }
    renderDifyDrawer()
  },
})

document.addEventListener('keydown', e => { if (e.target?.id === 'nbChatInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ACT['nb-chat-send']() } })
document.addEventListener('input', e => {
  if (e.target?.id === 'nbChatInput') { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px` }
  // 拖动滑块时跟着改数字，松手前不等 change 事件
  if (e.target?.dataset?.act === 'nb-cfg-pg') ACT['nb-cfg-pg'](e.target)
  if (e.target?.dataset?.act === 'nb-cfg-mb') ACT['nb-cfg-mb'](e.target)
})

function renderHarnessDrawer() {
  const h = S.harnessSt
  if (!h) return
  const plan = h.plan
  const run = h.lastRun
  drawer(`${drawerHead('Agentic Harness · 受控思考与成套材料操作执行中枢', '透明思考链规划 · 操作能力调用制作能力（天眼查穿透 × 红蓝军互校 × 9类成品编译 × 解压体积质检自愈 × 阶段报送）')}
    <div class="body nb-fields">
      ${h.busy ? `<div class="box" style="margin-bottom:10px;border-color:var(--accent)"><div class="row"><span class="spin"></span><b>${esc(h.busy)}</b></div></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        <label class="f">预设成套任务包
          <select class="select" data-act-change="nb-harness-preset">${h.presets.map(p => `<option value="${esc(p.id)}" ${p.id === h.presetId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="f">思考控制深度（Controllable Thinking）
          <select class="select" id="nbHDepth">
            <option value="deep" ${h.thinkingDepth === 'deep' ? 'selected' : ''}>Deep · 深度反思 + 红蓝军互校 + 自愈质检</option>
            <option value="balanced" ${h.thinkingDepth === 'balanced' ? 'selected' : ''}>Balanced · 标准规划 + 原文数字核对</option>
            <option value="fast" ${h.thinkingDepth === 'fast' ? 'selected' : ''}>Fast · 规则快速规划直出</option>
          </select></label>
      </div>
      <label class="f" style="margin-bottom:8px">本次制作目标与定制重点（Harness 据此分配每份材料的叙事重心）
        <textarea class="input area" id="nbHGoal" style="min-height:68px">${esc(h.goal)}</textarea></label>
      <div class="box" style="margin-bottom:8px">
        <div class="row" style="margin-bottom:8px"><b>勾选需调用的成果制作能力（可多选组合）</b><span class="grow"></span>
          <span class="dim" style="font-size:11.5px">页数/章 <input class="input sm" id="nbHPages" type="number" min="4" max="24" value="${h.pageCount}" style="width:54px;display:inline-block"> · 目标体积 <input class="input sm" id="nbHMB" type="number" min="3" max="35" value="${h.targetMB}" style="width:54px;display:inline-block"> MB</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${h.allKinds.map(k => `<label class="wcard" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 8px">
          <input type="checkbox" class="ck" data-act="nb-harness-kind" data-k="${esc(k.id)}" ${h.kinds.includes(k.id) ? 'checked' : ''}>
          <span style="font-size:12px">${esc(k.label)}</span></label>`).join('')}</div>
        <div class="row" style="margin-top:8px;gap:16px;flex-wrap:wrap">
          <label class="nb-check"><input type="checkbox" class="ck" id="nbHTyc" ${h.withTianyancha ? 'checked' : ''}>先调用天眼查七维穿透补齐 A 级商事司法底稿</label>
          <label class="nb-check"><input type="checkbox" class="ck" id="nbHSub" ${h.autoSubmitStage ? 'checked' : ''}>质检达标后自动报送到当前阶段工作项</label>
        </div>
      </div>
      <div class="row" style="margin-bottom:10px;gap:8px">
        <button class="btn" data-act="nb-harness-plan" ${h.busy ? 'disabled' : ''}>① 先生成受控思考蓝图（可审阅）</button>
        <button class="btn pri grow" data-act="nb-harness-run" ${h.busy ? 'disabled' : ''}>${icon('play', 13)} ${plan ? '审批通过并按此蓝图制作全套材料' : '一键受控思考并制作全套完整材料'}</button>
      </div>
      ${plan ? `<div class="box" style="margin-bottom:10px;border-color:var(--accent)">
        <div class="row"><b>已生成的受控思考蓝图（${esc(plan.engine)}）</b><span class="grow"></span>
          <span class="tag blue">A级${plan.sourceSummary?.gradeA || 0} / B级${plan.sourceSummary?.gradeB || 0} / C级${plan.sourceSummary?.gradeC || 0} 底稿</span></div>
        <div style="margin-top:6px;font-size:12px"><b>核心立论：</b>${esc(plan.coreThesis)}</div>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">${(plan.thoughtSteps || []).map(s => `<div class="wcard"><div class="row"><span class="tag blue">${esc(s.phase)}</span><span class="dim" style="font-size:11.5px">➔ ${esc(s.decision)}</span></div><div style="font-size:11.5px;margin-top:3px">${esc(s.thought)}</div></div>`).join('')}</div>
        ${plan.gaps?.length ? `<div class="dim" style="margin-top:6px;font-size:11.5px">识别到的证据缺口：${plan.gaps.map(esc).join('；')}</div>` : ''}
      </div>` : ''}
      ${run ? `<div class="box" style="border-color:var(--green)">
        <div class="row"><b>最近一次成套材料交付与质检报告（耗时 ${(run.elapsedMs / 1000).toFixed(1)}s · 锚定率 ${run.meshSummary?.anchorRate ?? 100}%）</b></div>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">${(run.qualityGate || []).map(q => `<div class="wcard row">
          <span class="tag ${q.passed ? 'ok' : 'amber'}">${q.passed ? '质检通过' : '需复核'}</span>
          <b class="ell grow">${esc(q.name)}</b>
          <span class="dim" style="font-size:11.5px">${esc(q.detail)}</span></div>`).join('')}</div>
        ${run.submissions?.length ? `<div style="margin-top:6px;font-size:11.5px;color:var(--green)">已自动报送阶段工作项：${run.submissions.map(s => `${esc(s.workType)}(v${s.version})`).join('、')}</div>` : ''}
      </div>` : ''}
    </div>`, true)
}

VIEWS.notebook = renderNbWorkspace
