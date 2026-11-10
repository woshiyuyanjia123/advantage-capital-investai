// 项目页：一行一个项目，左边是总进度百分比；点一行展开各阶段进度，右边是插件提交
import { S, D, ACT, VIEWS, hooks, $, esc, icon, act, toast, pick, toB64, can, P_STATUS, firstPaint, entered } from '/api/investai?asset=ui.js'

S.nbExpanded ??= null
let justOpened = null

const FEATURED = [
  ['var(--violet)', 'PE/VC 机构方法论', '硬科技与半导体尽调全流程精要', '18 个来源 · 麦肯锡模板'],
  ['var(--green)', '产业并购与资本招商', '地方产业基金招引与返投合规手册', '24 个来源 · 含核验矩阵'],
  ['var(--amber)', '财务与估值核验库', '审计报告 vs BP 多源冲突排查指南', '31 个来源 · 三表勾稽'],
  ['var(--blue)', '投委会 IC 决策范式', '立项会与投决会高通过率汇报拆解', '15 个来源 · Mck 62版式'],
  ['var(--red)', '投后赋能与退出控制', '回购条款触发、对赌复盘与分配闭环', '19 个来源 · 风控标准件'],
]

const no2 = i => String(i + 1).padStart(2, '0')

/** 展开区：左边是各阶段的百分比，右边是提交入口 */
function renderFlowDrawer(p, fresh) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const chk = p.deliverables?.find(d => d.checkout)
  const rev = p.deliverables?.find(d => d.status === 'draft' && d.v > 0)
  const missing = (f.readinessItems ?? []).filter(i => !i.ok)
  const plug = (cls, actName, data, ic, label) => `<button class="nb-plug-it ${cls}" data-act="${actName}" data-p="${p.id}" ${data}>${icon(ic, 14)}<span class="grow">${label}</span>${icon('right', 13)}</button>`
  return `<div class="nb-flow-drawer ${fresh ? 'fresh' : ''}">
    <div class="nb-fd-main">
      <div class="nb-fd-hd"><span class="nb-lab">阶段进度</span><span class="dim">当前阶段 ${f.curStagePct}%</span><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">${icon('folder', 13)}文件夹</button>
        <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">看板</button></div>
      <div class="nb-stages">${f.stageDetails.map(st => `<button class="nb-stage ${st.state}" data-act="nb-open-board" data-p="${p.id}" data-b="stages" title="${esc(st.name)} ${st.pct}%">
        <span class="no">${no2(st.index)}</span><span class="nm">${esc(st.name)}</span>
        <span class="bar"><i style="width:${st.pct}%"></i></span><span class="pc">${st.pct}%</span></button>`).join('')}</div>
      <div class="nb-missing">${f.readinessOk ? '<span class="tag real">必做项已齐</span>' : missing.length ? `<span class="dim">还差</span>${missing.map(i => `<span class="tag amber">${esc(i.work)}</span>`).join('')}` : ''}</div>
    </div>
    <aside class="nb-plug">
      <div class="nb-fd-hd"><span class="nb-lab">插件提交</span><span class="grow"></span>
        <button class="lnk" data-act="nb-flowboard" data-p="${p.id}">流程提交 ›</button></div>
      ${plug('pri', 'nb-plug-sub', 'data-ch="plugin-draft"', 'bot', 'AI 起草并提交')}
      ${plug('', 'nb-plug-upload', '', 'upload', '上传文件提交')}
      ${chk ? plug('', 'nb-plug-sub', `data-d="${chk.id}" data-ch="local-checkin"`, 'check', `回传本地修改 · ${esc(chk.type)}`) : ''}
      ${rev ? plug('', 'nb-plug-sub', `data-d="${rev.id}" data-ch="review-submit"`, 'check', `提交审核 · ${esc(rev.type)}`) : ''}
      ${f.readinessOk ? plug('', 'nb-plug-sub', 'data-ch="gate-submit"', 'vote', '发起阶段准入') : ''}
      ${f.submissions?.[0] ? `<div class="nb-last ell" title="${esc(f.submissions[0].summary)}">最近：${esc(f.submissions[0].summary)}</div>` : ''}
    </aside>
  </div>`
}

function listHTML(d) {
  const bt = S.filters.bt || ''
  const q = (S.filters.q || '').trim()
  const list = d.projects.filter(p => (!bt || p.businessType === bt) && (!q || [p.name, p.company, p.industry].some(x => String(x || '').includes(q))))
  return list.map(p => {
    const exp = S.nbExpanded === p.id
    const f = p.flow
    const pct = f?.overallPct ?? p.progress ?? 0
    return `<article class="nb-row ${exp ? 'open' : ''}" data-act="nb-card-toggle" data-id="${p.id}">
      <div class="nb-row-main">
        <div class="nb-pct"><b data-count="${pct}">${pct}</b><i>%</i></div>
        <div class="nb-row-body">
          <h3 class="nb-name ell" title="${esc(p.name)}">${esc(p.name)}</h3>
          <div class="nb-meta ell"><span class="st">${esc(p.stage || '立项')}</span>${[P_STATUS[p.status] || p.status, p.businessName, p.industry || '综合', p.ownerName, `成果 ${p.deliverables.length} 份`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
        </div>
        <div class="nb-mini" aria-hidden="true">${(f?.stageDetails ?? []).map(st => `<i class="${st.state}"><b style="width:${st.pct}%"></b></i>`).join('')}</div>
        <button class="btn sm nb-open" data-act="nb-enter" data-id="${p.id}">打开</button>
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
    <header class="nb-top"><h1>项目</h1><span class="nb-top-n">进行中 ${active} · 共 ${d.projects.length}</span><span class="grow"></span>
      <label class="nb-find">${icon('search', 14)}<input id="nbShelfQ" placeholder="搜索项目" value="${esc(S.filters.q || '')}" autocomplete="off"></label>
      ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}新建项目</button>` : ''}</header>
    <section class="nb-feat">${FEATURED.map(([c, org, title, meta], idx) => `<button class="nb-feat-card" style="--c:${c}" data-act="nb-enter" data-id="${d.projects[idx % Math.max(1, d.projects.length)]?.id || ''}">
      <span class="org">${esc(org)}</span><b>${esc(title)}</b><span class="meta">${esc(meta)}</span></button>`).join('')}</section>
    <nav class="rtabs nb-bt">${[['', '全部', d.projects.length], ...d.businessTypes.map(b => [b.id, b.name, d.projects.filter(p => p.businessType === b.id).length])].map(([k, l, n]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</nav>
    <div class="nb-list" id="nbList">${listHTML(d)}</div></div>`
  if (fresh) entered(v)
  justOpened = null
}

document.addEventListener('input', e => {
  if (e.target?.id !== 'nbShelfQ') return
  S.filters.q = e.target.value
  const box = $('#nbList')
  $('.nb-shelf')?.classList.remove('enter')
  if (box) box.innerHTML = listHTML(D())
})

Object.assign(ACT, {
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
