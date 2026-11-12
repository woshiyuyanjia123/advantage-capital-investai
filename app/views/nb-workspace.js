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
  if (/审计|财务|财报|利润|合同|天眼查|工商/.test(name)) return '<span class="tag real sm" title="按文件名推定：审计、合同、工商类">A级</span>'
  if (/商业计划|BP|路演/i.test(name)) return '<span class="tag amber sm" title="按文件名推定：公司自述材料">C级</span>'
  return '<span class="tag sm" title="按文件名推定：访谈与内部纪要">B级</span>'
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
  if (!msgs.length) return `<div class="nb-chat-empty"><h2>${esc(p.name)}</h2><p><span data-src-n>${S.ctx.fileIds.length}</span> 份底稿 · ${esc(p.stage || '')}</p><div class="nb-empty-acts"><button class="btn sm" data-act="nb-q" data-q="逐项比对勾选的公司自述材料和审计、合同、访谈底稿，列出同一指标说法不一致的地方，每条标出处。">核对底稿口径</button><button class="btn sm pri" data-act="nb-harness-open" data-p="${p.id}">成套制作</button></div></div>${follow}`
  return msgs.map((m, i) => {
    if (m.role === 'user') return `<div class="nb-msg me"><div class="bub">${esc(m.text)}</div></div>`
    const job = m.job ? (S.live.get(m.job.id) ?? m.job) : m.jobId ? S.live.get(m.jobId) : null
    const running = job?.status === 'running'
    const text = m.text || job?.text || ''
    return `<div class="nb-msg bot ${m.tone ?? ''}">
      ${text ? `<div class="md">${md(text, job?.cites)}</div>` : ''}
      ${running ? `<div class="nb-typing"><i></i><i></i><i></i><span>${text ? '' : '正在读勾选的底稿'}</span></div>` : ''}
      ${job?.status === 'failed' ? `<div class="bad nb-err">${esc(job.error ?? '')}</div>` : ''}
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
      <textarea id="nbChatInput" rows="1" placeholder="就勾选的底稿提问"></textarea>
      <span class="n"><span data-src-n>${S.ctx.fileIds.length}</span> 份底稿</span>
      <button class="btn sm ghost" data-act="nb-harness-open" data-p="${p.id}" title="把输入框里的话作为要求，成套制作材料">成套制作</button>
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
const studioCfg = () => (S.studioCfg ??= { pageCount: 8, theme: 'mck', density: 'standard' })
const cfgLine = c => `${c.pageCount} 页 · ${Object.fromEntries(THEMES)[c.theme] ?? ''} · ${Object.fromEntries(DENSITY)[c.density] ?? ''}`

/** 成品行：点一下在应用里预览，右边的按钮报送到阶段工作项 */
function artRow(a, idx, p) {
  const miss = a.check?.unmatched ?? []
  const flags = [
    a.engine === '底稿摘编' ? `<span class="tag amber" title="${esc(a.engineNote || '本稿未调用模型，内容为底稿原文摘编')}">底稿摘编</span>` : '',
    miss.length ? `<span class="tag lv3" title="${esc(miss.slice(0, 12).map(u => u.value).join('、'))}">${miss.length} 处数字待核对</span>` : '',
  ].join('')
  return `<div class="nb-art" data-act="nb-preview-art" data-p="${p.id}" data-i="${idx}" data-ext="${esc(a.ext)}" data-fp="${esc(a.fullPath)}" title="预览">
    ${ficon(a.ext, true)}<div class="grow nb-art-tx"><b class="ell">${esc(a.name)}</b>
      <div class="meta ell" title="${esc(a.summary || '')}">${esc(a.summary || `${a.sourceCount || 0} 份底稿`)}</div>
      ${flags ? `<div class="flags">${flags}</div>` : ''}</div>
    <button class="btn sm" data-act="nb-submit-art" data-p="${p.id}" data-i="${idx}">报送</button></div>`
}

function renderRightPane(x, p) {
  const notes = x.notes ?? []
  const arts = x.artifacts?.items ?? []
  const making = S.makingStudio
  const cfg = studioCfg()
  return `<section class="nb-pane nb-right">
    <header class="nb-pane-hd"><b>成果编制</b><span class="n">用 <span data-src-n>${S.ctx.fileIds.length}</span> 份底稿</span><span class="grow"></span>
      <button class="btn sm pri" data-act="nb-harness-open" data-p="${p.id}">成套制作</button>
      <button class="btn sm ghost" data-act="nb-arch-open" data-p="${p.id}">状态</button>
      <button class="btn sm ghost" data-act="nb-dify-open" data-p="${p.id}">模板</button></header>
    <div class="nb-studio">${STUDIO.map(([k, ic, l]) => `<button class="nb-make ${making?.k === k ? 'busy' : ''}" data-act="nb-make" data-p="${p.id}" data-k="${k}" data-l="${l}" ${making ? 'disabled' : ''}>${icon(ic, 18)}<span>${l}</span></button>`).join('')}</div>
    <div class="nb-cfg ${S.showStudioCfg ? 'open' : ''}">
      <button class="nb-cfg-hd" data-act="nb-cfg-toggle"><span>规格</span><b class="grow" data-cfg-sum>${cfgLine(cfg)}</b>${icon('chev', 13)}</button>
      ${S.showStudioCfg ? `<div class="nb-cfg-bd">
        <label>页数或章数 (${cfg.pageCount})<input type="range" min="4" max="24" step="1" value="${cfg.pageCount}" data-act="nb-cfg-pg"></label>
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

// ───────── 天眼查工商核查 ─────────
async function openTyc(pid) {
  const p = S.project?.project
  const meta = await get('nb.tyc.meta').catch(() => ({ dimensions: [] }))
  const dims = meta.dimensions ?? []
  drawer(`${drawerHead('天眼查工商核查', meta.configured ? 'Token 已保存' : '还没有填 Token')}
    <div class="body">
      <div class="nb-bar">
        <input class="input grow" id="nbTycCompany" value="${esc(S.project?.company?.name || p?.company || p?.name || '')}" placeholder="企业全称">
        <input class="input nb-tok" id="nbTycToken" type="password" autocomplete="off" placeholder="${meta.configured ? '已保存，可以留空' : '开放平台 Token'}">
        <button class="btn pri" data-act="nb-tyc-run" data-p="${pid}">${icon('search', 13)}查询并存为底稿</button>
      </div>
      <div class="nb-dims">${dims.map(d => `<div class="${d.live ? '' : 'off'}"><b>${esc(d.name)}</b><span>${d.live ? esc(d.fields) : '还没有接入'}</span></div>`).join('')}</div>
      <div id="nbTycResult"></div>
    </div>`, true)
}

// ───────── 模板 ─────────
function renderDifyDrawer() {
  const st = S.difySt
  if (!st) return
  const cur = st.tpls.find(t => t.id === st.curId) || st.tpls[0] || {}
  const q = st.quota || {}
  drawer(`${drawerHead('模板', q.limitCalls != null ? `本月已用 ${q.usedCalls} 次，上限 ${q.limitCalls} 次` : '')}
    <div class="body nb-fields">
      <label class="f">模板<select class="select" data-act-change="nb-dify-tpl">${st.tpls.map(t => `<option value="${esc(t.id)}" ${t.id === st.curId ? 'selected' : ''}>${esc(t.name)} · ${esc(t.category || '')}${t.usageCount ? ` · 用过 ${t.usageCount} 次` : ''}</option>`).join('')}</select></label>
      ${cur.desc ? `<p class="nb-tpl-desc">${esc(cur.desc)}</p>` : ''}
      ${cur.targetKind === 'table' ? '' : `<label class="f">编制要求<textarea class="input area" id="nbDifyBrief" spellcheck="false">${esc(st.brief)}</textarea></label>`}
      <div class="row"><label class="nb-check"><input type="checkbox" class="ck" id="nbDifyAutoSub" ${st.autoSub === false ? '' : 'checked'}>生成后报送到当前阶段</label><span class="grow"></span>
        <button class="btn pri" data-act="nb-dify-run" ${st.running ? 'disabled' : ''}>${st.running ? '<span class="spin"></span>' : icon('play', 13)}生成</button></div>
      ${st.trace ? `<ol class="nb-nodes nb-trace">${st.trace.map((t, i) => `<li class="${t.status === 'succeeded' ? 'done' : ''}"><span class="no">${no2(i)}</span><span>${esc(t.node)}</span><span class="grow ms">${esc(t.detail || '')}</span></li>`).join('')}</ol>` : ''}
    </div>`, true)
}

// ───────── 交叉核对结果、成套制作 ─────────
function meshHTML(m) {
  if (!m?.engine) return `<p class="dim">${esc(m?.note || '没有调用模型')}</p>`
  const c = m.numCheck
  return `<div class="nb-mesh">
    <div class="meta">${esc(m.engine)}${m.elapsedMs ? ` · ${(m.elapsedMs / 1000).toFixed(1)} 秒` : ''}${c?.total ? ` · 结论里 ${c.total} 处数字，${c.unmatched.length ? `${c.unmatched.length} 处在底稿里没找到（${esc(c.unmatched.map(u => u.value).join('、'))}）` : '都能在底稿里找到'}` : ''}</div>
    ${m.thesis ? `<p>${esc(m.thesis)}</p>` : ''}
    ${m.conflicts?.length ? `<div class="tbl"><table><thead><tr><th>事项</th><th>公司自述</th><th>审计、合同、访谈</th><th>影响</th></tr></thead><tbody>${m.conflicts.map(x => `<tr><td>${esc(x.topic)}</td><td>${esc(x.bpClaim)}</td><td>${esc(x.auditFact)}</td><td>${esc(x.impact)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dim">没有发现不同底稿之间说法不一致的地方。</p>'}
    ${m.redFlags?.length ? `<ul>${m.redFlags.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${m.note ? `<p class="dim">${esc(m.note)}</p>` : ''}</div>`
}

function readHarnessForm() {
  const h = S.harnessSt
  if (!h) return
  if ($('#nbHGoal')) h.goal = $('#nbHGoal').value.trim()
  if ($('#nbHDepth')) h.thinkingDepth = $('#nbHDepth').value
  if ($('#nbHPages')) h.pageCount = Math.max(4, Math.min(24, Number($('#nbHPages').value) || 8))
  if ($('#nbHTyc')) h.withTianyancha = $('#nbHTyc').checked
  if ($('#nbHSub')) h.autoSubmitStage = $('#nbHSub').checked
}

async function harnessGo(run) {
  const h = S.harnessSt
  if (!h || h.busy) return
  readHarnessForm()
  if (!h.kinds.length) return toast('先勾选要制作的材料', 'warn')
  const body = { projectId: h.projectId, presetId: h.presetId, goal: h.goal, thinkingDepth: h.thinkingDepth, kinds: h.kinds, pageCount: h.pageCount, withTianyancha: h.withTianyancha, autoSubmitStage: h.autoSubmitStage, theme: studioCfg().theme, density: studioCfg().density, fileIds: S.ctx.fileIds }
  // 出方案之后又改了深度、要求或天眼查选项，方案就不作数了，执行时重新出
  const fit = h.plan && h.plan.thinkingDepth === h.thinkingDepth && (h.plan.userGoal || '') === h.goal && !!h.plan.specs?.withTianyancha === h.withTianyancha
  h.busy = run ? `正在制作 ${h.kinds.length} 份材料` : '正在读底稿、出制作方案'
  renderHarnessDrawer()
  const res = await act(run ? 'nb.harness.run' : 'nb.harness.plan', run && fit ? { ...body, planId: h.plan.id } : body)
  h.busy = ''
  if (res && run) {
    h.lastRun = res
    h.plan = null
    const all = res.qualityGate?.length ?? 0
    const ok = res.qualityGate?.filter(q => q.passed).length ?? 0
    toast(`做完了：${all} 份材料，${ok} 份通过质检`, ok === all ? 'ok' : 'warn')
    S.project = await get('project', { id: h.projectId })
    hooks.refresh()
  } else if (res) h.plan = res
  renderHarnessDrawer()
}

const planHTML = plan => {
  const s = plan.sourceSummary ?? {}
  const focus = (plan.steps ?? []).filter(x => x.type === 'produce' && x.directive)
  return `<div class="sec">制作方案<span class="lnk">${plan.engine ? esc(plan.engine) : '没有调用模型'}</span></div>
  <div class="box nb-plan">
    <div class="meta">${s.totalDocs ?? 0} 份底稿：A 级 ${s.gradeA ?? 0}、B 级 ${s.gradeB ?? 0}、C 级 ${s.gradeC ?? 0} · 表格 ${s.tables ?? 0} 张 · 条目 ${s.passages ?? 0} 条</div>
    ${plan.coreThesis ? `<p class="thesis">${esc(plan.coreThesis)}</p>` : ''}
    <ol class="nb-think">${(plan.thoughtSteps ?? []).map(t => `<li><b>${esc(t.phase)}</b><span>${esc(t.thought)}</span><i>${esc(t.decision)}</i></li>`).join('')}</ol>
    ${focus.length ? `<div class="sub">每份材料的侧重</div>${focus.map(x => `<p><b>${esc(String(x.label).replace(/^制作/, ''))}</b>　${esc(x.directive)}</p>`).join('')}` : ''}
    ${plan.gaps?.length ? `<div class="sub">${plan.engine ? '底稿里缺的信息' : '底稿里标为待核实的事项'}</div><ul>${plan.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    ${plan.check?.unmatched?.length ? `<p class="dim">方案里有 ${plan.check.unmatched.length} 处数字在底稿里没找到：${esc(plan.check.unmatched.map(u => u.value).join('、'))}</p>` : ''}
  </div>`
}

const STEP_TAG = { done: '<span class="tag real">完成</span>', warn: '<span class="tag amber">需复核</span>', skipped: '<span class="tag">跳过</span>' }
const runHTML = run => `<div class="sec">最近一次制作<span class="lnk">${run.completedAt ? new Date(run.completedAt).toLocaleString('zh-CN') : ''} · 用时 ${Math.round((run.elapsedMs || 0) / 1000)} 秒</span></div>
  <div class="box nb-run">
    ${run.numberSummary?.line ? `<div class="meta">${esc(run.numberSummary.line)}</div>` : ''}
    ${(run.steps ?? []).map(s => `<div class="st">${STEP_TAG[s.status] ?? '<span class="tag">未执行</span>'}<b>${esc(s.label)}</b><span>${esc(s.detail || '')}</span></div>`).join('')}
    ${run.meshSummary?.engine ? `<div class="sub">交叉核对</div>${meshHTML(run.meshSummary)}` : ''}
  </div>`

function renderHarnessDrawer() {
  const h = S.harnessSt
  if (!h) return
  drawer(`${drawerHead('成套制作', '先出制作方案，看过再执行')}
    <div class="body nb-fields nb-h">
      ${h.busy ? `<div class="nb-h-busy"><span class="spin"></span>${esc(h.busy)}</div>` : ''}
      <div class="nb-h-grid">
        <label class="f">材料组合<select class="select" data-act-change="nb-harness-preset">${h.presets.map(p => `<option value="${esc(p.id)}" ${p.id === h.presetId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="f">思考深度<select class="select" id="nbHDepth">${h.depths.map(d => `<option value="${esc(d.id)}" ${d.id === h.thinkingDepth ? 'selected' : ''}>${esc(d.label)}：${esc(d.desc)}</option>`).join('')}</select></label>
      </div>
      <div class="nb-kinds">${h.allKinds.map(k => `<label class="nb-check"><input type="checkbox" class="ck" data-act="nb-harness-kind" data-k="${esc(k.id)}" ${h.kinds.includes(k.id) ? 'checked' : ''}>${esc(k.label)}</label>`).join('')}</div>
      <label class="f">这次的要求<textarea class="input area" id="nbHGoal" placeholder="例如：重点核对收入确认口径和毛利率">${esc(h.goal)}</textarea></label>
      <div class="nb-h-opts">
        <label class="nb-check">页数或章数<input class="input sm" id="nbHPages" type="number" min="4" max="24" value="${h.pageCount}"></label>
        <label class="nb-check"><input type="checkbox" class="ck" id="nbHTyc" ${h.withTianyancha ? 'checked' : ''}>先做天眼查工商核查</label>
        <label class="nb-check"><input type="checkbox" class="ck" id="nbHSub" ${h.autoSubmitStage ? 'checked' : ''}>合格的成品报送到当前阶段</label>
      </div>
      <div class="nb-h-acts">
        <button class="btn" data-act="nb-harness-plan" ${h.busy ? 'disabled' : ''}>出方案</button>
        <button class="btn pri grow" data-act="nb-harness-run" ${h.busy ? 'disabled' : ''}>${icon('play', 13)}${h.plan ? '按方案制作' : '直接制作'}</button>
      </div>
      ${h.plan ? planHTML(h.plan) : ''}
      ${h.lastRun ? runHTML(h.lastRun) : ''}
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
  'nb-cfg-theme': el => { studioCfg().theme = el.value || 'mck'; syncCfg() },
  'nb-cfg-den': el => { studioCfg().density = el.value || 'standard'; syncCfg() },
  'nb-make': async el => {
    const k = el.dataset.k
    const pid = el.dataset.p || S.sel
    const cfg = studioCfg()
    S.makingStudio = { k, label: el.dataset.l || '' }
    hooks.refresh()
    const r = await act('nb.studio.make', { projectId: pid, kind: k, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, theme: cfg.theme, density: cfg.density })
    S.makingStudio = null
    if (r) {
      toast(`已生成「${r.name}」：${r.summary || ''}`, r.engine === '底稿摘编' ? 'info' : 'ok')
      S.project = await get('project', { id: pid })
    }
    hooks.refresh()
  },
  'nb-preview-art': async el => {
    const { p, fp, i } = el.dataset
    const pid = p || S.sel
    const r = await get('nb.artifact.preview', { projectId: pid, fp }).catch(() => null)
    if (!r) return ACT['nb-open-folder']?.(el)
    const a = r.artifact ?? {}
    const miss = a.check?.unmatched ?? []
    const bar = `<div class="nb-pv-bar"><span class="grow ell" title="${esc(a.summary || '')}">${esc(a.summary || '')}</span>
      ${miss.length ? `<span class="tag lv3" title="${esc(miss.slice(0, 12).map(u => `${u.value}：${u.context}`).join('\n'))}">${miss.length} 处数字待核对</span>` : ''}
      <button class="btn sm" data-act="nb-open-folder" data-p="${pid}" data-fp="${esc(fp)}">用本机程序打开</button>
      ${i !== undefined ? `<button class="btn sm pri" data-act="nb-submit-art" data-p="${pid}" data-i="${i}">报送</button>` : ''}</div>`
    let inner = ''
    if (r.kind === 'html') inner = '<iframe id="nbArtFrame" class="nb-pv-frame" sandbox="allow-same-origin"></iframe>'
    else if (r.kind === 'pptx') inner = `<div class="nb-pv-slides">${(r.slides || []).map((s, k) => `<div class="box"><div class="hd"><span class="no">${no2(k)}</span><b title="${esc(s.title || '')}">${esc(s.title || '')}</b></div>${(s.bullets || []).slice(0, 10).map(t => `<p>${esc(t)}</p>`).join('')}</div>`).join('')}</div>`
    else if (r.kind === 'docx') inner = `<div class="nb-pv-doc">${(r.paras || []).map(t => `<p class="${t.length < 30 && !/[。；，：]$/.test(t) ? 'h' : ''}">${esc(t)}</p>`).join('')}</div>`
    else if (r.kind === 'xlsx') inner = `<div class="nb-pv-sheets">${(r.sheets || []).map(sh => `<div class="sec">${esc(sh.name)}</div><div class="tbl"><table><thead><tr>${(sh.rows[0] || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${sh.rows.slice(1, 40).map(rw => `<tr>${rw.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>`
    else return ACT['nb-open-folder']?.(el)
    drawer(`${drawerHead(esc(r.name))}${bar}<div class="body nb-pv">${inner}</div>`, true)
    if (r.kind === 'html' && $('#nbArtFrame')) $('#nbArtFrame').srcdoc = r.content
  },
  'nb-arch-open': async el => {
    const pid = el?.dataset?.p || S.sel || D()?.projects?.[0]?.id
    const st = await get('nb.arch.status', { projectId: pid }).catch(e => { toast(e.message, 'deny'); return null })
    if (!st) return
    drawer(`${drawerHead('运行状态')}
      <div class="body">
        <div class="nb-layers">${st.layers.map(l => `<div><span class="dot ${l.ok ? 'ok' : 'warn'}"></span><b>${esc(l.layer)}</b><span class="t">${esc(l.tech)}</span><span class="d">${esc(l.desc)}</span></div>`).join('')}</div>
        <div class="row"><button class="btn sm" data-act="nb-api">模型连接</button><span class="grow"></span><span class="dim">本月按模板生成 ${st.quota?.usedCalls ?? 0} 次，上限 ${st.quota?.limitCalls ?? 0} 次</span></div>
        <div class="sec">最近一次交叉核对</div>
        ${st.mesh ? meshHTML(st.mesh) : '<p class="dim">还没有做过。成套制作选“深入”时会做。</p>'}
        <div class="sec">最近的变更</div>
        <div class="nb-changes">${(st.recentChanges || []).slice(0, 8).map(c => `<div>${esc(c.reason || c.coll || '')}</div>`).join('') || '<p class="dim">还没有变更记录</p>'}</div>
      </div>`, true)
  },
  'nb-harness-open': async el => {
    const pid = el?.dataset?.p || S.sel || D()?.projects?.[0]?.id
    const typed = $('#nbChatInput')?.value?.trim() || ''
    const st = await get('nb.harness.status', { projectId: pid }).catch(e => { toast(e.message, 'deny'); return null })
    if (!st) return
    const pr = st.presets?.[0]
    S.harnessSt = {
      projectId: pid, presets: st.presets || [], depths: st.depths || [], allKinds: st.kinds || [],
      presetId: pr?.id ?? '', goal: typed, thinkingDepth: pr?.thinkingDepth ?? 'balanced', kinds: [...(pr?.kinds ?? ['ppt'])],
      pageCount: studioCfg().pageCount || 8, withTianyancha: false, autoSubmitStage: false,
      plan: st.runs?.[0]?.status === 'planned' ? st.runs[0] : null,
      lastRun: st.runs?.find(r => r.status === 'completed') || null,
      busy: '',
    }
    renderHarnessDrawer()
  },
  'nb-harness-preset': el => {
    const h = S.harnessSt
    const pr = h?.presets.find(x => x.id === el.value)
    if (!pr) return
    readHarnessForm()
    Object.assign(h, { presetId: pr.id, kinds: [...pr.kinds], thinkingDepth: pr.thinkingDepth, plan: null })
    renderHarnessDrawer()
  },
  'nb-harness-kind': el => {
    const h = S.harnessSt
    if (!h) return
    const s = new Set(h.kinds)
    el.checked ? s.add(el.dataset.k) : s.delete(el.dataset.k)
    h.kinds = [...s]
  },
  'nb-harness-plan': () => harnessGo(false),
  'nb-harness-run': () => harnessGo(true),
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
    toast(`已存为底稿《${r.file.name}》并勾选`, 'ok')
    if ($('#nbTycResult')) $('#nbTycResult').innerHTML = `<div class="sec">${esc(r.mode || '查询结果')}</div><div class="box"><div class="md">${md(r.markdown || '')}</div></div>`
    S.project = await get('project', { id: pid })
    hooks.refresh()
  },
  'nb-dify-open': async el => {
    const pid = el.dataset.p || S.sel
    const data = await get('nb.dify.templates', { projectId: pid }).catch(e => { toast(e.message, 'deny'); return null })
    if (!data) return
    S.difySt = { pid, tpls: data.templates || [], quota: data.quota, perms: data.permissions, curId: data.templates?.[0]?.id, brief: data.sampleYaml || '', trace: null }
    renderDifyDrawer()
  },
  'nb-dify-tpl': async el => {
    const pid = S.difySt?.pid || S.sel
    const data = await get('nb.dify.templates', { projectId: pid, tplId: el.value }).catch(e => { toast(e.message, 'deny'); return null })
    if (!data) return
    S.difySt = { ...S.difySt, autoSub: $('#nbDifyAutoSub')?.checked, curId: el.value, quota: data.quota, perms: data.permissions, brief: data.sampleYaml || '', trace: null }
    renderDifyDrawer()
  },
  'nb-dify-run': async () => {
    const st = S.difySt
    if (!st) return
    const cfg = studioCfg()
    const body = { projectId: st.pid, workflowId: st.curId, brief: $('#nbDifyBrief')?.value ?? st.brief, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, theme: cfg.theme, density: cfg.density, autoSubmit: !!$('#nbDifyAutoSub')?.checked }
    st.brief = body.brief
    st.autoSub = body.autoSubmit
    st.running = true
    renderDifyDrawer()
    const r = await act('nb.dify.run', body)
    st.running = false
    if (r) {
      st.trace = r.trace
      if (r.gov) { st.quota = r.gov.quota; st.tpls = r.gov.templates }
      toast(`已生成《${r.artifact.name}》${r.submission ? `，报送到「${r.submission.workType}」v${r.submission.version}` : ''}`, 'ok')
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
})

VIEWS.notebook = renderNbWorkspace
