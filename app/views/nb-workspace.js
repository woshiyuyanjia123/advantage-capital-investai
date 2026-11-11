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
      ${ficon(f.ext, true)}<span class="ell grow" title="${esc(f.name)}">${esc(f.name)}</span>
      <button class="nb-src-open" data-act="file" data-id="${f.id}" title="预览">${icon('open', 13)}</button></label>`).join('')
      || `<button class="nb-empty-add" data-act="proj-upload">${icon('plus', 16)}<span>上传底稿</span></button>`}</div>
  </section>`
}

function chatHTML(x, p) {
  const offset = Math.max(0, S.chat.length - 24)
  const msgs = S.chat.slice(offset)
  const follow = (x.followUps ?? []).length ? `<div class="nb-follows">${x.followUps.map(q => `<button class="nb-follow" data-act="nb-q" data-q="${esc(q)}"><span class="grow">${esc(q)}</span>${icon('right', 13)}</button>`).join('')}</div>` : ''
  if (!msgs.length) return `<div class="nb-chat-empty"><h2>${esc(p.name)}</h2><p><span data-src-n>${S.ctx.fileIds.length}</span> 份底稿 · ${esc(p.stage || '')}</p></div>${follow}`
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
      <textarea id="nbChatInput" rows="1" placeholder="就勾选的底稿提问"></textarea>
      <span class="n"><span data-src-n>${S.ctx.fileIds.length}</span> 份底稿</span>
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

/** 成品行：撰写方式和数字核对结果写在第二行；底稿摘编和没对上的数字单独标出来 */
function artRow(a, idx, p) {
  const miss = a.check?.unmatched ?? []
  const digest = a.engine === '底稿摘编'
  const flags = [
    digest ? `<span class="tag amber" title="${esc(a.engineNote || '本稿未调用模型，内容为底稿原文摘编')}">底稿摘编</span>` : '',
    miss.length ? `<span class="tag lv3" title="${esc(miss.slice(0, 12).map(u => u.value).join('、'))}">${miss.length} 处数字待核对</span>` : '',
  ].join('')
  return `<div class="nb-art" data-act="nb-open-folder" data-p="${p.id}" data-fp="${esc(a.fullPath)}" title="用本机程序打开">
    ${ficon(a.ext, true)}<div class="grow" style="min-width:0"><b class="ell">${esc(a.name)}</b>
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
      <button class="btn sm ghost" data-act="nb-dify-open" data-p="${p.id}">模板</button></header>
    <div class="nb-studio">${STUDIO.map(([k, ic, l]) => `<button class="nb-make ${making?.k === k ? 'busy' : ''}" data-act="nb-make" data-p="${p.id}" data-k="${k}" data-l="${l}" ${making ? 'disabled' : ''}>${icon(ic, 18)}<span>${l}</span></button>`).join('')}</div>
    <div class="nb-cfg ${S.showStudioCfg ? 'open' : ''}">
      <button class="nb-cfg-hd" data-act="nb-cfg-toggle"><span>规格</span><b class="grow" data-cfg-sum>${cfgLine(cfg)}</b>${icon('chev', 13)}</button>
      ${S.showStudioCfg ? `<div class="nb-cfg-bd">
        <label>页数或章数<input type="range" min="4" max="24" step="1" value="${cfg.pageCount}" data-act="nb-cfg-pg"></label>
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
    const body = { projectId: st.pid, workflowId: st.curId, dslYaml: $('#nbDifyYaml')?.value, fileIds: S.ctx.fileIds, pageCount: cfg.pageCount, theme: cfg.theme, density: cfg.density, autoSubmit: !!$('#nbDifyAutoSub')?.checked }
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
})
VIEWS.notebook = renderNbWorkspace
