// 阶段门禁与投决中心（三栏）：左边选工作成果并报送，中间是各阶段的工作项（支持催办），右边是决策表决、交接简报和岗位权限
import { S, D, ACT, VIEWS, hooks, $, $$, esc, md, icon, get, act, toast, ficon, opts, dialog, DL_STATUS, WORK_STATUS, RULE, firstPaint, entered, can } from '/api/investai?asset=ui.js'

let fb = { projectId: null, data: null, pickedArt: null, pickedWork: null, lightText: '', loading: false }

export async function loadFlowBoard(projectId) {
  const pid = projectId || S.sel || D()?.projects?.[0]?.id
  if (!pid) return
  S.sel = pid
  fb.loading = true
  const [projData, boardData] = await Promise.all([
    get('project', { id: pid }),
    get('nb.flow.board', { projectId: pid }),
  ])
  S.project = projData
  if (fb.projectId !== pid) { fb.pickedArt = null; fb.pickedWork = null }
  fb.projectId = pid
  fb.data = boardData
  const arts = boardData.artifacts?.items ?? []
  if (S.fbPickArtName) {
    fb.pickedArt = arts.find(a => a.name === S.fbPickArtName) ?? fb.pickedArt
    S.fbPickArtName = null
  }
  if (!fb.pickedArt && arts.length) fb.pickedArt = arts[0]
  const curStage = boardData.stages.find(s => s.current) ?? boardData.stages[0]
  if (!fb.pickedWork && curStage?.works?.length) fb.pickedWork = curStage.works[0]
  fb.loading = false
  if (S.view === 'flowboard') renderFlowBoard($('#view'))
}
hooks.loadFlowBoard = loadFlowBoard

const no2 = i => String(i + 1).padStart(2, '0')

export function renderFlowBoard(v) {
  if (!fb.data || fb.projectId !== (S.sel || D()?.projects?.[0]?.id)) {
    v.innerHTML = '<div class="nb-loading"><span class="spin"></span></div>'
    loadFlowBoard(S.sel)
    return
  }
  const x = S.project
  const p = x.project
  const b = fb.data
  const fresh = firstPaint(`fb:${p.id}`)
  const keep = Object.fromEntries($$('[data-keep]', v).map(el => [el.dataset.keep, el.scrollTop]))
  const sel = $('#fbWorkSel')?.value
  if ($('#fbLightEdit')) fb.lightText = $('#fbLightEdit').value
  v.innerHTML = `<div class="nb-ws nb-fb ${fresh ? 'enter' : ''}">
    ${renderArtSubmitCol(p, b, sel)}
    ${renderPipelineCol(x, p, b)}
    ${renderPermissionCol(x, p, b)}
  </div>`
  for (const el of $$('[data-keep]', v)) el.scrollTop = keep[el.dataset.keep] ?? 0
  if (fresh) { entered(v); v.querySelector('.nb-fb-stage.cur')?.scrollIntoView({ block: 'start' }) }
}

