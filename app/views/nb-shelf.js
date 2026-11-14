// 投研项目总览：上方聚合个人待办审批（企业 OA 门户），下方项目全周期进度、带底稿快速立项与阶段成果报送
import { S, D, ACT, VIEWS, hooks, $, $$, esc, icon, get, act, toast, dialog, pick, toB64, can, P_STATUS, due, opts, firstPaint, entered } from '/api/investai?asset=ui.js'

S.nbExpanded ??= null
S.oaOpen ??= true
let justOpened = null
let oaCache = null

const FEATURED = [
  ['var(--violet)', '双轮驱动总纲', '股权投资与产业投资：发现价值、挖掘价值、提升价值', '大科技 · 大健康 · 大生态', { bt: '', q: '' }],
  ['var(--green)', '政府产业投行', '一链两基两中心与六大产业生态招商', '资本招商 · 存量盘活 · 增量招引', { bt: 'industrial', q: '产业' }],
  ['var(--amber)', '财务与法务尽调', '审计报告与 BP 口径冲突排查、三表勾稽', '收入确认 · 客户函证 · 代持还原', { bt: '', stage: '尽职调查' }],
  ['var(--blue)', '投委会立项与投决', 'Pre-IPO 投资建议书与估值敏感性测算', '动态 PE 分位 · 回购条款 · 交割先决条件', { bt: '', stage: '投资决策' }],
  ['var(--red)', '投后赋能与退出', '募集资金监管、经营跟踪与 IPO、并购退出', '预算达成率 · 产业协同 · 回购预警', { bt: '', stage: '投后管理' }],
]

function pickFeaturedTarget(projects, spec) {
  if (!projects.length) return null
  if (spec.stage) return projects.find(p => p.stage === spec.stage && p.status === 'active') ?? projects.find(p => p.stage === spec.stage) ?? null
  if (spec.bt) return projects.find(p => p.businessType === spec.bt && p.status === 'active') ?? projects.find(p => p.businessType === spec.bt) ?? null
  return projects.find(p => p.status === 'active') ?? projects[0]
}

const no2 = i => String(i + 1).padStart(2, '0')

/** 展开区：左边是各阶段的百分比，右边是成果报送入口 */
function renderFlowDrawer(p, fresh) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const chk = p.deliverables?.find(d => d.checkout)
  const rev = p.deliverables?.find(d => d.status === 'draft' && d.v > 0)
  const missing = (f.readinessItems ?? []).filter(i => !i.ok)
  const plug = (cls, actName, data, ic, label) => `<button class="nb-plug-it ${cls}" data-act="${actName}" data-p="${p.id}" ${data}>${icon(ic, 14)}<span class="grow">${label}</span>${icon('right', 13)}</button>`
  return `<div class="nb-flow-drawer ${fresh ? 'fresh' : ''}">
    <div class="nb-fd-main">
      <div class="nb-fd-hd"><span class="nb-lab">阶段进度</span><span class="dim">当前阶段准入 ${f.curStagePct}%</span><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">${icon('folder', 13)}项目档案室</button>
        <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">管控看板</button></div>
      <div class="nb-stages">${f.stageDetails.map(st => `<button class="nb-stage ${st.state}" data-act="nb-open-board" data-p="${p.id}" data-b="stages" title="${esc(st.name)} ${st.pct}%">
        <span class="no">${no2(st.index)}</span><span class="nm">${esc(st.name)}</span>
        <span class="bar"><i style="width:${st.pct}%"></i></span><span class="pc">${st.pct}%</span></button>`).join('')}</div>
      <div class="nb-missing">${f.readinessOk ? '<span class="tag real">必做成果已定稿</span>' : missing.length ? `<span class="dim">待定稿</span>${missing.map(i => `<span class="tag amber">${esc(i.work)}</span>`).join('')}` : ''}</div>
    </div>
    <aside class="nb-plug">
      <div class="nb-fd-hd"><span class="nb-lab">成果报送</span><span class="grow"></span>
        <button class="lnk" data-act="nb-flowboard" data-p="${p.id}">阶段门禁与投决 ›</button></div>
      ${plug('pri', 'nb-plug-sub', 'data-ch="plugin-draft"', 'bot', 'AI 辅助起草并报送')}
      ${plug('', 'nb-plug-upload', '', 'upload', '上传正式成果文件')}
      ${chk ? plug('', 'nb-plug-sub', `data-d="${chk.id}" data-ch="local-checkin"`, 'check', `回传本地修订件 · ${esc(chk.type)}`) : ''}
      ${rev ? plug('', 'nb-plug-sub', `data-d="${rev.id}" data-ch="review-submit"`, 'check', `提请复核 · ${esc(rev.type)}`) : ''}
      ${f.readinessOk ? plug('', 'nb-plug-sub', 'data-ch="gate-submit"', 'vote', '提请决策节点表决') : ''}
      ${f.submissions?.[0] ? `<div class="nb-last ell" title="${esc(f.submissions[0].summary)}">最近报送：${esc(f.submissions[0].summary)}</div>` : ''}
    </aside>
  </div>`
}

