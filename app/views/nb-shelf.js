// NotebookLM 项目管理主页：轻点项目展开实时流程进度百分比，旁边直接提供插件提交入口
import { S, D, ACT, VIEWS, hooks, $, esc, icon, avatar, act, toast, pick, toB64, can, P_STATUS } from '/api/investai?asset=ui.js'

S.nbExpanded ??= null

const FEATURED = [
  ['linear-gradient(145deg,#1E1B4B,#312E81)', '优势资本 · 双轮驱动总纲', '股权投资×产业投资：发现价值、挖掘价值、提升价值', '累计管理230亿 · 大科技/大健康/大生态全周期范式'],
  ['linear-gradient(145deg,#064E3B,#047857)', '政府产业投行 · 123456方法论', '一链两基两中心与六大产业生态招商系统', '资本招商 · 市场换产业 · 存量盘活与增量招引合规手册'],
  ['linear-gradient(145deg,#3B0764,#6B21A8)', '财务与法务尽调 · 穿行核验', '审计报告 vs BP 口径冲突排查与三表勾稽指南', '收入确认时点 · 前五大客户函证 · 历史沿革与代持还原'],
  ['linear-gradient(145deg,#0F172A,#1E3A8A)', '投委会(IC) · 立项与投决范式', 'Pre-IPO 投资建议书与估值敏感性测算标准件', '动态PE分位 · 业绩承诺与年化回购条款设计 · 交割先决条件(CP)'],
  ['linear-gradient(145deg,#451A03,#9A3412)', '投后赋能与退出管理', '募集资金监管、经营红绿灯跟踪与 IPO/并购退出闭环', '已投项目季度预算达成率 · 产业协同导入 · 回购触发预警'],
]

function renderFlowDrawer(p) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const chk = p.deliverables?.find(d => d.checkout)
  const rev = p.deliverables?.find(d => d.status === 'draft' && d.v > 0)
  return `<div class="nb-flow-drawer" onclick="event.stopPropagation()">
    <div class="nb-stage-track">
      <div class="row"><b>项目全周期进度 ${f.overallPct}%</b><span class="pill st-3">当前阶段准入完成度 ${f.curStagePct}%</span>
        <span class="grow"></span>
        <button class="btn sm" data-act="nb-open-folder" data-p="${p.id}">${icon('open', 13)}打开项目档案室</button>
        <button class="btn sm" data-act="nb-flowboard" data-p="${p.id}">阶段门禁与投决中心</button>
        <button class="btn sm pri" data-act="nb-enter" data-id="${p.id}">进入尽调与研判工作台 ›</button></div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
      <div class="nb-stages-row">${f.stageDetails.map(st => `<div class="nb-st-node ${st.state}">
        <span>${st.state === 'done' ? '✓' : st.index + 1}. ${esc(st.name)}</span><b>${st.pct}%</b></div>`).join('')}</div>
      <div class="dim" style="font-size:11.5px">${f.readinessOk ? '✅ 当前阶段必做工作成果已全部定稿，满足决策节点准入条件' : `待定稿必做工作：${(f.readinessItems ?? []).filter(i => !i.ok).map(i => esc(i.work)).join('、') || '推进中'}`}</div>
    </div>
    <div class="nb-plug-box">
      <h4>${icon('spark', 14)} 阶段工作成果快捷报送（实时推进当前阶段）</h4>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-ch="plugin-draft">${icon('bot', 12)}AI 辅助起草并报送</button>
        <button class="btn sm" data-act="nb-plug-upload" data-p="${p.id}">${icon('upload', 12)}上传正式成果文件</button>
        ${chk ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-d="${chk.id}" data-ch="local-checkin">回传本地修订件 (${esc(chk.type)})</button>` : ''}
        ${rev ? `<button class="btn sm" data-act="nb-plug-sub" data-p="${p.id}" data-d="${rev.id}" data-ch="review-submit">提交复核 (${esc(rev.type)})</button>` : ''}
        ${f.readinessOk ? `<button class="btn sm" data-act="nb-plug-sub" data-p="${p.id}" data-ch="gate-submit">${icon('vote', 12)}提请决策节点表决</button>` : ''}
      </div>
      <div class="dim" style="font-size:11px">${f.submissions?.[0] ? `最近报送：${esc(f.submissions[0].summary)}` : '支持底稿溯源起草、本机 Office 检出修订后一键报送至当前阶段'}</div>
    </div>
  </div>`
}

export function renderNotebookShelf(v) {
  const d = D()
  const bt = S.filters.bt || ''
  const q = (S.filters.q || '').trim()
  const list = d.projects.filter(p => (!bt || p.businessType === bt) && (!q || [p.name, p.company, p.industry].some(x => String(x || '').includes(q))))
  v.innerHTML = `<div class="nb-shelf">
    <div class="nb-hero"><div class="grow"><h1>优势资本 · 投研方法论智库与在管项目总览</h1>
      <p>秉承“发现价值、挖掘价值、提升价值”核心理念，以「股权投资 × 产业投资」双轮驱动推进全周期项目管控（轻点项目卡片展开阶段完成度、准入条件与成果报送通道）。</p></div>
      <button class="nb-api-pill" data-act="nb-api"><span class="dot ${d.model.ok ? 'ok' : 'warn'}"></span><span>模型：${esc(d.model.ok ? d.model.label : '本地离线引擎')}</span></button>
      ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}发起项目立项</button>` : ''}</div>
    <div class="nb-feat-row">${FEATURED.map(([bg, orgName, title, meta], idx) => `<div class="nb-feat-card" style="background:${bg}" data-act="nb-enter" data-id="${d.projects[idx % Math.max(1, d.projects.length)]?.id || ''}">
      <div class="row"><span class="tag" style="background:rgba(0,0,0,.35);border:0;color:#fff">🏛️ ${esc(orgName)}</span></div>
      <div><b style="font-size:15.5px;color:#fff;display:block;margin-bottom:4px">${esc(title)}</b><span style="font-size:11px;color:rgba(255,255,255,.78)">${esc(meta)}</span></div></div>`).join('')}</div>
    <div class="row" style="margin-bottom:12px"><h2 style="margin:0;font-size:17px">在管投资项目组合（立项 · 尽调 · 投决 · 投后 · 退出）</h2><span class="grow"></span>
      <div class="rtabs">${[['', `全部项目 ${d.projects.length}`], ...d.businessTypes.map(b => [b.id, `${b.name} ${d.projects.filter(p => p.businessType === b.id).length}`])].map(([k, l]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="nb-cards">${list.map(p => {
      const exp = S.nbExpanded === p.id
      const pct = p.flow?.overallPct ?? p.progress ?? 0
      return `<div class="nb-card ${exp ? 'expanded' : ''}" data-act="nb-card-toggle" data-id="${p.id}">
        <div class="nb-card-top">
          <div class="nb-pct-ring"><b>${pct}%</b><span>阶段进度</span></div>
          <div class="grow" style="min-width:0"><div class="row"><b style="font-size:15px" class="ell">${esc(p.name)}</b><span class="pill st-3">${esc(p.stage || '立项')}</span><span class="tag">${esc(P_STATUS[p.status] || p.status)}</span></div>
            <div class="dim" style="margin-top:4px">${esc(p.businessName || '')} · ${esc(p.industry || '综合')} · 项目负责人 ${esc(p.ownerName || '')} · 已出成果 ${p.deliverables.length} 份</div></div>
          <button class="btn sm ${exp ? '' : 'pri'}" data-act="nb-enter" data-id="${p.id}" onclick="event.stopPropagation()">尽调与研判工作台 ›</button>
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