function renderArtSubmitCol(p, b, sel) {
  const arts = b.artifacts?.items ?? []
  const allWorks = b.stages.flatMap(s => s.works.map(w => [w.id, `${s.name} · ${w.type}${w.required ? '（必做）' : ''}`]))
  const curW = sel || fb.pickedWork?.id || allWorks[0]?.[0] || ''
  return `<section class="nb-pane nb-left">
    <header class="nb-pane-hd"><b>工作成果</b><span class="n">${arts.length}</span><span class="grow"></span>
      <button class="btn sm ghost ico" data-act="nb-open-folder" data-p="${p.id}" title="项目档案室">${icon('folder', 14)}</button></header>
    <div class="nb-pick-list" data-keep="fbarts">
      ${arts.map((a, i) => `<button class="nb-art pick ${fb.pickedArt?.name === a.name ? 'on' : ''}" data-act="fb-pick-art" data-i="${i}">
        ${ficon(a.ext, true)}<span class="grow" style="min-width:0"><b class="ell">${esc(a.name)}</b>
          <span class="meta ell" title="${esc(a.summary || '')}">${esc(a.summary || `${(a.bytes / 1048576).toFixed(2)} MB`)}</span></span></button>`).join('') || `<button class="nb-empty-add" data-act="go" data-view="notebook" data-sub="${p.id}">${icon('spark', 16)}<span>去工作台编制成果</span></button>`}
    </div>
    <header class="nb-pane-hd"><b>报送到工作项</b></header>
    <div class="nb-form">
      <label class="f">目标工作项<select class="select" id="fbWorkSel">${opts(allWorks, curW)}</select></label>
      <label class="f">修订说明<textarea class="input area" id="fbLightEdit" placeholder="要修订的财务口径、结论或报审意见；不填就报送原件">${esc(fb.lightText)}</textarea></label>
      <label class="nb-check"><input type="checkbox" class="ck" id="fbAutoRev" checked>报送后提请复核</label>
      <label class="nb-check"><input type="checkbox" class="ck" id="fbAutoFin">直接确认定稿</label>
      <div class="row"><button class="btn sm grow" data-act="nb-studio-ppt" data-p="${p.id}">${icon('slides', 13)}路演 PPT</button>
        <button class="btn sm grow" data-act="nb-studio-word" data-p="${p.id}">${icon('doc', 13)}尽调文书</button></div>
      <button class="btn pri nb-submit" data-act="fb-submit-now" data-p="${p.id}">${icon('check', 14)}报送</button>
    </div>
  </section>`
}

function renderPipelineCol(x, p, b) {
  if (x?.project?.id) S.project = x
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [] }
  return `<section class="nb-pane nb-mid">
    <header class="nb-mid-hd">
      <button class="btn ghost sm ico" data-act="go" data-view="notebook" data-sub="${p.id}" title="尽调与研判工作台">${icon('left', 15)}</button>
      <h2 class="ell" title="${esc(p.name)}">${esc(p.name)}</h2><span class="tag blue">${esc(p.stage)}</span>
      <span class="grow"></span>
      ${can('project.member') ? `<button class="btn sm ghost" data-act="members">成员授权</button>` : ''}
      ${can('project.edit') ? `<button class="btn sm ghost" data-act="edit-fields">项目字段</button>` : ''}
      ${can('fill.manage') ? `<button class="btn sm ghost" data-act="fill-new">外部填报</button>` : ''}
      <button class="btn sm ghost" data-act="fb-handover" data-p="${p.id}" title="一键汇总项目要素、阶段准入、底稿与待办交接包">交接简报</button>
      <button class="btn sm ghost" data-act="open-project" data-id="${p.id}" title="查看会议纪要、提取台账与历史快照回滚">全景台账</button>
      <button class="btn sm ghost" data-act="go" data-view="workbench">投研项目总览</button></header>
    <div class="nb-track">
      <div class="nb-track-pct"><b data-count="${f.overallPct}">${f.overallPct}</b><i>%</i></div>
      <div class="nb-track-segs">${(f.stageDetails ?? []).map((st, i) => `<button class="nb-seg ${st.state}" data-act="fb-jump" data-i="${i}" title="${esc(st.name)} ${st.pct}%">
        <span class="bar"><i style="width:${st.pct}%"></i></span><span class="nm ell"><b>${no2(st.index)}</b><span class="t"> ${esc(st.name)}</span></span></button>`).join('')}</div>
    </div>
    <div class="nb-fb-stages" data-keep="fbmid">
      ${b.stages.map((st, idx) => `<section class="nb-fb-stage ${st.current ? 'cur' : ''}" data-stage="${idx}">
        <header><span class="no">${no2(idx)}</span><h3>${esc(st.name)}</h3>${st.current ? '<span class="tag blue">当前</span>' : ''}
          <span class="grow"></span>${st.gate ? `<span class="gate" title="${esc(RULE[st.gate.rule] || '')}">${icon('vote', 12)}${esc(st.gate.name)}</span>` : ''}
          <span class="pc">${f.stageDetails?.[idx]?.pct ?? 0}%</span></header>
        ${st.works.map(w => renderWorkNode(w)).join('') || '<div class="nb-none">这个阶段没有工作项</div>'}
      </section>`).join('')}
    </div>
  </section>`
}

