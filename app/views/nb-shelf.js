// 分部门专属操作台与分类板块化项目总览（飞书/钉钉现代企业风格 × 分类项目板块与进度可视化）：
//   1. 顶栏紧凑部门操作头 + 内嵌 4 项核心指标 + 4 项部门高频业务与 AI 快捷工具
//   2. 分类板块化项目空间（财务投资股权 / 产业投资招商 / 投后管理退出 / 历史归档）直观呈现阶段进度条与卡片操作，支持板块/列表切换与阶段展开报送
//   3. 仅管理层 / 合伙人展示「管理层全局驾驶舱」（待决队列、九部门巡检矩阵、全院敏感台账）；各部门同步查看「全院脱敏项目进度板块」
import { S, D, ACT, VIEWS, hooks, $, $$, esc, icon, avatar, get, act, toast, dialog, drawer, drawerHead, closeDrawer, pick, toB64, can, P_STATUS, LEVELS, AI_LEVEL, RULE, due, opts, firstPaint, entered } from '/api/investai?asset=ui.js'

S.nbExpanded ??= null
S.nbShelfMode ??= 'board'
S.oaOpen ??= false
S.execTab ??= 'overview'
S.progFilter ??= 'all'
let justOpened = null
let oaCache = null
let wsLoadingKey = null

const no2 = i => String(i + 1).padStart(2, '0')
const ROUTE_LABEL = { hybrid: '混合路由', local: '仅本地', external: '外部模型' }

function getCachedWs(d) {
  const key = `${d.rev}:${d.me.id}`
  return S.deptWs?.key === key ? S.deptWs.data : null
}

async function ensureDeptWorkspace() {
  const d = D()
  if (!d?.me) return
  const key = `${d.rev}:${d.me.id}`
  if (S.deptWs?.key === key || wsLoadingKey === key) return
  wsLoadingKey = key
  try {
    const data = await get('dept.workspace')
    if (D()?.rev === d.rev && D()?.me?.id === d.me.id) {
      S.deptWs = { key, data }
      hooks.renderNav?.()
      if (S.view === 'workbench' || S.view === 'pipeline') renderNotebookShelf($('#view'))
    }
  } catch (err) {
    console.warn('dept.workspace load failed:', err)
  } finally {
    if (wsLoadingKey === key) wsLoadingKey = null
  }
}

/** 展开区：左边是各阶段的百分比，右边是成果报送入口 */
function renderFlowDrawer(p, fresh) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [], submissions: [] }
  const chk = p.deliverables?.find(d => d.checkout)
  const rev = p.deliverables?.find(d => d.status === 'draft' && d.v > 0)
  const missing = (f.readinessItems ?? []).filter(i => !i.ok)
  const plug = (cls, actName, data, ic, label) => `<button class="nb-plug-it ${cls}" data-act="${actName}" data-p="${p.id}" ${data}>${icon(ic, 14)}<span class="grow">${label}</span>${icon('right', 13)}</button>`
  return `<div class="nb-flow-drawer ${fresh ? 'fresh' : ''}">
    <div class="nb-fd-main">
      <div class="nb-fd-hd"><span class="nb-lab">${esc(p.name)} · 阶段进度拆解</span><span class="dim">当前阶段准入 ${f.curStagePct}%</span><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">${icon('folder', 13)}项目档案室</button>
        <button class="btn sm ghost" data-act="nb-open-board" data-p="${p.id}" data-b="stages">管控看板</button>
        <button class="btn sm ghost ico" data-act="nb-card-toggle" data-id="${p.id}" title="收起">${icon('x', 13)}</button></div>
      <div class="nb-stages">${f.stageDetails.map(st => `<button class="nb-stage ${st.state}" data-act="nb-open-board" data-p="${p.id}" data-b="stages" title="${esc(st.name)} ${st.pct}%">
        <span class="no">${no2(st.index)}</span><span class="nm">${esc(st.name)}</span>
        <span class="bar"><i style="width:${st.pct}%"></i></span><span class="pc">${st.pct}%</span></button>`).join('')}</div>
      <div class="nb-missing">${f.readinessOk ? '<span class="tag real">必做成果已定稿</span>' : missing.length ? `<span class="dim">待定稿</span>${missing.map(i => `<span class="tag amber">${esc(i.work)}</span>`).join('')}` : ''}</div>
    </div>
    <aside class="nb-plug">
      <div class="nb-fd-hd"><span class="nb-lab">成果报送</span><span class="grow"></span>
        <button class="lnk" data-act="nb-flowboard" data-p="${p.id}">阶段门禁与投决 ›</button></div>
      ${can('deliverable.edit') ? plug('pri', 'nb-plug-sub', 'data-ch="plugin-draft"', 'bot', 'AI 辅助起草并报送') : ''}
      ${can('deliverable.edit') ? plug('', 'nb-plug-upload', '', 'upload', '上传正式成果文件') : ''}
      ${chk && can('deliverable.edit') ? plug('', 'nb-plug-sub', `data-d="${chk.id}" data-ch="local-checkin"`, 'check', `回传本地修订件 · ${esc(chk.type)}`) : ''}
      ${rev && can('deliverable.review') ? plug('', 'nb-plug-sub', `data-d="${rev.id}" data-ch="review-submit"`, 'check', `提请复核 · ${esc(rev.type)}`) : ''}
      ${f.readinessOk && can('project.submit') ? plug('', 'nb-plug-sub', 'data-ch="gate-submit"', 'vote', '提请决策节点表决') : ''}
      ${!can('deliverable.edit') ? '<div class="dim" style="font-size:11.5px;padding:6px 2px">当前岗位为审阅 / 决策视角，请点上方「阶段门禁与投决」查看表决或审核节点。</div>' : ''}
      ${f.submissions?.[0] ? `<div class="nb-last ell" title="${esc(f.submissions[0].summary)}">最近报送：${esc(f.submissions[0].summary)}</div>` : ''}
    </aside>
  </div>`
}

