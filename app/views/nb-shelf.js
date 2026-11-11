// 投研项目总览：一行一个项目，左边是全周期进度百分比；点一行展开各阶段进度，右边是成果报送
import { S, D, ACT, VIEWS, hooks, $, esc, icon, act, toast, pick, toB64, can, P_STATUS, firstPaint, entered } from '/api/investai?asset=ui.js'

S.nbExpanded ??= null
let justOpened = null

const FEATURED = [
  ['var(--violet)', '双轮驱动总纲', '股权投资与产业投资：发现价值、挖掘价值、提升价值', '大科技 · 大健康 · 大生态'],
  ['var(--green)', '政府产业投行', '一链两基两中心与六大产业生态招商', '资本招商 · 存量盘活 · 增量招引'],
  ['var(--amber)', '财务与法务尽调', '审计报告与 BP 口径冲突排查、三表勾稽', '收入确认 · 客户函证 · 代持还原'],
  ['var(--blue)', '投委会立项与投决', 'Pre-IPO 投资建议书与估值敏感性测算', '动态 PE 分位 · 回购条款 · 交割先决条件'],
  ['var(--red)', '投后赋能与退出', '募集资金监管、经营跟踪与 IPO、并购退出', '预算达成率 · 产业协同 · 回购预警'],
]

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
          <div class="nb-meta ell"><span class="st">${esc(p.stage || '立项')}</span>${[P_STATUS[p.status] || p.status, p.businessName, p.industry || '综合', p.ownerName && `负责人 ${p.ownerName}`, `成果 ${p.deliverables.length} 份`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
        </div>
        <div class="nb-mini" aria-hidden="true">${(f?.stageDetails ?? []).map(st => `<i class="${st.state}"><b style="width:${st.pct}%"></b></i>`).join('')}</div>
        <button class="btn sm nb-open" data-act="nb-enter" data-id="${p.id}">进入工作台</button>
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
      <label class="nb-find">${icon('search', 14)}<input id="nbShelfQ" placeholder="搜索项目" value="${esc(S.filters.q || '')}" autocomplete="off"></label>
      ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}发起项目立项</button>` : ''}</header>
    <section class="nb-feat">${FEATURED.map(([c, org, title, meta], idx) => `<button class="nb-feat-card" style="--c:${c}" data-act="nb-enter" data-id="${d.projects[idx % Math.max(1, d.projects.length)]?.id || ''}">
      <span class="org">${esc(org)}</span><b>${esc(title)}</b><span class="meta">${esc(meta)}</span></button>`).join('')}</section>
    <nav class="rtabs nb-bt">${[['', '全部项目', d.projects.length], ...d.businessTypes.map(b => [b.id, b.name, d.projects.filter(p => p.businessType === b.id).length])].map(([k, l, n]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</nav>
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
