// 流程提交（三栏）：左边选成果文件并提交，中间是各阶段的工作节点，右边是岗位权限和阶段门禁
import { S, D, ACT, VIEWS, hooks, $, $$, esc, icon, get, act, toast, ficon, opts, DL_STATUS, WORK_STATUS, RULE, firstPaint, entered } from '/api/investai?asset=ui.js'

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
  if (!fb.pickedArt && arts.length) fb.pickedArt = arts[0]
  const curStage = boardData.stages.find(s => s.current) ?? boardData.stages[0]
  if (!fb.pickedWork && curStage?.works?.length) fb.pickedWork = curStage.works[0]
  fb.loading = false
  if (S.view === 'flowboard') renderFlowBoard($('#view'))
}

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
    <header class="nb-pane-hd"><b>成果文件</b><span class="n">${arts.length}</span><span class="grow"></span>
      <button class="btn sm ghost ico" data-act="nb-open-folder" data-p="${p.id}" title="打开项目文件夹">${icon('folder', 14)}</button></header>
    <div class="nb-pick-list" data-keep="fbarts">
      ${arts.map((a, i) => `<button class="nb-art pick ${fb.pickedArt?.name === a.name ? 'on' : ''}" data-act="fb-pick-art" data-i="${i}">
        ${ficon(a.ext, true)}<span class="grow" style="min-width:0"><b class="ell">${esc(a.name)}</b>
          <span class="meta ell">${(a.bytes / 1048576).toFixed(2)} MB${a.summary ? ` · ${esc(a.summary)}` : ''}</span></span></button>`).join('') || `<button class="nb-empty-add" data-act="go" data-view="notebook" data-sub="${p.id}">${icon('spark', 16)}<span>去制作台生成</span></button>`}
    </div>
    <header class="nb-pane-hd"><b>提交到节点</b></header>
    <div class="nb-form">
      <label class="f">目标节点<select class="select" id="fbWorkSel">${opts(allWorks, curW)}</select></label>
      <label class="f">修改内容<textarea class="input area" id="fbLightEdit" placeholder="要改的数字、结论或补充说明；不填就提交原件">${esc(fb.lightText)}</textarea></label>
      <label class="nb-check"><input type="checkbox" class="ck" id="fbAutoRev" checked>提交后送审</label>
      <label class="nb-check"><input type="checkbox" class="ck" id="fbAutoFin">直接定稿</label>
      <div class="row"><button class="btn sm grow" data-act="nb-studio-ppt" data-p="${p.id}">${icon('slides', 13)}PPT 工具</button>
        <button class="btn sm grow" data-act="nb-studio-word" data-p="${p.id}">${icon('doc', 13)}Word 工具</button></div>
      <button class="btn pri nb-submit" data-act="fb-submit-now" data-p="${p.id}" ${fb.pickedArt ? '' : 'disabled'}>${icon('check', 14)}提交</button>
    </div>
  </section>`
}

function renderPipelineCol(x, p, b) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [] }
  return `<section class="nb-pane nb-mid">
    <header class="nb-mid-hd">
      <button class="btn ghost sm ico" data-act="go" data-view="notebook" data-sub="${p.id}" title="返回制作台">${icon('left', 15)}</button>
      <h2 class="ell" title="${esc(p.name)}">${esc(p.name)}</h2><span class="tag blue">${esc(p.stage)}</span>
      <span class="grow"></span>
      <button class="btn sm ghost" data-act="go" data-view="workbench">全部项目</button></header>
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
        ${st.works.map(w => renderWorkNode(w)).join('') || '<div class="nb-none">这个阶段没有工作节点</div>'}
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
      ${dl && dl.status === 'draft' && dl.v ? `<button class="btn sm" data-act="fb-node-act" data-op="deliverable.submit" data-d="${dl.id}" ${off(P.submit)}>送审</button>` : ''}
      ${dl && dl.status === 'review' ? `<button class="btn sm" data-act="fb-node-act" data-op="deliverable.finalize" data-d="${dl.id}" ${off(P.finalize)}>定稿</button>` : ''}
      <button class="btn sm go" data-act="fb-slot-sub" data-w="${w.id}" data-t="${esc(w.type)}" ${fb.pickedArt ? '' : 'disabled'}>交到这里</button>
    </div></div>`
}

const SCOPE = { own: '本人', dept: '本部门', assigned: '指定授权', postinv: '投后', all: '全机构' }
const CATEGORY = { amount: '金额', valuation: '估值', terms: '条款', fund_lp: 'LP 信息', trade_secret: '商业秘密' }
const LEVEL = ['公开', '内部', '机密', '绝密']

function renderPermissionCol(x, p, b) {
  const d = D()
  const caps = b.caps
  const pending = x.approvals?.find(a => a.status === 'pending')
  return `<section class="nb-pane nb-right">
    <div class="nb-right-scroll" data-keep="fbright">
      <header class="nb-pane-hd sticky"><b>阶段门禁</b><span class="grow"></span><span class="tag ${b.readiness.ok ? 'real' : 'amber'}">${b.readiness.ok ? '必做项已齐' : '必做项未齐'}</span></header>
      <div class="nb-gate">
        ${pending ? `<button class="btn pri grow" data-act="fb-vote" data-a="${pending.id}" data-d="pass">同意</button>
          <button class="btn grow" data-act="fb-vote" data-a="${pending.id}" data-d="return">退回补充</button>`
          : `<button class="btn pri grow" data-act="fb-gate" data-p="${p.id}" ${b.readiness.ok ? '' : 'disabled'}>${icon('vote', 14)}发起表决</button>`}
      </div>
      <header class="nb-pane-hd sticky"><b>岗位</b><span class="n">${esc(caps.roleNames.join('、'))}</span></header>
      ${b.users.slice(0, 8).map(u => `<button class="nb-role ${u.id === d.me.id ? 'on' : ''}" data-act="fb-switch-user" data-u="${u.id}">
        <i></i><b>${esc(u.name)}</b><span class="grow ell">${esc(u.title)}</span></button>`).join('')}
      <header class="nb-pane-hd sticky"><b>权限</b></header>
      <div class="kv nb-kv">
        <div><span>数据范围</span><b>${esc(caps.scopes.map(s => SCOPE[s] ?? s).join('、'))}</b></div>
        <div><span>资料密级</span><b>${esc(LEVEL[caps.clearance] ?? caps.clearance)}及以下</b></div>
        <div><span>业务操作</span><b>${esc(caps.ops.length ? caps.ops.join('、') : '起草和提交')}</b></div>
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
    const r = await act('nb.flow.submit', {
      projectId: pid, workId, artifactPath: fb.pickedArt?.fullPath, artifactName: fb.pickedArt?.name,
      editedText: editedText || undefined, autoSubmitReview: !!$('#fbAutoRev')?.checked, autoFinalize: !!$('#fbAutoFin')?.checked,
    })
    if (r) { toast(`已提交到“${r.workType}” v${r.version}，${DL_STATUS[r.status] || r.status}`, 'ok'); fb.lightText = ''; if ($('#fbLightEdit')) $('#fbLightEdit').value = ''; await again() }
  },
  'fb-slot-sub': async el => {
    if ($('#fbWorkSel')) $('#fbWorkSel').value = el.dataset.w
    await ACT['fb-submit-now']({ dataset: { p: S.sel } })
  },
  'fb-node-act': async el => { if (await act(el.dataset.op, { id: el.dataset.d }, '节点状态已更新')) await again() },
  'fb-switch-user': async el => { if (await act('persona', { userId: el.dataset.u }, '已切换岗位')) await again() },
  'fb-gate': async el => { if (await act('project.gate', { id: el.dataset.p }, '已发起门禁表决')) await again() },
  'fb-vote': async el => {
    if (await act('approval.vote', { id: el.dataset.a, decision: el.dataset.d, opinion: el.dataset.d === 'pass' ? '同意' : '退回补充' }, '表决已记录')) await again()
  },
})
VIEWS.flowboard = renderFlowBoard