function oaInboxHTML(ib) {
  if (!ib) return ''
  const dp = D()?.deptProfile
  if (!ib.total) {
    return `<div class="nb-oa empty-oa"><span class="dot ok"></span><span>我的待办：当前无待表决或待复核积压事项</span><span class="grow"></span>${(dp?.canOpenSettings || can('org.manage')) ? '<button class="lnk" data-act="enterprise-open">企业开箱配置 ›</button>' : ''}</div>`
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

function heroActionsHTML(d, dp) {
  const firstActive = d.projects.find(p => p.status === 'active') ?? d.projects[0]
  const firstInd = d.projects.find(p => p.businessType === 'industrial' && p.status === 'active') ?? firstActive
  const firstPost = d.projects.find(p => ['post', 'exit', 'archive'].includes(p.stageKind)) ?? firstActive
  const key = dp?.key ?? 'financial'
  const btns = []
  if (key === 'executive') {
    btns.push(`<button class="btn pri" data-act="dept-go-decision">${icon('vote', 14)}投决表决中枢</button>`)
    btns.push(`<button class="btn" data-act="dept-exec-tab" data-tab="departments">${icon('building', 14)}九部门巡检</button>`)
    btns.push(`<button class="btn" data-act="dept-exec-tab" data-tab="ledger">${icon('chart', 14)}全院敏感台账</button>`)
    if (can('project.create') && can('material.upload')) btns.push(`<button class="btn ghost" data-act="quick-project">${icon('upload', 14)}快速立项</button>`)
  } else if (key === 'industrial') {
    if (can('project.create') && can('material.upload')) btns.push(`<button class="btn pri" data-act="quick-project" data-bt="industrial">${icon('upload', 14)}产业项目建档</button>`)
    if (firstInd) btns.push(`<button class="btn" data-act="nb-flowboard" data-p="${firstInd.id}">${icon('flow', 14)}产投四阶段门禁</button>`)
    btns.push(`<button class="btn ghost" data-act="go" data-view="research">${icon('globe', 14)}产业政策研究</button>`)
  } else if (key === 'financial') {
    if (can('project.create') && can('material.upload')) btns.push(`<button class="btn pri" data-act="quick-project" data-bt="financial">${icon('upload', 14)}带 BP 快速立项</button>`)
    btns.push(`<button class="btn" data-act="go" data-view="extract">${icon('extract', 14)}BP与财报提取</button>`)
    if (firstActive) btns.push(`<button class="btn ghost" data-act="nb-enter" data-id="${firstActive.id}">${icon('spark', 14)}尽调与研判台</button>`)
  } else if (key === 'finance') {
    btns.push(`<button class="btn pri" data-act="go" data-view="extract">${icon('extract', 14)}财报三表提取</button>`)
    if (firstActive) btns.push(`<button class="btn" data-act="nb-enter" data-id="${firstActive.id}">${icon('table', 14)}财务审阅工作台</button>`)
    if (firstActive) btns.push(`<button class="btn ghost" data-act="nb-flowboard" data-p="${firstActive.id}">${icon('check', 14)}交割打款会签</button>`)
  } else if (key === 'legal') {
    btns.push(`<button class="btn pri" data-act="go" data-view="templates">${icon('tpl', 14)}标准协议模板库</button>`)
    if (firstActive) btns.push(`<button class="btn" data-act="nb-enter" data-id="${firstActive.id}">${icon('shield', 14)}法审尽调工作台</button>`)
    if (firstActive) btns.push(`<button class="btn ghost" data-act="nb-flowboard" data-p="${firstActive.id}">${icon('flow', 14)}确权交割会签</button>`)
  } else if (key === 'risk') {
    if (firstActive) btns.push(`<button class="btn pri" data-act="nb-flowboard" data-p="${firstActive.id}">${icon('vote', 14)}独立风控表决</button>`)
    if (firstActive) btns.push(`<button class="btn" data-act="nb-enter" data-id="${firstActive.id}">${icon('shield', 14)}风控底稿审阅</button>`)
    btns.push(`<button class="btn ghost" data-act="go" data-view="settings" data-sub="audit">${icon('history', 14)}合规审计轨迹</button>`)
  } else if (key === 'postinv') {
    if (firstPost) btns.push(`<button class="btn pri" data-act="nb-enter" data-id="${firstPost.id}">${icon('chart', 14)}投后与退出工作台</button>`)
    btns.push(`<button class="btn" data-act="go" data-view="meetings">${icon('mic', 14)}投后复盘纪要</button>`)
    if (firstPost) btns.push(`<button class="btn ghost" data-act="nb-flowboard" data-p="${firstPost.id}">${icon('flow', 14)}归档与退出门禁</button>`)
  } else if (key === 'fund') {
    btns.push(`<button class="btn pri" data-act="dept-ai-prompt" data-prompt="${esc(dp?.workspaceHints?.quickQuestions?.[0]?.[1] || '基于公开研究起草机构 LP 募资路演要点')}">${icon('spark', 14)}AI 募资路演助手</button>`)
    btns.push(`<button class="btn" data-act="go" data-view="research">${icon('industry', 14)}宏观与赛道研报</button>`)
    btns.push(`<button class="btn ghost" data-act="go" data-view="companies">${icon('building', 14)}合作主体与 LP 库</button>`)
  } else if (key === 'it') {
    btns.push(`<button class="btn pri" data-act="enterprise-open">${icon('building', 14)}企业开箱与批量建号</button>`)
    btns.push(`<button class="btn" data-act="nb-api">${icon('bot', 14)}多模型安全路由</button>`)
    btns.push(`<button class="btn ghost" data-act="go" data-view="settings" data-sub="roles">${icon('shield', 14)}四层权限与流程编排</button>`)
  }
  return btns.join('')
}

function renderKpis(ws) {
  if (!ws?.kpis?.length) return ''
  return `<div class="dp-kpis">${ws.kpis.map(k => `<div class="dp-kpi tone-${esc(k.tone || 'plain')}">
    <div class="dp-kpi-top"><span class="dp-kpi-lab">${esc(k.label)}</span><b class="dp-kpi-val">${esc(String(k.value))}</b></div>
    <span class="dp-kpi-sub ell">${esc(k.sub || '')}</span>
  </div>`).join('')}</div>`
}

function renderHero(d, dp, ws) {
  return `<section class="dp-hero" style="--dp-accent:${esc(dp?.accentVar || 'var(--accent)')}">
    <div class="dp-hero-top">
      <div class="dp-hero-title">
        <div class="dp-hero-line">
          <h1>${esc(dp?.workspaceTitle || '投研操作台')}</h1>
          <span class="dp-badge"><i class="dp-dot"></i>${esc(dp?.badge || '业务部门')}</span>
          ${dp?.roleSubBadge ? `<span class="dp-subbadge">${esc(dp.roleSubBadge)}</span>` : ''}
          <span class="tag ${dp?.isExecutive ? 'blue' : ''}">${dp?.isExecutive ? '全机构全内容权限' : '本部门专属 · 全院进度可视'}</span>
        </div>
        <p class="dp-tag">${esc(dp?.tagline || '')}</p>
      </div>
      <div class="dp-hero-acts">${heroActionsHTML(d, dp)}</div>
    </div>
    ${ws ? renderKpis(ws) : ''}
  </section>`
}

function renderLayersFooter(d, dp) {
  const m = d.model ?? {}
  const route = ROUTE_LABEL[m.mode] ?? m.mode ?? '混合路由'
  const modelLabel = m.ok ? (m.verified ? m.label : `${m.label}（待验证）`) : '离线合规引擎'
  return `<section class="dp-sec dp-arch-bar">
    <div class="dp-sec-hd"><h2>企业三层智能架构运行摘要</h2><span class="dim">投资业务交互 · AI 协作执行 · 底层模型与密级安全边界</span></div>
    <div class="dp-layers">
      <div class="dp-layer"><b>01 投资业务交互层</b><span>${esc(dp?.businessLayer || '')}</span></div>
      <div class="dp-layer"><b>02 AI 协作与执行层</b><span>${esc(dp?.aiLayer || '')}</span></div>
      <div class="dp-layer"><b>03 底层模型与密级层</b><span>${esc(route)} · ${esc(modelLabel)} · 资料密级 ≤ ${esc(LEVELS[d.caps?.clearance ?? 1])} · AI ${esc(AI_LEVEL[d.caps?.ai ?? 1])}</span></div>
    </div>
  </section>`
}

function renderModules(ws) {
  if (!ws?.modules?.length) return ''
  return `<section class="dp-sec dp-mod-sec">
    <div class="dp-mod-grid">${ws.modules.map(m => {
      const attrs = [
        `data-act="${esc(m.act)}"`,
        m.projectId ? `data-p="${esc(m.projectId)}" data-id="${esc(m.projectId)}"` : '',
        m.view ? `data-view="${esc(m.view)}"` : '',
        m.sub ? `data-sub="${esc(m.sub)}"` : '',
        m.tab ? `data-tab="${esc(m.tab)}"` : '',
        m.businessType ? `data-bt="${esc(m.businessType)}"` : '',
        m.prompt ? `data-prompt="${esc(m.prompt)}"` : '',
        m.disabled ? 'disabled' : '',
      ].filter(Boolean).join(' ')
      return `<button class="dp-mod tone-${esc(m.tone || 'accent')}" ${attrs}>
        <span class="dp-mod-ic">${icon(m.icon || 'spark', 16)}</span>
        <div class="dp-mod-tx">
          <b class="ell" title="${esc(m.title)}">${esc(m.title)}</b>
          <p class="ell" title="${esc(m.desc)}">${esc(m.desc)}</p>
        </div>
        <span class="dp-mod-arr">${icon('right', 13)}</span>
      </button>`
    }).join('')}</div>
  </section>`
}

function renderIndustrialBoard(phases, compact = false) {
  if (!phases?.length) return ''
  return `<div class="dp-ind-grid ${compact ? 'compact' : ''}">${phases.map(ph => `<article class="dp-ind-col">
    <header class="dp-ind-hd"><span class="dp-ind-no">${esc(ph.no)}</span><div class="grow" style="min-width:0"><b>${esc(ph.name)}</b><span class="dim ell">${esc(ph.dept)}</span></div><span class="tag ${ph.projects.length ? 'real' : ''}">${ph.projects.length} 个项目</span></header>
    ${compact ? '' : `<ul class="dp-ind-steps">${ph.steps.map(st => `<li>${esc(st)}</li>`).join('')}</ul>`}
    <div class="dp-ind-projs">${ph.projects.length ? ph.projects.map(p => p.canOpen
      ? `<button class="dp-mini-proj" data-act="nb-enter" data-id="${p.id}"><b class="ell grow">${esc(p.name)}</b><span>${esc(p.stage)} · ${p.overallPct}%</span></button>`
      : `<button class="dp-mini-proj locked" data-act="dept-prog-locked"><b class="ell grow">${esc(p.name)}</b><span>${esc(p.stage)} · ${p.overallPct}%</span></button>`).join('')
      : '<div class="dp-empty-sm">当前阶段暂无在途产投项目</div>'}</div>
  </article>`).join('')}</div>`
}

function renderFinancialFunnel(funnel) {
  if (!funnel?.length) return ''
  return `<div class="dp-funnel">${funnel.map(st => `<div class="dp-fn-col ${st.count ? 'has' : ''}">
    <div class="dp-fn-hd"><span class="no">${esc(st.no)}</span><b class="grow">${esc(st.name)}</b><span class="cnt">${st.count}</span></div>
    <div class="dp-fn-list">${st.projects.length ? st.projects.map(p => p.canOpen
      ? `<button class="dp-mini-proj" data-act="nb-enter" data-id="${p.id}"><span class="ell grow">${esc(p.name)}</span><b>${p.overallPct}%</b></button>`
      : `<button class="dp-mini-proj locked" data-act="dept-prog-locked"><span class="ell grow">${esc(p.name)}</span><b>${p.overallPct}%</b></button>`).join('')
      : '<span class="dim" style="font-size:11.5px">暂无</span>'}</div>
  </div>`).join('')}</div>`
}

function renderRiskAlertsList(alerts) {
  if (!alerts?.length) {
    return `<div class="dp-all-clear">${icon('check', 16)}<b>当前受监项目无退回整改或口径异常预警</b><span class="dim">持续监测各阶段准入与底稿数字核验</span></div>`
  }
  return `<div class="dp-alert-grid">${alerts.map(a => `<article class="dp-alert lv-${esc(a.level || 'amber')}">
    <div class="dp-alert-hd"><span class="tag ${a.level === 'red' ? 'lv3' : a.level === 'blue' ? 'blue' : 'amber'} sm">${esc(a.tag)}</span><b class="ell grow">${esc(a.projectName)}</b>
      <button class="btn sm ghost" data-act="${esc(a.action || 'nb-flowboard')}" data-p="${a.projectId}" data-id="${a.projectId}">处理 ›</button></div>
    <p>${esc(a.detail)}</p>
  </article>`).join('')}</div>`
}

function renderExecutiveCockpit(ws) {
  const ex = ws.executive
  if (!ex) return ''
  const tab = S.execTab || 'overview'
  const tabs = [
    ['overview', '决策总览与双轮漏斗', ex.decisionQueue.length],
    ['departments', '九部门运行巡检矩阵', ex.departments.length],
    ['ledger', '全院敏感台账（领导独享）', ex.sensitiveLedger.length],
  ]
  let body = ''
  if (tab === 'overview') {
    body = `<div class="dp-exec-block">
      <div class="dp-sub-hd"><h3>待决与上会队列</h3><span class="dim">共 ${ex.decisionQueue.length} 项进行中表决 · 待您表决 ${ex.summary.myPendingVotes} 项</span></div>
      ${ex.decisionQueue.length ? `<div class="dp-dec-list">${ex.decisionQueue.map(a => `<div class="dp-dec-row ${a.myTurn ? 'mine' : ''}">
        <span class="tag ${a.myTurn ? 'amber' : 'blue'} sm">${a.myTurn ? '轮到您表决' : '表决进行中'}</span>
        <div class="grow" style="min-width:0"><b>${esc(a.projectName)}</b><div class="dim ell" style="font-size:11.5px">${esc(a.businessName)} · ${esc(a.deptName)} · ${esc(a.gateName)}（${esc(RULE[a.rule] || a.rule)} · 已投 ${a.votesDone}/${a.votesTotal}）</div></div>
        <div class="dp-dec-nums"><span>金额 <b>${esc(a.amount)}</b></span><span>估值 <b>${esc(a.valuation)}</b></span></div>
        <div class="row" style="gap:6px"><button class="btn sm pri" data-act="nb-flowboard" data-p="${a.projectId}">去表决</button><button class="btn sm ghost" data-act="nb-enter" data-id="${a.projectId}">看底稿</button></div>
      </div>`).join('')}</div>` : '<div class="dp-all-clear">当前无待决投委会 / 立项会表决事项</div>'}
    </div>
    <div class="dp-exec-block">
      <div class="dp-sub-hd"><h3>股权投资六阶段漏斗</h3><span class="dim">财务投资在途 ${ex.summary.financialActive} 个</span></div>
      ${renderFinancialFunnel(ws.financialFunnel)}
    </div>
    <div class="dp-exec-block">
      <div class="dp-sub-hd"><h3>产业投资四阶段推进（立项承接 → 尽调承做 → 落地承销 → 管理退出）</h3><span class="dim">产业投资在途 ${ex.summary.industrialActive} 个</span></div>
      ${renderIndustrialBoard(ws.industrialPhases, true)}
    </div>
    ${ws.riskAlerts?.length ? `<div class="dp-exec-block"><div class="dp-sub-hd"><h3>全院风险与准入预警</h3><span class="dim">${ws.riskAlerts.length} 项需管理层关注</span></div>${renderRiskAlertsList(ws.riskAlerts)}</div>` : ''}`
  } else if (tab === 'departments') {
    body = `<div class="dp-dept-matrix">${ex.departments.map(dept => `<article class="dp-dept-card" style="--dp-accent:${esc(dept.accentVar || 'var(--accent)')}">
      <header class="dp-dept-card-hd">
        <div class="grow" style="min-width:0"><b>${esc(dept.name)}</b><span class="dim ell">${esc(dept.workspaceTitle)} · ${dept.headCount} 人</span></div>
        <button class="btn sm ghost" data-act="dept-exec-inspect" data-dept="${esc(dept.id)}">巡检详情 ›</button>
      </header>
      <div class="dp-dept-stats">
        <div><span>在途/总项目</span><b>${dept.activeCount} / ${dept.projectCount}</b></div>
        <div><span>平均进度</span><b>${dept.avgProgress}%</b></div>
        <div><span>待办工作项</span><b>${dept.openWorksCount}</b></div>
        <div><span>待审/待决</span><b>${dept.pendingReviews}/${dept.pendingApprovals}</b></div>
      </div>
      <div class="dp-dept-bar"><i style="width:${dept.avgProgress}%"></i></div>
      <div class="dp-dept-members ell" title="${esc(dept.members.map(m => `${m.name}(${m.title})`).join('、'))}">成员：${esc(dept.members.map(m => m.name).join('、') || '暂无')}</div>
      <div class="dp-dept-projs">${dept.projects.slice(0, 3).map(p => `<button class="dp-mini-proj" data-act="nb-enter" data-id="${p.id}"><span class="ell grow">${esc(p.name)}</span><span>${esc(p.stage)} ${p.overallPct}%</span></button>`).join('') || '<div class="dp-empty-sm">无直管在途项目（按职能协同全院）</div>'}</div>
    </article>`).join('')}</div>`
  } else {
    body = `<div class="dp-ledger-wrap"><table class="dp-ledger">
      <thead><tr><th>项目名称</th><th>业务线 / 牵头部门</th><th>当前阶段</th><th>进度</th><th>拟投金额</th><th>投前/投后估值</th><th>核心条款与摘要</th><th>待审/待决</th><th>直达</th></tr></thead>
      <tbody>${ex.sensitiveLedger.map(p => `<tr>
        <td><b>${esc(p.name)}</b><div class="dim" style="font-size:11px">${esc(p.industry)} · 负责人 ${esc(p.ownerName)}</div></td>
        <td><span>${esc(p.businessName)}</span><div class="dim" style="font-size:11px">${esc(p.deptName)}</div></td>
        <td><span class="tag ${p.status === 'active' ? 'blue' : ''} sm">${esc(p.stage)}</span><div class="dim" style="font-size:11px">${esc(P_STATUS[p.status] || p.status)}</div></td>
        <td><b>${p.overallPct}%</b></td>
        <td class="mono">${esc(p.fields?.amount || '—')}</td>
        <td class="mono">${esc(p.fields?.valuation || '—')}</td>
        <td class="dp-terms-cell" title="${esc(p.fields?.terms || p.desc || '')}">${esc(p.fields?.terms || p.desc || '—')}</td>
        <td>${p.myPendingVote ? '<span class="tag amber sm">待您表决</span>' : p.pendingApprovals ? `<span class="tag sm">表决 ${p.pendingApprovals}</span>` : ''}${p.pendingReviews ? ` <span class="tag blue sm">待审 ${p.pendingReviews}</span>` : (!p.pendingApprovals ? '<span class="dim">—</span>' : '')}</td>
        <td><div class="row" style="gap:4px"><button class="btn sm" data-act="nb-enter" data-id="${p.id}">研判</button><button class="btn sm ghost" data-act="nb-flowboard" data-p="${p.id}">门禁</button></div></td>
      </tr>`).join('')}</tbody>
    </table></div>`
  }
  return `<section class="dp-sec dp-exec-sec" id="dpExecSec">
    <div class="dp-sec-hd">
      <div><h2>管理层全局驾驶舱</h2><span class="dim">全机构唯一全内容权限 · 敏感要素、九部门巡检与投决中枢</span></div>
      <nav class="dp-tabs">${tabs.map(([k, lbl, cnt]) => `<button class="${tab === k ? 'on' : ''}" data-act="dept-exec-tab" data-tab="${k}">${esc(lbl)}<span class="n">${cnt}</span></button>`).join('')}</nav>
    </div>
    <div id="dpExecBody">${body}</div>
  </section>`
}

function renderSignatureSection(d, dp, ws) {
  const key = dp?.key ?? 'financial'
  const firstActive = d.projects.find(p => p.status === 'active') ?? d.projects[0]
  const pid = firstActive?.id ?? ''
  if (key === 'executive') return renderExecutiveCockpit(ws)
  if (key === 'industrial') {
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>产业投资四阶段全流程看板</h2><span class="dim">对齐《产业投资流程》：01 立项及承接 → 02 尽调及承做 → 03 落地及承销（募投）→ 04 管理与退出</span></div>
      ${renderIndustrialBoard(ws.industrialPhases, false)}
    </section>`
  }
  if (key === 'financial') {
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>股权投资六阶段漏斗</h2><span class="dim">项目机会 → 立项准备 → 尽职调查 → 投资决策 → 交易交割 → 投后管理</span></div>
      ${renderFinancialFunnel(ws.financialFunnel)}
    </section>`
  }
  if (key === 'finance') {
    const qs = dp?.workspaceHints?.quickQuestions ?? []
    const lanes = [
      { no: '01', title: '财报提取与口径核验', desc: '抽取资产负债表、利润表与现金流量表核心指标，排查审计底稿与 BP 自述背离。', act: 'go', view: 'extract', btn: '进入财报提取' },
      { no: '02', title: '三表勾稽与估值敏感性', desc: '调动 AI 核查收入确认、应收账龄及经营现金流背离，测算 PE/PS 动态估值区间。', act: 'dept-skill-run', p: pid, prompt: qs[2]?.[1] || qs[0]?.[1] || '', btn: '运行财务 AI 核查' },
      { no: '03', title: '交割先决条件与打款会签', desc: '复核验资证明、账户监管与交割先决条件，完成财务岗位交割确认会签。', act: 'nb-flowboard', p: pid, btn: '进入交割会签' },
    ]
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>财务尽调、估值与交割三段式工作流</h2><span class="dim">财务部专属业务闭环 · 全院项目进度同步可见便于提前排期</span></div>
      <div class="dp-lane-3">${lanes.map(l => `<article class="dp-lane-card">
        <div class="dp-lane-no">${l.no}</div><b>${esc(l.title)}</b><p>${esc(l.desc)}</p>
        <button class="btn sm" data-act="${l.act}" ${l.view ? `data-view="${l.view}"` : ''} ${l.p ? `data-p="${l.p}" data-id="${l.p}"` : ''} ${l.prompt ? `data-prompt="${esc(l.prompt)}"` : ''}>${esc(l.btn)} ›</button>
      </article>`).join('')}</div>
    </section>`
  }
  if (key === 'legal') {
    const qs = dp?.workspaceHints?.quickQuestions ?? []
    const lanes = [
      { no: '01', title: 'NDA 与框架协议标准件', desc: '从机构合规协议模板库调用标准 NDA、框架投资协议与增资扩股协议范本。', act: 'go', view: 'templates', btn: '打开协议模板库' },
      { no: '02', title: '法调排查与对赌红线审查', desc: 'AI 逐条提取回购、对赌、反稀释与优先清算条款，排查股权代持与重大涉诉风险。', act: 'dept-skill-run', p: pid, prompt: qs[0]?.[1] || '', btn: '启动条款红线审查' },
      { no: '03', title: '交易文件与落地确权会签', desc: '追踪正式交易文件签署、工商变更与落地确权节点，完成法务交割会签。', act: 'nb-flowboard', p: pid, btn: '进入法务会签' },
    ]
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>法务协议、尽调与确权三段式工作流</h2><span class="dim">法务部专属合规闭环 · 提前感知全院即将进入法调与交割阶段的项目</span></div>
      <div class="dp-lane-3">${lanes.map(l => `<article class="dp-lane-card">
        <div class="dp-lane-no">${l.no}</div><b>${esc(l.title)}</b><p>${esc(l.desc)}</p>
        <button class="btn sm" data-act="${l.act}" ${l.view ? `data-view="${l.view}"` : ''} ${l.p ? `data-p="${l.p}" data-id="${l.p}"` : ''} ${l.prompt ? `data-prompt="${esc(l.prompt)}"` : ''}>${esc(l.btn)} ›</button>
      </article>`).join('')}</div>
    </section>`
  }
  if (key === 'risk') {
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>独立风控预警雷达</h2><span class="dim">独立穿透监测退回重做、底稿数据冲突、准入缺口与待表决门禁（LP 与商业秘密合规隔离）</span></div>
      ${renderRiskAlertsList(ws.riskAlerts)}
    </section>`
  }
  if (key === 'postinv' || key === 'fund') {
    const isFund = key === 'fund'
    const title = isFund ? '产投承销与募投窗口雷达' : '即将交割入池项目预警雷达'
    const sub = isFund ? '实时捕捉处于尽调 / 投决 / 落地阶段的项目募资与承销协同窗口' : '提前关注进入投资决策与交易交割阶段的项目，无缝衔接归档与投后赋能'
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>${title}</h2><span class="dim">${sub}</span></div>
      ${isFund ? `<div class="dp-firewall">${icon('shield', 15)}<span><b>募资与项目底稿防火墙已生效：</b>基金运营部可实时掌握全院项目阶段进度与承销窗口，未授权项目的原始尽调底稿、估值与敏感商业秘密已自动隔离。</span></div>` : ''}
      ${ws.handoverWatch?.length ? `<div class="dp-watch-grid">${ws.handoverWatch.map(p => `<article class="dp-watch-card">
        <div class="row" style="gap:6px"><span class="tag blue sm">${esc(p.stage)}</span><span class="dim" style="font-size:11.5px">${esc(p.businessName)} · ${esc(p.deptName)}</span><span class="grow"></span><b>${p.overallPct}%</b></div>
        <h3 class="ell">${esc(p.name)}</h3>
        <div class="dp-dept-bar"><i style="width:${p.overallPct}%"></i></div>
        <div class="row" style="margin-top:8px"><span class="dim ell grow" style="font-size:11.5px">${esc(p.industry)} · 负责人 ${esc(p.ownerName)}</span>
          ${p.canOpen ? `<button class="btn sm" data-act="nb-enter" data-id="${p.id}">进工作台</button>` : '<button class="btn sm ghost" data-act="dept-prog-locked">脱敏进度</button>'}</div>
      </article>`).join('')}</div>` : '<div class="dp-all-clear">当前暂无处于窗口期的交割 / 承销预警项目</div>'}
    </section>`
  }
  if (key === 'it') {
    const sh = ws.systemHealth
    const items = sh?.items ?? []
    return `<section class="dp-sec dp-sig">
      <div class="dp-sec-hd"><h2>企业开箱就绪体检（${sh?.readyCount ?? 0}/${sh?.totalCount ?? 6} 项就绪 · ${sh?.scorePct ?? 0}%）</h2><span class="dim">系统配置、权限矩阵、多模型安全路由与审计合规健康度</span></div>
      <div class="dp-firewall">${icon('lock', 15)}<span><b>IT 运维与业务底稿隔离策略：</b>信息技术部负责组织架构、权限规则、流程版本、审计回滚与模型路由维护（可恢复误删项目壳），无资料查看与敏感字段权限，全院业务底稿正文与金额/估值/条款严格隔离。</span></div>
      <div class="dp-health-grid">${items.map(it => {
        const navParts = it.nav ? String(it.nav).split(':') : []
        const actionAttr = it.act
          ? `data-act="${esc(it.act)}"`
          : `data-act="go" data-view="${esc(navParts[0] || 'settings')}" ${navParts[1] ? `data-sub="${esc(navParts[1])}"` : ''}`
        return `<article class="dp-health-card ${it.ok ? 'ok' : 'warn'}">
          <div class="row" style="gap:8px"><span class="dot ${it.ok ? 'ok' : 'warn'}"></span><b class="grow">${esc(it.title)}</b><span class="tag ${it.ok ? 'real' : 'amber'} sm">${it.ok ? '已就绪' : '待完善'}</span></div>
          <p class="dim">${esc(it.detail)}</p>
          <button class="btn sm ghost" ${actionAttr}>前往配置 ›</button>
        </article>`
      }).join('')}</div>
    </section>`
  }
  return ''
}

function renderWorkQueue(ws) {
  const q = ws?.workQueue ?? []
  if (!q.length) return ''
  return `<section class="dp-sec">
    <div class="dp-sec-hd"><h2>本部门专属工作队列</h2><span class="dim">按本部门职责、待表决、待复核与个人任务自动聚合（共 ${q.length} 项）</span></div>
    <div class="dp-wq-list">${q.slice(0, 8).map(it => `<div class="dp-wq-row">
      <span class="tag ${esc(it.tone || '')} sm">${esc(it.badge)}</span>
      <b class="ell dp-wq-proj" title="${esc(it.projectName)}">${esc(it.projectName)}</b>
      <span class="ell grow">${esc(it.title)}</span>
      <span class="dim ell dp-wq-sub">${esc(it.sub || '')}</span>
      <button class="btn sm ${it.kind === 'approval' ? 'pri' : ''}" data-act="${esc(it.action || 'nb-enter')}" ${it.projectId ? `data-p="${esc(it.projectId)}" data-id="${esc(it.projectId)}"` : ''}>${esc(it.actionLabel || '处理')}</button>
    </div>`).join('')}</div>
  </section>`
}

/** 按业务条线与生命周期自动归类为清晰的项目板块 */
function groupProjectsIntoPlates(list) {
  const specs = [
    { key: 'financial', title: '财务投资 · 股权项目板块', sub: '项目机会 → 立项 → 尽调 → 投决 → 交割', icon: 'chart', tone: 'blue', match: p => p.status === 'active' && p.businessType === 'financial' && !['post', 'exit', 'archive'].includes(p.stageKind) },
    { key: 'industrial', title: '产业投资 · 资本招商板块', sub: '立项承接 → 尽调承做 → 落地承销 → 确权', icon: 'industry', tone: 'green', match: p => p.status === 'active' && p.businessType === 'industrial' && !['post', 'exit', 'archive'].includes(p.stageKind) },
    { key: 'postinv', title: '投后管理与退出板块', sub: '已投项目归档 · 季度经营赋能 · 退出推进', icon: 'shield', tone: 'cyan', match: p => p.status === 'active' && ['post', 'exit', 'archive'].includes(p.stageKind) },
    { key: 'other', title: '其他资本业务板块', sub: '并购重组 · 上市公司资本运作 · 基金协同', icon: 'grid', tone: 'violet', match: p => p.status === 'active' && !['financial', 'industrial'].includes(p.businessType) && !['post', 'exit', 'archive'].includes(p.stageKind) },
    { key: 'archived', title: '历史与已归档板块', sub: '已完成归档或决策否决的历史留痕项目', icon: 'history', tone: 'muted', match: p => p.status !== 'active' },
  ]
  return specs
    .map(sp => {
      const items = list.filter(sp.match)
      const avgPct = items.length ? Math.round(items.reduce((s, x) => s + (x.flow?.overallPct ?? x.overallPct ?? x.progress ?? 0), 0) / items.length) : 0
      return { ...sp, items, avgPct }
    })
    .filter(g => g.items.length > 0)
}

function projectCardHTML(p, tone) {
  const exp = S.nbExpanded === p.id
  const f = p.flow ?? { overallPct: p.progress ?? 0, stageDetails: [], readinessItems: [] }
  const pct = f.overallPct ?? p.progress ?? 0
  const missing = (f.readinessItems ?? []).filter(i => !i.ok)
  const badges = [
    p.myPendingVote ? '<span class="tag amber sm">待我表决</span>' : p.pendingApproval ? '<span class="tag sm">表决中</span>' : '',
    p.reviewCount ? `<span class="tag blue sm">${p.reviewCount} 项待审</span>` : '',
  ].filter(Boolean).join('')
  return `<article class="nb-pcard tone-${tone} ${exp ? 'open' : ''}">
    <div class="nb-pcard-top">
      <div class="nb-pcard-tags">
        <span class="nb-stage-pill tone-${tone}">${esc(p.stage || '立项')}</span>
        ${badges}
      </div>
      <div class="nb-pcard-pct"><b data-count="${pct}">${pct}</b><i>%</i></div>
    </div>
    <button class="nb-pcard-title-btn" data-act="nb-enter" data-id="${p.id}" title="进入「${esc(p.name)}」尽调与研判工作台">
      <h3 class="ell">${esc(p.name)}</h3>
      <p class="ell">${esc(p.industry || '综合')} · ${esc(p.businessName || '')}${p.status !== 'active' ? ` · ${esc(P_STATUS[p.status] || p.status)}` : ''}</p>
    </button>
    <div class="nb-pcard-prog">
      <div class="nb-pcard-bar"><i style="width:${pct}%"></i></div>
      <div class="nb-pcard-segs" aria-hidden="true">${(f.stageDetails ?? []).map(st => `<i class="${st.state}" title="${esc(st.name)} ${st.pct}%"><b style="width:${st.pct}%"></b></i>`).join('')}</div>
      <div class="nb-pcard-hint ell">${f.readinessOk ? '<span class="ok">本阶段必做成果已齐备</span>' : missing.length ? `待定稿：${esc(missing.slice(0, 2).map(i => i.work).join('、'))}` : `全周期共 ${f.stageDetails?.length || 0} 个阶段`}</div>
    </div>
    <footer class="nb-pcard-ft">
      <div class="nb-pcard-own">${avatar(p.ownerName || '未', 20)}<span class="ell">${esc(p.ownerName || '未指派')}</span><span class="dim">· 成果 ${p.deliverables?.length ?? 0}</span></div>
      <div class="nb-pcard-acts">
        <button class="btn sm ghost" data-act="nb-card-toggle" data-id="${p.id}" title="展开或收起各阶段详细进度与成果报送">${exp ? '收起' : '进度'}</button>
        <button class="btn sm ghost" data-act="nb-flowboard" data-p="${p.id}">门禁</button>
        <button class="btn sm pri" data-act="nb-enter" data-id="${p.id}">研判</button>
      </div>
    </footer>
  </article>`
}

function listHTML(d) {
  const dp = d.deptProfile
  if (!d.projects.length) {
    return `<div class="dp-empty-auth">
      ${icon('shield', 20)}
      <div class="grow">
        <b>当前账号（${esc(dp?.deptName || d.me.dept || '')}）暂无已授权穿透底稿的项目</b>
        <p class="dim">按企业四层权限策略，敏感业务底稿仅向项目团队成员、牵头部门及管理层开放；您可在下方「全院项目进度板块」实时查看各业务条线项目阶段与完成进度。</p>
      </div>
    </div>`
  }
  const bt = S.filters.bt || ''
  const q = (S.filters.q || '').trim()
  const mineIds = S.filters.mine && oaCache ? new Set([...oaCache.approvals.map(x => x.projectId), ...oaCache.reviews.map(x => x.projectId), ...oaCache.mySteps.map(x => x.projectId), ...oaCache.tasks.map(x => x.projectId).filter(Boolean)]) : null
  const list = d.projects.filter(p => (!bt || p.businessType === bt) && (!mineIds || mineIds.has(p.id)) && (!q || [p.name, p.company, p.industry].some(x => String(x || '').includes(q))))
  if (!list.length) {
    return `<div class="nb-empty"><p>当前筛选条件下没有匹配项目</p>${can('project.create') && can('material.upload') ? '<button class="btn pri" data-act="quick-project">带底稿快速立项</button>' : ''}</div>`
  }

  if (S.nbShelfMode === 'list') {
    return `<div class="nb-list-box">${list.map(p => {
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
          <span class="nb-caret">${icon('chev', 15)}</span>
        </div>
        ${exp ? renderFlowDrawer(p, justOpened === p.id) : ''}
      </article>`
    }).join('')}</div>`
  }

  const plates = groupProjectsIntoPlates(list)
  return `<div class="nb-plates">${plates.map(pl => {
    const expProj = pl.items.find(x => x.id === S.nbExpanded)
    return `<section class="nb-plate tone-${pl.tone}">
      <header class="nb-plate-hd">
        <span class="nb-plate-ic">${icon(pl.icon, 15)}</span>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:8px"><h3>${esc(pl.title)}</h3><span class="nb-plate-cnt">${pl.items.length} 个项目</span></div>
          <span class="dim">${esc(pl.sub)}</span>
        </div>
        <div class="nb-plate-avg"><span class="dim">板块均进度</span><b>${pl.avgPct}%</b></div>
      </header>
      <div class="nb-plate-grid" data-n="${pl.items.length}">${pl.items.map(p => projectCardHTML(p, pl.tone)).join('')}</div>
      ${expProj ? renderFlowDrawer(expProj, justOpened === expProj.id) : ''}
    </section>`
  }).join('')}</div>`
}

function progressBoardRowsHTML(board) {
  const f = S.progFilter || 'all'
  const list = (board ?? []).filter(p => {
    if (f === 'active') return p.status === 'active'
    if (f === 'financial') return p.businessType === 'financial'
    if (f === 'industrial') return p.businessType === 'industrial'
    return true
  })
  if (!list.length) return '<div class="dp-empty-sm">当前筛选下暂无项目进度记录</div>'
  const plates = groupProjectsIntoPlates(list)
  return plates.map(pl => `<div class="dp-prog-group tone-${pl.tone}">
    <div class="dp-prog-ghd">
      <span class="nb-plate-ic sm">${icon(pl.icon, 13)}</span>
      <b>${esc(pl.title)}</b>
      <span class="nb-plate-cnt">${pl.items.length}</span>
      <span class="grow"></span>
      <span class="dim">平均推进 ${pl.avgPct}%</span>
    </div>
    <div class="dp-prog-grid" data-n="${pl.items.length}">${pl.items.map(p => `<article class="dp-prog-row ${p.canOpen ? 'can-open' : 'locked'} tone-${pl.tone}">
      <div class="dp-prog-top">
        <div class="dp-prog-hd">
          <span class="nb-stage-pill tone-${pl.tone}">${esc(p.stage)}</span>
          ${p.readinessOk ? '<span class="tag real sm">准入齐备</span>' : ''}
        </div>
        <div class="dp-prog-pct"><b>${p.overallPct}</b><i>%</i></div>
      </div>
      <div class="dp-prog-main">
        <b class="ell" title="${esc(p.name)}">${esc(p.name)}</b>
        <div class="dp-prog-meta ell">
          <span>${esc(p.deptName)}</span>
          <span>负责人 ${esc(p.ownerName)}</span>
          <span>${esc(p.industry)}</span>
        </div>
      </div>
      <div class="dp-prog-track">
        <div class="nb-pcard-bar"><i style="width:${p.overallPct}%"></i></div>
        <div class="nb-mini dp-prog-bars" aria-hidden="true" title="各阶段推进比例">${(p.stageDetails ?? []).map(st => `<i class="${st.state}"><b style="width:${st.pct}%"></b></i>`).join('')}</div>
      </div>
      <div class="dp-prog-acts">
        <span class="dim" style="font-size:11px">${esc(P_STATUS[p.status] || p.status)}</span>
        <span class="grow"></span>
        ${p.canOpen
          ? `<button class="btn sm ghost" data-act="nb-flowboard" data-p="${p.id}">门禁</button><button class="btn sm pri" data-act="nb-enter" data-id="${p.id}">工作台</button>`
          : `<button class="btn sm ghost dp-locked-btn" data-act="dept-prog-locked" title="${esc(p.accessHint)}">${icon('lock', 12)}脱敏进度</button>`}
      </div>
    </article>`).join('')}</div>
  </div>`).join('')
}

function renderProgressBoard(ws) {
  const board = ws?.progressBoard ?? []
  if (!board.length) return ''
  const f = S.progFilter || 'all'
  const filters = [
    ['all', '全部', board.length],
    ['active', '在途', board.filter(p => p.status === 'active').length],
    ['financial', '财务投资', board.filter(p => p.businessType === 'financial').length],
    ['industrial', '产业投资', board.filter(p => p.businessType === 'industrial').length],
  ]
  return `<section class="dp-sec dp-prog-sec">
    <div class="dp-sec-hd">
      <div><h2>全院项目进度板块</h2><span class="dim">跨部门按业务条线实时同步阶段进度 · 未授权项目底稿与敏感字段严格隔离</span></div>
      <nav class="dp-tabs" id="dpProgTabs">${filters.map(([k, l, n]) => `<button class="${f === k ? 'on' : ''}" data-act="dept-prog-filter" data-f="${k}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</nav>
    </div>
    <div class="dp-prog-list" id="dpProgList">${progressBoardRowsHTML(board)}</div>
  </section>`
}

function renderAuthorizedProjectsSection(d, dp) {
  const bt = S.filters.bt || ''
  const authTitle = dp?.isExecutive ? '全机构项目板块' : '本部门授权项目板块'
  return `<section class="dp-sec nb-auth-sec">
    <div class="dp-sec-hd">
      <div><h2>${authTitle}（${d.projects.length}）</h2><span class="dim">${dp?.isExecutive ? '按财务投资 / 产业投资 / 投后退出分类卡片展示，点击进入底稿研判或展开阶段报送' : '按业务板块归类展示已授权项目进度，点击卡片直达底稿工作台'}</span></div>
      <div class="nb-shelf-tools">
        <div class="seg sm" role="group" aria-label="切换视图">
          <button class="${S.nbShelfMode !== 'list' ? 'on' : ''}" data-act="nb-view-mode" data-m="board">板块视图</button>
          <button class="${S.nbShelfMode === 'list' ? 'on' : ''}" data-act="nb-view-mode" data-m="list">列表视图</button>
        </div>
        <label class="nb-find">${icon('search', 14)}<input id="nbShelfQ" placeholder="筛选项目" value="${esc(S.filters.q || '')}" autocomplete="off"></label>
        ${can('project.create') && can('material.upload') ? `<button class="btn pri sm" data-act="quick-project" data-bt="${dp?.key === 'industrial' ? 'industrial' : 'financial'}">${icon('upload', 13)}快速立项</button>` : ''}
      </div>
    </div>
    ${d.projects.length ? `<nav class="rtabs nb-bt">${[['', '全部板块', d.projects.length], ...d.businessTypes.filter(b => d.projects.some(p => p.businessType === b.id)).map(b => [b.id, b.name, d.projects.filter(p => p.businessType === b.id).length])].map(([k, l, n]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</nav>` : ''}
    <div class="nb-list" id="nbList">${listHTML(d)}</div>
  </section>`
}

export function renderNotebookShelf(v) {
  const d = D()
  const dp = d.deptProfile
  const ws = getCachedWs(d)
  const fresh = firstPaint(`shelf:${d.me.id}:${dp?.key || ''}`)
  const key = dp?.key || 'financial'
  const zeroAuth = d.projects.length === 0
  const mainFlow = ws ? (
    key === 'it'
      ? `${renderSignatureSection(d, dp, ws)}
         ${renderAuthorizedProjectsSection(d, dp)}
         ${renderProgressBoard(ws)}`
      : zeroAuth
        ? `${renderProgressBoard(ws)}
           ${renderSignatureSection(d, dp, ws)}
           <section id="nbOaWrap">${oaInboxHTML(oaCache)}</section>
           ${renderAuthorizedProjectsSection(d, dp)}`
        : `${renderAuthorizedProjectsSection(d, dp)}
           ${renderSignatureSection(d, dp, ws)}
           <section id="nbOaWrap">${oaInboxHTML(oaCache)}</section>
           ${renderWorkQueue(ws)}
           ${renderProgressBoard(ws)}`
  ) : `<div class="dp-ws-loading"><span class="spin"></span><span>正在加载本部门专属操作台与分类项目板块…</span></div>
       ${renderAuthorizedProjectsSection(d, dp)}`

  v.innerHTML = `<div class="nb-shelf dp-shelf ${fresh ? 'enter' : ''}" data-dept="${esc(key)}">
    ${renderHero(d, dp, ws)}
    ${ws ? renderModules(ws) : ''}
    ${mainFlow}
    ${renderLayersFooter(d, dp)}
  </div>`
  if (fresh) entered(v)
  justOpened = null
  if (!ws) void ensureDeptWorkspace()
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

export async function openQuickProject(initialFiles = [], defaultBt = 'financial') {
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
    <div class="row"><label class="f grow">业务类型<select class="select" name="businessType">${opts(d.businessTypes.map(b => [b.id, b.name]), defaultBt)}</select></label>
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
  'quick-project': el => openQuickProject([], el?.dataset?.bt || (D()?.deptProfile?.key === 'industrial' ? 'industrial' : 'financial')),
  'nb-view-mode': el => {
    S.nbShelfMode = el.dataset.m === 'list' ? 'list' : 'board'
    renderNotebookShelf($('#view'))
  },
  'nb-card-toggle': (el, e) => {
    if (e?.target.closest('.nb-flow-drawer') && !e?.target.closest('[data-act="nb-card-toggle"]')) return
    S.nbExpanded = S.nbExpanded === el.dataset.id ? null : el.dataset.id
    justOpened = S.nbExpanded
    const box = $('#nbList')
    $('.nb-shelf')?.classList.remove('enter')
    if (box) { box.innerHTML = listHTML(D()); justOpened = null; if (S.nbExpanded) box.querySelector('.nb-flow-drawer')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) } else hooks.refresh()
  },
  'nb-open-folder': async el => { const r = await act('nb.folder.open', { projectId: el.dataset.p, filePath: el.dataset.fp }); if (r) toast(`已打开 ${r.opened}`, 'ok') },
  'nb-enter': el => {
    const id = el.dataset.id || el.dataset.p
    if (!id) return toast('当前暂无已授权可穿透底稿的项目', 'warn')
    closeDrawer(); S.sel = id; S.project = null; hooks.go('notebook', { id })
  },
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
  'go-tasks': () => hooks.go('tasks'),
  'dept-skill-run': el => {
    const pid = el.dataset.p || D()?.projects?.find(p => p.status === 'active')?.id || D()?.projects?.[0]?.id || ''
    const prompt = el.dataset.prompt || ''
    if (!pid) return ACT['dept-ai-prompt'](el)
    if (prompt) S.pendingNbPrompt = { projectId: pid, prompt }
    S.sel = pid; S.project = null; hooks.go('notebook', { id: pid })
  },
  'dept-ai-prompt': el => {
    const prompt = el.dataset.prompt || ''
    hooks.fill?.(prompt)
    toast('已将本部门专属 AI 指令填入右侧助手，按 Enter 立即生成', 'ok')
  },
  'dept-go-decision': el => {
    const d = D()
    const ws = getCachedWs(d)
    const turn = ws?.executive?.decisionQueue?.find(a => a.myTurn) ?? ws?.executive?.decisionQueue?.[0]
    const pid = turn?.projectId || d.projects.find(p => p.myPendingVote)?.id || d.projects.find(p => p.pendingApproval)?.id || el?.dataset?.p || d.projects[0]?.id
    if (!pid) return toast('当前暂无待表决项目', 'warn')
    S.sel = pid; hooks.go('flowboard', { id: pid })
  },
  'dept-exec-tab': el => {
    S.execTab = el.dataset.tab || 'overview'
    if (S.view === 'workbench' || S.view === 'pipeline') {
      renderNotebookShelf($('#view'))
      $('#dpExecSec')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  },
  'dept-exec-inspect': el => {
    const ws = getCachedWs(D())
    const dept = ws?.executive?.departments?.find(x => x.id === el.dataset.dept)
    if (!dept) return
    drawer(`${drawerHead(`${dept.name} · 管理层巡检`, `${dept.workspaceTitle} · 在编 ${dept.headCount} 人 · 平均进度 ${dept.avgProgress}%`)}
      <div class="body">
        <div class="dp-sec-hd" style="margin-bottom:8px"><h3>部门人员（${dept.headCount}）</h3></div>
        <div class="chips" style="margin-bottom:16px">${dept.members.map(m => `<span class="tag">${esc(m.name)} · ${esc(m.title)}</span>`).join('') || '<span class="dim">暂无成员</span>'}</div>
        <div class="dp-sec-hd" style="margin-bottom:8px"><h3>关联项目与敏感要素（${dept.projects.length}）</h3></div>
        <div class="dp-wq-list" style="margin-bottom:16px">${dept.projects.map(p => `<div class="dp-wq-row">
          <span class="tag ${p.status === 'active' ? 'blue' : ''} sm">${esc(p.stage)}</span>
          <b class="ell grow">${esc(p.name)}</b>
          <span class="dim mono" style="font-size:11.5px">${esc(p.amount)} / ${esc(p.valuation)}</span>
          <b>${p.overallPct}%</b>
          <button class="btn sm" data-act="nb-enter" data-id="${p.id}">打开</button>
        </div>`).join('') || '<div class="dp-empty-sm">暂无关联项目</div>'}</div>
        <div class="dp-sec-hd" style="margin-bottom:8px"><h3>待办工作项（${dept.openWorksCount}）</h3></div>
        <div class="dp-wq-list">${dept.openWorks.map(w => `<div class="dp-wq-row">
          ${w.required ? '<span class="tag amber sm">必做</span>' : '<span class="tag sm">协同</span>'}
          <b class="ell dp-wq-proj">${esc(w.projectName)}</b>
          <span class="ell grow">${esc(w.type)}</span>
          <span class="dim">${esc(w.assigneeName)}</span>
          <button class="btn sm ghost" data-act="nb-flowboard" data-p="${w.projectId}">门禁</button>
        </div>`).join('') || '<div class="dp-empty-sm">当前无积压工作项</div>'}</div>
      </div>`)
  },
  'dept-prog-filter': el => {
    S.progFilter = el.dataset.f || 'all'
    const ws = getCachedWs(D())
    const box = $('#dpProgList')
    if (box && ws) {
      box.innerHTML = progressBoardRowsHTML(ws.progressBoard)
      for (const b of $$('#dpProgTabs button')) b.classList.toggle('on', b.dataset.f === S.progFilter)
    }
  },
  'dept-prog-locked': () => {
    toast('当前账号未加入该项目团队：按权限策略仅展示脱敏阶段进度，底稿与金额/估值字段已隔离。如需查看详情请联系项目负责人或管理层授权。', 'warn')
  },
})

VIEWS.workbench = renderNotebookShelf
VIEWS.pipeline = renderNotebookShelf