function renderWorkNode(w) {
  const dl = w.deliverable
  const P = w.perms ?? {}
  const off = c => c?.ok === false ? `disabled title="${esc(c.why || '当前岗位不能操作')}"` : ''
  return `<div class="nb-node ${fb.pickedWork?.id === w.id ? 'on' : ''}">
    <div class="grow" style="min-width:0"><div class="nm"><b>${esc(w.type)}</b>${w.required ? '<span class="req">必做</span>' : ''}</div>
      <div class="meta ell">${esc(w.assigneeName)} · 定稿：${esc((w.holders?.finalize ?? []).join('、') || '部门负责人、合伙人')}</div></div>
    <span class="pill ${dl ? `dl-${dl.status}` : `ws-${w.status}`}">${dl ? `${DL_STATUS[dl.status]} v${dl.v}` : WORK_STATUS[w.status] || w.status}</span>
    <div class="acts">
      ${(!dl || dl.status !== 'final') && w.assignee ? `<button class="btn sm ghost" data-act="fb-nudge" data-p="${S.sel}" data-w="${w.id}" title="向负责人或复核人发送站内与群消息催办提醒">催办</button>` : ''}
      ${dl && dl.status === 'draft' && dl.v ? `<button class="btn sm" data-act="fb-node-act" data-op="deliverable.submit" data-d="${dl.id}" ${off(P.submit)}>提请复核</button>` : ''}
      ${dl && dl.status === 'review' ? `<button class="btn sm" data-act="fb-node-act" data-op="deliverable.finalize" data-d="${dl.id}" ${off(P.finalize)}>确认定稿</button>` : ''}
      <button class="btn sm go" data-act="fb-slot-sub" data-w="${w.id}" data-t="${esc(w.type)}" ${fb.pickedArt ? '' : 'disabled'}>报送至此</button>
    </div></div>`
}

const SCOPE = { own: '本人', dept: '本部门', assigned: '指定授权', postinv: '投后', all: '全机构' }
const CATEGORY = { amount: '金额', valuation: '估值', terms: '条款', fund_lp: 'LP 信息', trade_secret: '商业秘密' }
const LEVEL = ['公开', '内部', '机密', '绝密']

const FB_OUTCOME_LABEL = { pass: '同意', hold: '继续持有', return: '退回补充', reject: '否决' }
const FB_OUTCOME_CLS = { pass: 'pri', hold: '', return: '', reject: 'danger' }