function oaInboxHTML(ib) {
  if (!ib) return ''
  if (!ib.total) {
    return `<div class="nb-oa empty-oa"><span class="dot ok"></span><span>我的待办：当前无待表决或待复核积压事项</span><span class="grow"></span><button class="lnk" data-act="enterprise-open">企业开箱配置 ›</button></div>`
  }
  const pills = [
    ib.approvals.length && `<span class="tag amber">待我表决 ${ib.approvals.length}</span>`,
    ib.reviews.length && `<span class="tag blue">待复核定稿 ${ib.reviews.length}</span>`,
    ib.mySteps.length && `<span class="tag real">轮到我推进 ${ib.mySteps.length}</span>`,
    ib.tasks.length && `<span class="tag">待办任务 ${ib.tasks.length}</span>`,
  ].filter(Boolean).join('')
  const items = [
    ...ib.approvals.map(a => `<div class="nb-oa-it"><span class="tag amber sm">表决</span><b class="ell">${esc(a.projectName)}</b><span class="dim ell grow">${esc(a.gateName)}（已投 ${a.votesDone}/${a.votesTotal}）</span><button class="btn sm pri" data-act="nb-flowboard" data-p="${a.projectId}">去表决</button></div>`),
    ...ib.reviews.map(r => `<div class="nb-oa-it"><span class="tag blue sm">复核</span><b class="ell">${esc(r.projectName)}</b><span class="dim ell grow">「${esc(r.type)}」v${r.v} 待定稿</span><button class="btn sm" data-act="nb-flowboard" data-p="${r.projectId}">去审核</button></div>`),
    ...ib.mySteps.slice(0, 5).map(g => `<div class="nb-oa-it"><span class="tag real sm">推进</span><b class="ell">${esc(g.projectName)}</b><span class="dim ell grow">${esc(g.text)}</span><button class="btn sm" data-act="${g.gate ? 'nb-flowboard' : 'nb-enter'}" data-p="${g.projectId}" data-id="${g.projectId}">${g.gate ? '发起表决' : '去工作台'}</button></div>`),
    ...ib.tasks.slice(0, 4).map(t => `<div class="nb-oa-it"><input type="checkbox" class="ck" data-act="oa-task-done" data-id="${t.id}" title="标记完成"><span class="ell grow"><b>${esc(t.title)}</b>${t.projectName ? ` <span class="dim">· ${esc(t.projectName)}</span>` : ''}</span>${due(t.due)}${t.projectId ? `<button class="btn sm ghost" data-act="nb-enter" data-id="${t.projectId}">打开</button>` : ''}</div>`),
  ]
  return `<div class="nb-oa ${S.oaOpen ? 'open' : ''}">
    <div class="nb-oa-hd" data-act="oa-toggle">${icon('bell', 14)}<b>我的待办与审批</b>${pills}<span class="grow"></span>
      <button class="lnk" data-act="oa-filter-mine">${S.filters.mine ? '显示全部项目' : '只看待我处理'}</button>
      <span class="nb-caret">${icon('chev', 14)}</span></div>
    ${S.oaOpen ? `<div class="nb-oa-bd">${items.slice(0, 8).join('')}</div>` : ''}
  </div>`
}

async function refreshOaBar() {
  const ib = await get('nb.oa.inbox').catch(() => null)
  if (!ib) return
  oaCache = ib
  const box = $('#nbOaWrap')
  if (box) box.innerHTML = oaInboxHTML(ib)
}

