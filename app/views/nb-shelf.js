// NotebookLM 项目管理主页：轻点项目展开实时流程进度百分比，旁边直接提供插件提交入口
import { S, D, ACT, VIEWS, hooks, $, esc, icon, avatar, act, toast, pick, toB64, can, P_STATUS } from '/api/investai?asset=ui.js'

S.nbExpanded ??= null

const FEATURED = [
  ['linear-gradient(145deg,#1E1B4B,#312E81)', 'PE/VC 机构方法论', '硬科技与半导体尽调全流程精要', '2026年11月 · 18 个来源 · 麦肯锡模板'],
  ['linear-gradient(145deg,#064E3B,#047857)', '产业并购与资本招商', '地方产业基金招引与返投合规手册', '2026年10月 · 24 个来源 · 含核验矩阵'],
  ['linear-gradient(145deg,#3B0764,#6B21A8)', '财务与估值核验库', '审计报告 vs BP 多源冲突排查指南', '2026年10月 · 31 个来源 · 三表勾稽'],
  ['linear-gradient(145deg,#0F172A,#1E3A8A)', '投委会 IC 决策范式', '立项会与投决会高通过率汇报拆解', '2026年09月 · 15 个来源 · Mck 62版式'],
  ['linear-gradient(145deg,#451A03,#9A3412)', '投后赋能与退出控制', '回购条款触发、对赌复盘与分配闭环', '2026年09月 · 19 个来源 · 风控标准件'],
]