function renderPermissionCol(x, p, b) {
  const d = D()
  const caps = b.caps
  const saasStatic = d.mode === 'saas' || d.settings?.desktop?.personaSwitch === false
  const pending = x.approvals?.find(a => a.status === 'pending')
  const lacking = pending ? [] : (b.readiness?.items ?? []).filter(i => !i.ok)
  const outcomes = Object.entries(pending?.gate?.outcomes ?? { pass: {}, return: {} })
  return `<section class="nb-pane nb-right">
    <div class="nb-right-scroll" data-keep="fbright">
      <header class="nb-pane-hd sticky"><b>决策节点</b><span class="grow"></span><span class="tag ${b.readiness.ok ? 'real' : 'amber'}">${b.readiness.ok ? '已满足准入' : `${lacking.length || ''} 项待定稿`}</span></header>
      <div class="nb-gate" style="flex-wrap:wrap;gap:6px">
        ${pending ? `${outcomes.map(([k, v]) => `<button class="btn ${FB_OUTCOME_CLS[k] || ''} grow" data-act="fb-vote" data-a="${pending.id}" data-d="${k}" title="${esc(v?.label || '')}">${esc(FB_OUTCOME_LABEL[k] ?? v?.label ?? k)}</button>`).join('')}
          <button class="btn sm ghost" data-act="fb-vote" data-a="${pending.id}" data-recuse="1">申请回避</button>
          <button class="btn sm ghost" data-act="fb-nudge" data-p="${p.id}" data-a="${pending.id}" title="向尚未投票的表决人发送催办提醒">${icon('bell', 12)}催办表决</button>`
          : `<button class="btn grow ${b.readiness.ok ? 'pri' : 'nope'}" data-act="fb-gate" data-p="${p.id}">${icon('vote', 14)}发起本阶段决策表决</button>`}
      </div>
      ${lacking.length ? `<div class="nb-lack" id="fbLack">${lacking.map(i => `<div><b class="ell">${esc(i.work)}</b><span>${esc(i.why || i.status || '待定稿')}</span></div>`).join('')}</div>` : ''}
      <header class="nb-pane-hd sticky"><b>岗位</b><span class="n">${esc(caps.roleNames.join('、'))}</span></header>
      ${b.users.slice(0, 8).map(u => saasStatic
        ? `<div class="nb-role ${u.id === d.me.id ? 'on' : ''}"><i></i><b>${esc(u.name)}</b><span class="grow ell">${esc(u.title)}</span></div>`
        : `<button class="nb-role ${u.id === d.me.id ? 'on' : ''}" data-act="fb-switch-user" data-u="${u.id}"><i></i><b>${esc(u.name)}</b><span class="grow ell">${esc(u.title)}</span></button>`).join('')}
      <header class="nb-pane-hd sticky"><b>权限</b></header>
      <div class="kv nb-kv">
        <div><span>数据范围</span><b>${esc(caps.scopes.map(s => SCOPE[s] ?? s).join('、'))}</b></div>
        <div><span>底稿密级</span><b>${esc(LEVEL[caps.clearance] ?? caps.clearance)}及以下</b></div>
        <div><span>业务操作</span><b>${esc(caps.ops.length ? caps.ops.join('、') : '起草和报送')}</b></div>
        <div><span>敏感字段</span><b>${esc(caps.categories.length ? caps.categories.map(c => CATEGORY[c] ?? c).join('、') : '已脱敏')}</b></div>
      </div>
    </div>
  </section>`
}

const again = async () => { await hooks.reload({ files: false }); await loadFlowBoard(S.sel) }