function listHTML(d) {
  const bt = S.filters.bt || ''
  const q = (S.filters.q || '').trim()
  const mineIds = S.filters.mine && oaCache ? new Set([...oaCache.approvals.map(x => x.projectId), ...oaCache.reviews.map(x => x.projectId), ...oaCache.mySteps.map(x => x.projectId), ...oaCache.tasks.map(x => x.projectId).filter(Boolean)]) : null
  const list = d.projects.filter(p => (!bt || p.businessType === bt) && (!mineIds || mineIds.has(p.id)) && (!q || [p.name, p.company, p.industry].some(x => String(x || '').includes(q))))
  return list.map(p => {
    const exp = S.nbExpanded === p.id
    const f = p.flow
    const pct = f?.overallPct ?? p.progress ?? 0
    const badges = [
      p.myPendingVote ? '<span class="tag amber sm">待我表决</span>' : p.pendingApproval ? '<span class="tag sm">表决中</span>' : '',
      p.reviewCount ? `<span class="tag blue sm">${p.reviewCount} 项待审</span>` : '',
    ].join('')
    return `<article class="nb-row ${exp ? 'open' : ''}" data-act="nb-card-toggle" data-id="${p.id}">
      <div class="nb-row-main">
        <div class="nb-pct"><b data-count="${pct}">${pct}</b><i>%</i></div>
        <div class="nb-row-body">
          <div class="nb-title-row"><h3 class="nb-name ell" title="${esc(p.name)}">${esc(p.name)}</h3>${badges}</div>
          <div class="nb-meta ell"><span class="st">${esc(p.stage || '立项')}</span>${[P_STATUS[p.status] || p.status, p.businessName, p.industry || '综合', p.ownerName && `负责人 ${p.ownerName}`, `成果 ${p.deliverables.length} 份`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
        </div>
        <div class="nb-mini" aria-hidden="true">${(f?.stageDetails ?? []).map(st => `<i class="${st.state}"><b style="width:${st.pct}%"></b></i>`).join('')}</div>
        <button class="btn sm nb-open" data-act="nb-enter" data-id="${p.id}">进入工作台</button>
        <button class="btn sm ghost ico nb-open" data-act="nb-flowboard" data-p="${p.id}" title="阶段门禁与投决中心">${icon('flow', 14)}</button>
        <span class="nb-caret">${icon('chev', 15)}</span>
      </div>
      <div class="nb-row-bar"><i style="width:${pct}%"></i></div>
      ${exp ? renderFlowDrawer(p, justOpened === p.id) : ''}</article>`
  }).join('') || '<div class="empty" style="padding:28px 0">没有符合条件的项目</div>'
}