function renderFlowDrawer(p) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const chk = p.deliverables?.find(d => d.checkout)
  const rev = p.deliverables?.find(d => d.status === 'draft' && d.v > 0)
  return `<div class="nb-flow-drawer" onclick="event.stopPropagation()">
    <div class="nb-stage-track">
      <div class="row"><b>全流程总进度 ${f.overallPct}%</b><span class="pill st-3">当前阶段完成度 ${f.curStagePct}%</span>
        <span class="grow"></span>
        <button class="btn sm" data-act="nb-open-folder" data-p="${p.id}">${icon('open', 13)}打开项目专属文件夹</button>
        <button class="btn sm" data-act="nb-flowboard" data-p="${p.id}">③ 流程提交看板</button>
        <button class="btn sm pri" data-act="nb-enter" data-id="${p.id}">② 图1项目制作台 ›</button></div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
      <div class="nb-stages-row">${f.stageDetails.map(st => `<div class="nb-st-node ${st.state}">
        <span>${st.state === 'done' ? '✓' : st.index + 1}. ${esc(st.name)}</span><b>${st.pct}%</b></div>`).join('')}</div>
      <div class="dim" style="font-size:11.5px">${f.readinessOk ? '✅ 当前阶段准入条件已满足，可由右侧发起门禁提交' : `待完成必做项：${(f.readinessItems ?? []).filter(i => !i.ok).map(i => esc(i.work)).join('、') || '进行中'}`}</div>
    </div>
    <div class="nb-plug-box">
      <h4>${icon('spark', 14)} 插件提交通道（实时推进当前节点）</h4>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-ch="plugin-draft">${icon('bot', 12)}AI/DSH 插件起草提交</button>
        <button class="btn sm" data-act="nb-plug-upload" data-p="${p.id}">${icon('upload', 12)}本地文件插件直交</button>
        ${chk ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-d="${chk.id}" data-ch="local-checkin">回传本地修改 (${esc(chk.type)})</button>` : ''}
        ${rev ? `<button class="btn sm" data-act="nb-plug-sub" data-p="${p.id}" data-d="${rev.id}" data-ch="review-submit">提交审核 (${esc(rev.type)})</button>` : ''}
        ${f.readinessOk ? `<button class="btn sm" data-act="nb-plug-sub" data-p="${p.id}" data-ch="gate-submit">${icon('vote', 12)}发起阶段准入</button>` : ''}
      </div>
      <div class="dim" style="font-size:11px">${f.submissions?.[0] ? `最近提交：${esc(f.submissions[0].summary)}` : '支持断网本地 API、DSH 插件或本地 Office 修改后一键提交到本阶段'}</div>
    </div>
  </div>`
}

export function renderNotebookShelf(v) {
  const d = D()
  const bt = S.filters.bt || ''
  const q = (S.filters.q || '').trim()
  const list = d.projects.filter(p => (!bt || p.businessType === bt) && (!q || [p.name, p.company, p.industry].some(x => String(x || '').includes(q))))
  v.innerHTML = `<div class="nb-shelf">
    <div class="nb-hero"><div class="grow"><h1>精选行业智库与方法论笔记本</h1>
      <p>对标图2专业投研工作台：上方为机构方法论与咨询模板库，下方为最近打开过的项目笔记本（轻点展开流程进度百分比 + 插件提交 + 自动生成专属文件夹）。</p></div>
      <button class="nb-api-pill" data-act="nb-api"><span class="dot ${d.model.ok ? 'ok' : 'warn'}"></span><span>API：${esc(d.model.ok ? d.model.label : '本地离线引擎')}</span></button>
      ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}新建项目笔记本</button>` : ''}</div>
    <div class="nb-feat-row">${FEATURED.map(([bg, orgName, title, meta], idx) => `<div class="nb-feat-card" style="background:${bg}" data-act="nb-enter" data-id="${d.projects[idx % Math.max(1, d.projects.length)]?.id || ''}">
      <div class="row"><span class="tag" style="background:rgba(0,0,0,.35);border:0;color:#fff">📖 ${esc(orgName)}</span></div>
      <div><b style="font-size:15.5px;color:#fff;display:block;margin-bottom:4px">${esc(title)}</b><span style="font-size:11px;color:rgba(255,255,255,.78)">${esc(meta)}</span></div></div>`).join('')}</div>
    <div class="row" style="margin-bottom:12px"><h2 style="margin:0;font-size:17px">最近打开过的项目笔记本</h2><span class="grow"></span>
      <div class="rtabs">${[['', `全部 ${d.projects.length}`], ...d.businessTypes.map(b => [b.id, `${b.name} ${d.projects.filter(p => p.businessType === b.id).length}`])].map(([k, l]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="nb-cards">${list.map(p => {
      const exp = S.nbExpanded === p.id
      const pct = p.flow?.overallPct ?? p.progress ?? 0
      return `<div class="nb-card ${exp ? 'expanded' : ''}" data-act="nb-card-toggle" data-id="${p.id}">
        <div class="nb-card-top">
          <div class="nb-pct-ring"><b>${pct}%</b><span>流程进度</span></div>
          <div class="grow" style="min-width:0"><div class="row"><b style="font-size:15px" class="ell">${esc(p.name)}</b><span class="pill st-3">${esc(p.stage || '立项')}</span><span class="tag">${esc(P_STATUS[p.status] || p.status)}</span></div>
            <div class="dim" style="margin-top:4px">${esc(p.businessName || '')} · ${esc(p.industry || '综合')} · 负责人 ${esc(p.ownerName || '')} · 成果 ${p.deliverables.length} 份</div></div>
          <button class="btn sm ${exp ? '' : 'pri'}" data-act="nb-enter" data-id="${p.id}" onclick="event.stopPropagation()">进入笔记空间 ›</button>
        </div>${exp ? renderFlowDrawer(p) : ''}</div>`
    }).join('')}</div></div>`
}

Object.assign(ACT, {
  'nb-card-toggle': el => { S.nbExpanded = S.nbExpanded === el.dataset.id ? null : el.dataset.id; hooks.refresh() },
  'nb-open-folder': async el => { const r = await act('nb.folder.open', { projectId: el.dataset.p, filePath: el.dataset.fp }); if (r) toast(`📂 已打开项目专属文件夹：${r.opened}`, 'ok') },
  'nb-enter': el => { S.sel = el.dataset.id; S.project = null; hooks.go('notebook', { id: el.dataset.id }) },
  'nb-plug-sub': async el => {
    const r = await act('nb.plugin.submit', { projectId: el.dataset.p, deliverableId: el.dataset.d, channel: el.dataset.ch, fileIds: S.ctx.fileIds })
    if (r) { toast(`✅ ${r.summary}`, 'ok'); if (r.job) hooks.track(r.job); await hooks.reload({ files: false }) }
  },
  'nb-plug-upload': async el => {
    const [f] = await pick({ accept: '.pptx,.docx,.xlsx,.md' })
    if (!f) return
    const r = await act('nb.plugin.submit', { projectId: el.dataset.p, channel: 'file-upload', name: f.name, data: await toB64(f) })
    if (r) { toast(`✅ ${r.summary}`, 'ok'); await hooks.reload() }
  },
})
VIEWS.workbench = renderNotebookShelf
VIEWS.pipeline = renderNotebookShelf