Object.assign(ACT, {
  'nb-flowboard': el => { const id = el.dataset.p || S.sel; S.sel = id; fb.projectId = null; hooks.go('flowboard', { id }) },
  'fb-pick-art': el => { const arts = fb.data?.artifacts?.items ?? []; fb.pickedArt = arts[Number(el.dataset.i)] ?? null; renderFlowBoard($('#view')) },
  'fb-jump': el => $(`.nb-fb-stage[data-stage="${el.dataset.i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
  'fb-submit-now': async el => {
    const pid = el.dataset.p || S.sel
    const workId = $('#fbWorkSel')?.value || fb.pickedWork?.id
    const editedText = $('#fbLightEdit')?.value?.trim() || ''
    if (!fb.pickedArt && !editedText) { toast('先选一份工作成果，或写上修订说明', 'deny'); $('#fbLightEdit')?.focus(); return }
    const r = await act('nb.flow.submit', {
      projectId: pid, workId, artifactPath: fb.pickedArt?.fullPath, artifactName: fb.pickedArt?.name,
      editedText: editedText || undefined, autoSubmitReview: !!$('#fbAutoRev')?.checked, autoFinalize: !!$('#fbAutoFin')?.checked,
    })
    if (r) { toast(`已报送至「${r.workType}」v${r.version}，${DL_STATUS[r.status] || r.status}`, 'ok'); fb.lightText = ''; if ($('#fbLightEdit')) $('#fbLightEdit').value = ''; await again() }
  },
  'fb-slot-sub': async el => {
    if ($('#fbWorkSel')) $('#fbWorkSel').value = el.dataset.w
    fb.pickedWork = { id: el.dataset.w }
    await ACT['fb-submit-now']({ dataset: { p: S.sel } })
  },
  'fb-node-act': async el => { if (await act(el.dataset.op, { id: el.dataset.d }, '工作项状态已更新')) await again() },
  'fb-switch-user': async el => { if (await act('persona', { userId: el.dataset.u }, '已切换岗位')) await again() },
  // 准入没满足时不发请求，直接说还差哪几项
  'fb-gate': async el => {
    const rd = fb.data?.readiness
    if (rd && !rd.ok) {
      const miss = (rd.items ?? []).filter(i => !i.ok).map(i => `${i.work}（${i.why || i.status || '待定稿'}）`).join('、')
      const box = $('#fbLack')
      if (box) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); box.scrollIntoView({ block: 'nearest' }) }
      return toast(`还有必做工作没定稿，暂时不能发起表决：${miss || '请先把本阶段必做项定稿'}`, 'deny')
    }
    if (await act('project.gate', { id: el.dataset.p }, '已发起阶段决策表决')) await again()
  },
  'fb-vote': async el => {
    if (el.dataset.recuse === '1') {
      const r = await dialog(`<h3>申请利益回避</h3><p class="dim">确认回避本轮决策投票？投票人数统计将排除您。</p>
        <label class="f">回避说明（可选）<input class="input" name="opinion" placeholder="例如：存在关联利益或亲属关系"></label>
        <div class="acts"><button class="btn" type="button" data-dlg="no">取消</button><button class="btn pri" type="button" data-dlg="ok">确认回避</button></div>`)
      if (!r) return
      if (await act('approval.vote', { id: el.dataset.a, recuse: true, opinion: r.opinion?.trim() || '利益回避' }, '已记录回避')) await again()
      return
    }
    const dec = el.dataset.d
    const label = FB_OUTCOME_LABEL[dec] || dec
    let opinion = '同意'
    if (dec !== 'pass') {
      const r = await dialog(`<h3>${esc(label)} · 填写决策意见</h3>
        <label class="f">意见 / 理由（必填）<textarea class="input area" name="opinion" required placeholder="请说明${esc(label)}的具体理由与后续要求"></textarea></label>
        <div class="acts"><button class="btn" type="button" data-dlg="no">取消</button><button class="btn ${dec === 'reject' ? 'danger' : 'pri'}" type="button" data-dlg="ok">确认${esc(label)}</button></div>`)
      if (!r || !r.opinion?.trim()) return
      opinion = r.opinion.trim()
    }
    if (await act('approval.vote', { id: el.dataset.a, decision: dec, opinion }, '表决已记录')) await again()
  },
  'fb-nudge': async el => {
    const pid = el.dataset.p || S.sel
    const r = await act('nb.oa.nudge', { projectId: pid, approvalId: el.dataset.a || undefined, workId: el.dataset.w || undefined })
    if (r) toast(`已向 ${r.notified.join('、')} 发送催办通知`, 'ok')
  },
  'fb-handover': async el => {
    const pid = el.dataset.p || S.sel
    const r = await act('nb.oa.handover', { projectId: pid, saveAsNote: true })
    if (!r) return
    const res = await dialog(`<h3>${esc(r.title)}</h3><div class="infobox">已同步保存至本项目「尽调纪要」，便于团队岗位交接或投委会前速览。</div>
      <div class="paper" style="max-height:52vh;overflow:auto"><div class="md">${md(r.markdown)}</div></div>
      <div class="acts"><button class="btn" type="button" data-dlg="no">关闭</button><button class="btn pri" type="button" data-dlg="ok">复制简报全文</button></div>`, { wide: true })
    if (res) {
      await navigator.clipboard?.writeText(r.markdown).catch(() => {})
      toast('交接与上会简报已复制到剪贴板', 'ok')
    }
  },
})
VIEWS.flowboard = renderFlowBoard