export function renderNotebookShelf(v) {
  const d = D()
  const bt = S.filters.bt || ''
  const fresh = firstPaint('shelf')
  const active = d.projects.filter(p => p.status === 'active').length
  v.innerHTML = `<div class="nb-shelf ${fresh ? 'enter' : ''}">
    <header class="nb-top"><h1>投研项目总览</h1><span class="nb-top-n">在管 ${active} · 共 ${d.projects.length}</span><span class="grow"></span>
      <label class="nb-find">${icon('search', 14)}<input id="nbShelfQ" placeholder="筛选项目" value="${esc(S.filters.q || '')}" autocomplete="off"></label>
      ${can('project.create') && can('material.upload') ? `<button class="btn" data-act="quick-project" title="选一批 BP/财报文件或粘贴纪要，自动识别要素一步立项入库">${icon('upload', 14)}带材料快速立项</button>` : ''}
      ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}发起项目立项</button>` : ''}</header>
    <section id="nbOaWrap">${oaInboxHTML(oaCache)}</section>
    <section class="nb-feat">${FEATURED.map(([c, org, title, meta], idx) => `<button class="nb-feat-card" style="--c:${c}" data-act="nb-feat-go" data-idx="${idx}">
      <span class="org">${esc(org)}</span><b>${esc(title)}</b><span class="meta">${esc(meta)}</span></button>`).join('')}</section>
    <nav class="rtabs nb-bt">${[['', '全部项目', d.projects.length], ...d.businessTypes.map(b => [b.id, b.name, d.projects.filter(p => p.businessType === b.id).length])].map(([k, l, n]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</nav>
    <div class="nb-list" id="nbList">${listHTML(d)}</div></div>`
  if (fresh) entered(v)
  justOpened = null
  void refreshOaBar()
}

document.addEventListener('input', e => {
  if (e.target?.id !== 'nbShelfQ') return
  S.filters.q = e.target.value
  const box = $('#nbList')
  $('.nb-shelf')?.classList.remove('enter')
  if (box) box.innerHTML = listHTML(D())
})

function guessFromFiles(files = []) {
  const s = files.map(f => f.name.replace(/\.[a-z0-9]+$/i, '')).join(' ')
  const round = (/(种子轮|天使轮|Pre-[AB]\+?|Pre-IPO|[ABCD]\+?轮|战略融资|并购)/i.exec(s) || [])[1] || ''
  const ind = (/(储能|锂电|固态电池|光伏|氢能|半导体|芯片|人工智能|大模型|机器人|具身智能|生物医药|医疗器械|创新药|新材料|航空航天|低空经济|智能制造|新能源汽车|云计算|工业软件)/.exec(s) || [])[1] || ''
  const co = (files[0]?.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/(商业计划书|BP|尽调报告|审计报告|财务报表|访谈纪要|立项报告|路演|材料|底稿|202\d|\d{6,8}|[-_—·()（）【】\[\]])/gi, ' ').trim().split(/\s+/)[0] || ''
  return { co: co.slice(0, 24), proj: co ? `${co}${round ? ` ${round}` : '股权投资'}` : '', ind, round }
}

export async function openQuickProject(initialFiles = []) {
  const d = D()
  let picked = [...initialFiles]
  const g0 = guessFromFiles(picked)
  const paintFiles = () => picked.length ? picked.map((f, i) => `<span class="tag">${esc(f.name)} <button type="button" data-qrm="${i}" style="border:0;background:none;color:inherit;cursor:pointer">×</button></span>`).join(' ') : '<span class="dim">暂未选择本地文件（也可仅粘贴下方沟通速记直接立项）</span>'
  setTimeout(() => {
    const host = $('#modal .dialog')
    if (!host) return
    host.addEventListener('click', async ev => {
      if (ev.target.closest('#qpPickBtn')) {
        const more = await pick({ multiple: true })
        if (!more?.length) return
        picked.push(...more)
        $('#qpFileTags').innerHTML = paintFiles()
        const g = guessFromFiles(picked)
        if (g.proj && !host.querySelector('[name=name]').value.trim()) host.querySelector('[name=name]').value = g.proj
        if (g.co && !host.querySelector('[name=companyName]').value.trim()) host.querySelector('[name=companyName]').value = g.co
        if (g.ind && !host.querySelector('[name=industry]').value.trim()) host.querySelector('[name=industry]').value = g.ind
        if (g.round && !host.querySelector('[name=round]').value.trim()) host.querySelector('[name=round]').value = g.round
      }
      const rm = ev.target.closest('[data-qrm]')
      if (rm) { picked.splice(Number(rm.dataset.qrm), 1); $('#qpFileTags').innerHTML = paintFiles() }
    })
  }, 20)
  const r = await dialog(`<h3>带底稿快速立项</h3><p class="dim">一步完成「建档公司 + 创建项目 + 底稿入库索引」，创建后直接进入尽调工作台并勾选全部底稿。</p>
    <div class="box" style="margin-bottom:10px"><div class="row"><b class="grow">① 项目底稿文件（BP / 审计财报 / 合同 / 访谈录音等）</b><button type="button" class="btn sm" id="qpPickBtn">${icon('upload', 13)}添加本地文件</button></div>
      <div class="chips" id="qpFileTags" style="margin-top:8px">${paintFiles()}</div></div>
    <div class="row"><label class="f grow">业务类型<select class="select" name="businessType">${opts(d.businessTypes.map(b => [b.id, b.name]), 'financial')}</select></label>
      <label class="f grow">项目名称（留空自动按底稿识别）<input class="input" name="name" value="${esc(g0.proj)}" placeholder="如：某科技 B 轮"></label></div>
    <div class="row"><label class="f grow">拟投企业名称<input class="input" name="companyName" value="${esc(g0.co)}" placeholder="自动关联或建档公司库"></label>
      <label class="f grow">所属行业<input class="input" name="industry" value="${esc(g0.ind)}" placeholder="如：半导体 / 储能"></label>
      <label class="f" style="width:120px">融资轮次<input class="input" name="round" value="${esc(g0.round)}" placeholder="如：B轮"></label></div>
    <label class="f">② 粘贴项目亮点 / 微信沟通纪要（可选，将自动存为首份速记底稿）<textarea class="input area" name="pastedText" placeholder="可直接粘贴投资经理初步沟通记录、项目亮点摘要或管理层口径说明…"></textarea></label>
    <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">一键立项并进入工作台</button></div>`, { wide: true })
  if (!r) return
  toast('正在立项并解析底稿入库…')
  const filesPayload = []
  for (const f of picked) {
    if (f.size > 40 * 1024 * 1024) { toast(`${f.name} 超过 40MB 已跳过`, 'warn'); continue }
    filesPayload.push({ name: f.name, data: await toB64(f) })
  }
  const out = await act('nb.project.quick', { ...r, files: filesPayload })
  if (!out) return
  toast(`已创建「${out.projectName}」，同步入库 ${out.uploadedCount} 份底稿`, 'ok')
  await hooks.reload()
  S.sel = out.projectId
  S.project = null
  S.ctx.projId = out.projectId
  S.ctx.fileIds = out.fileIds || []
  hooks.go('notebook', { id: out.projectId })
}
hooks.openQuickProject = openQuickProject

Object.assign(ACT, {
  'oa-toggle': (el, e) => { if (e?.target.closest('button')) return; S.oaOpen = !S.oaOpen; const box = $('#nbOaWrap'); if (box) box.innerHTML = oaInboxHTML(oaCache) },
  'oa-filter-mine': () => { S.filters.mine = !S.filters.mine; const box = $('#nbOaWrap'); if (box) box.innerHTML = oaInboxHTML(oaCache); if ($('#nbList')) $('#nbList').innerHTML = listHTML(D()) },
  'oa-task-done': async el => { await act('task.toggle', { id: el.dataset.id }, '任务已完成'); await hooks.reload({ files: false }); void refreshOaBar() },
  'quick-project': () => openQuickProject(),
  // 页面的 CSP 不允许内联 onclick，所以在这里判断：点在展开区里面不收起
  'nb-card-toggle': (el, e) => {
    if (e?.target.closest('.nb-flow-drawer')) return
    S.nbExpanded = S.nbExpanded === el.dataset.id ? null : el.dataset.id
    justOpened = S.nbExpanded
    const box = $('#nbList')
    $('.nb-shelf')?.classList.remove('enter')
    if (box) { box.innerHTML = listHTML(D()); justOpened = null } else hooks.refresh()
  },
  'nb-open-folder': async el => { const r = await act('nb.folder.open', { projectId: el.dataset.p, filePath: el.dataset.fp }); if (r) toast(`已打开 ${r.opened}`, 'ok') },
  'nb-feat-go': el => {
    const spec = FEATURED[Number(el.dataset.idx)]?.[4] ?? {}
    const target = pickFeaturedTarget(D().projects, spec)
    if (target) { S.sel = target.id; S.project = null; hooks.go('notebook', { id: target.id }); return }
    if (spec.bt !== undefined) S.filters.bt = spec.bt
    if (spec.q !== undefined) S.filters.q = spec.q
    hooks.refresh()
    toast('当前无该专题对应项目，已为你筛选列表', 'warn')
  },
  'nb-enter': el => { S.sel = el.dataset.id; S.project = null; hooks.go('notebook', { id: el.dataset.id }) },
  'nb-plug-sub': async el => {
    el.classList.add('busy')
    const r = await act('nb.plugin.submit', { projectId: el.dataset.p, deliverableId: el.dataset.d, channel: el.dataset.ch, fileIds: S.ctx.fileIds })
    el.classList.remove('busy')
    if (r) { toast(r.summary, 'ok'); if (r.job) hooks.track(r.job); await hooks.reload({ files: false }) }
  },
  'nb-plug-upload': async el => {
    const [f] = await pick({ accept: '.pptx,.docx,.xlsx,.md' })
    if (!f) return
    const r = await act('nb.plugin.submit', { projectId: el.dataset.p, channel: 'file-upload', name: f.name, data: await toB64(f) })
    if (r) { toast(r.summary, 'ok'); await hooks.reload() }
  },
})
VIEWS.workbench = renderNotebookShelf
VIEWS.pipeline = renderNotebookShelf
