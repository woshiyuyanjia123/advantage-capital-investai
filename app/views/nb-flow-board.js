// 第三界面：企业全流程自主提交与四层权限协同看板（优于传统 OA：左下角成品直交 + 人工微调自主提交 + 岗位权限胶囊切换 + 全阶段门禁闭环）
import { S, D, ACT, VIEWS, hooks, $, esc, icon, get, act, toast, ficon, opts, DL_STATUS, WORK_STATUS, RULE } from '/api/investai?asset=ui.js'

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
  fb.projectId = pid
  fb.data = boardData
  const arts = boardData.artifacts?.items ?? []
  if (!fb.pickedArt && arts.length) fb.pickedArt = arts[0]
  const curStage = boardData.stages.find(s => s.current) ?? boardData.stages[0]
  if (!fb.pickedWork && curStage?.works?.length) fb.pickedWork = curStage.works[0]
  fb.loading = false
  if (S.view === 'flowboard') renderFlowBoard($('#view'))
}

export function renderFlowBoard(v) {
  if (!fb.data || fb.projectId !== (S.sel || D()?.projects?.[0]?.id)) {
    v.innerHTML = '<div class="page"><span class="spin"></span></div>'
    loadFlowBoard(S.sel)
    return
  }
  const x = S.project
  const p = x.project
  const b = fb.data
  v.innerHTML = `<div class="nb-ws">
    ${renderArtSubmitCol(p, b)}
    ${renderPipelineCol(x, p, b)}
    ${renderPermissionCol(x, p, b)}
  </div>`
}

function renderArtSubmitCol(p, b) {
  const arts = b.artifacts?.items ?? []
  const allWorks = b.stages.flatMap(s => s.works.map(w => [w.id, `${s.name} · ${w.type}${w.required ? ' (必做)' : ''}`]))
  const curW = fb.pickedWork?.id || allWorks[0]?.[0] || ''
  return `<div class="nb-col">
    <div class="nb-col-hd"><b>① 已编制工作成果库 (${arts.length})</b><span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-folder" data-p="${p.id}">📂 项目档案室</button></div>
    <div class="nb-sources" style="max-height:42%">
      ${arts.map((a, i) => `<div class="nb-art-item ${fb.pickedArt?.name === a.name ? 'on' : ''}" style="${fb.pickedArt?.name === a.name ? 'border-color:#3B82F6;background:#172E58' : ''}" data-act="fb-pick-art" data-i="${i}">
        ${ficon(a.ext, true)}<div class="grow" style="min-width:0"><div class="ell"><b>${esc(a.name)}</b></div>
          <div class="dim ell" style="font-size:10.5px">${(a.bytes / 1048576).toFixed(2)} MB · ${esc(a.summary || '')}</div></div>
        <span class="tag blue">选用</span></div>`).join('') || '<div class="empty">请先在尽调与研判工作台编制工作成果</div>'}
    </div>
    <div class="nb-col-hd" style="border-top:1px solid var(--line)"><b>② 原件报送 / 修订说明补录后报送阶段工作项</b></div>
    <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;flex:1;overflow:auto">
      <label class="f">目标阶段工作项<select class="select sm" id="fbWorkSel">${opts(allWorks, curW)}</select></label>
      <label class="f">人工修订说明 / 补充核验结论（留空则原件报送，填写则生成新版本报送）
        <textarea class="input area mono" id="fbLightEdit" style="height:115px" placeholder="可选：在此直接修订关键财务口径、核心结论或补充报审意见…">${esc(fb.lightText)}</textarea></label>
      <label class="dim" style="font-size:11.5px"><input type="checkbox" id="fbAutoRev" checked> 报送后自动提请复核（需当前岗位具备「提交审核」权限）</label>
      <label class="dim" style="font-size:11.5px"><input type="checkbox" id="fbAutoFin"> 若当前岗位具备「材料定稿」权限，直接确认为正式定稿版本</label>
      <div class="row"><button class="btn sm" data-act="nb-studio-ppt" data-p="${p.id}">路演PPT修订台</button>
        <button class="btn sm" data-act="nb-studio-word" data-p="${p.id}">尽调文书修订台</button></div>
      <button class="btn pri" data-act="fb-submit-now" data-p="${p.id}">${icon('check', 14)} 立即报送至所选阶段工作项</button>
    </div>
  </div>`
}

function renderPipelineCol(x, p, b) {
  const f = p.flow ?? { overallPct: p.progress ?? 0, curStagePct: 0, stageDetails: [] }
  return `<div class="nb-col">
    <div class="nb-flow-strip">
      <div class="row"><button class="btn ghost sm" data-act="go" data-view="notebook" data-sub="${p.id}">${icon('left', 13)}尽调与研判工作台</button>
        <b class="ell" style="font-size:14.5px">${esc(p.name)} · 阶段门禁与投决中心</b>
        <span class="pill st-3">全周期进度 ${f.overallPct}%</span><span class="grow"></span>
        <button class="btn sm" data-act="go" data-view="workbench">投研项目总览</button></div>
      <div class="nb-stage-bar"><i style="width:${f.overallPct}%"></i></div>
    </div>
    <div class="abody" style="flex:1;padding:12px 14px;overflow:auto">
      ${b.stages.map((st, idx) => `<div class="box" style="margin-bottom:10px;border-color:${st.current ? '#3B82F6' : 'var(--line)'}">
        <div class="row"><span class="pill ${st.current ? 'st-3' : 'st-4'}">阶段 ${idx + 1}/${b.stages.length} · ${esc(st.name)}</span>
          <b>完成度 ${f.stageDetails?.[idx]?.pct ?? 0}%</b><span class="grow"></span>
          ${st.gate ? `<span class="tag blue">门禁：${esc(st.gate.name)}（${esc(RULE[st.gate.rule] || '')}）</span>` : ''}</div>
        <div class="works" style="margin-top:8px">${st.works.map(w => renderWorkNodeCard(p, w)).join('') || '<div class="dim">本阶段无必做成果节点</div>'}</div>
      </div>`).join('')}
    </div>
  </div>`
}

function renderWorkNodeCard(p, w) {
  const dl = w.deliverable
  const P = w.perms ?? {}
  return `<div class="wcard"><div class="row"><b class="grow">${esc(w.type)}${w.required ? ' <span class="req">必做</span>' : ''}</b>
    <span class="pill ${dl ? `dl-${dl.status}` : ''}">${dl ? `${DL_STATUS[dl.status]} v${dl.v}` : WORK_STATUS[w.status] || w.status}</span></div>
    <div class="dim" style="font-size:11px;margin:4px 0">责任人：${esc(w.assigneeName)} · 可定稿：${esc((w.holders?.finalize ?? []).join('、') || '部门负责人/合伙人')}</div>
    <div class="wacts">
      <button class="btn sm pri" data-act="fb-slot-sub" data-w="${w.id}" data-t="${esc(w.type)}">把左侧成品交入此节点</button>
      ${dl && dl.status === 'draft' && dl.v ? `<button class="btn sm" data-act="fb-node-act" data-op="deliverable.submit" data-d="${dl.id}" ${P.submit?.ok ? '' : `title="${esc(P.submit?.why || '')}"`}>提交审核</button>` : ''}
      ${dl && dl.status === 'review' ? `<button class="btn sm pri" data-act="fb-node-act" data-op="deliverable.finalize" data-d="${dl.id}" ${P.finalize?.ok ? '' : `title="${esc(P.finalize?.why || '')}"`}>审核定稿</button>` : ''}
    </div></div>`
}

function renderPermissionCol(x, p, b) {
  const d = D()
  const caps = b.caps
  const pending = x.approvals?.find(a => a.status === 'pending')
  return `<div class="nb-col">
    <div class="nb-col-hd"><b>③ 岗位四层权限与门禁决策中心</b></div>
    <div class="nb-notes-list">
      <div class="box"><b>👤 一键切换岗位视角（免登出体验完整企业流转）</b>
        <div class="dim" style="font-size:11px;margin:4px 0 8px">当前：<b>${esc(d.me.name)}</b>（${esc(caps.roleNames.join('、'))}）</div>
        <div class="row" style="flex-wrap:wrap">${b.users.slice(0, 8).map(u => `<button class="btn sm ${u.id === d.me.id ? 'pri' : ''}" data-act="fb-switch-user" data-u="${u.id}">${esc(u.name)}·${esc(u.title)}</button>`).join('')}</div>
      </div>
      <div class="box"><b>🛡️ 当前岗位四层权限实时矩阵</b>
        <div class="kv" style="margin-top:6px">
          <div><span>1. 数据范围</span><b>${esc(caps.scopes.join(' / '))}</b></div>
          <div><span>2. 资料密级</span><b>最高可看 ≤ Level ${caps.clearance}</b></div>
          <div><span>3. 业务操作</span><b>${esc(caps.ops.length ? caps.ops.join('、') : '基础起草与提交（无定稿/表决权）')}</b></div>
          <div><span>4. 敏感字段</span><b>${esc(caps.categories.length ? caps.categories.join('、') : '金额/估值自动脱敏')}</b></div>
        </div></div>
      <div class="box"><b>⚖️ 阶段门禁与上会表决（${b.readiness.ok ? '✅ 准入已满足' : '⏳ 待齐备必做成果'}）</b>
        <div class="row" style="margin-top:8px;flex-wrap:wrap">
          ${pending ? `<button class="btn sm pri" data-act="fb-vote" data-a="${pending.id}" data-d="pass">表决：同意通过</button>
            <button class="btn sm" data-act="fb-vote" data-a="${pending.id}" data-d="return">退回补充</button>`
            : `<button class="btn sm pri" data-act="fb-gate" data-p="${p.id}" ${b.readiness.ok ? '' : 'disabled'}>发起本阶段门禁表决</button>`}
        </div></div>
    </div>
  </div>`
}

Object.assign(ACT, {
  'nb-flowboard': el => { const id = el.dataset.p || S.sel; S.sel = id; fb.projectId = null; hooks.go('flowboard', { id }) },
  'fb-pick-art': el => { const arts = fb.data?.artifacts?.items ?? []; fb.pickedArt = arts[Number(el.dataset.i)] ?? null; renderFlowBoard($('#view')) },
  'fb-submit-now': async el => {
    const pid = el.dataset.p || S.sel
    const workId = $('#fbWorkSel')?.value || fb.pickedWork?.id
    const editedText = $('#fbLightEdit')?.value?.trim() || ''
    const r = await act('nb.flow.submit', {
      projectId: pid, workId, artifactPath: fb.pickedArt?.fullPath, artifactName: fb.pickedArt?.name,
      editedText: editedText || undefined, autoSubmitReview: !!$('#fbAutoRev')?.checked, autoFinalize: !!$('#fbAutoFin')?.checked,
    })
    if (r) { toast(`✅ 已自主提交至「${r.workType}」v${r.version}（当前状态：${DL_STATUS[r.status] || r.status}）`, 'ok'); fb.lightText = ''; await hooks.reload({ files: false }); await loadFlowBoard(pid) }
  },
  'fb-slot-sub': async el => {
    $('#fbWorkSel') && ($('#fbWorkSel').value = el.dataset.w)
    await ACT['fb-submit-now']({ dataset: { p: S.sel } })
  },
  'fb-node-act': async el => {
    const r = await act(el.dataset.op, { id: el.dataset.d }, '✅ 节点状态已更新')
    if (r) { await hooks.reload({ files: false }); await loadFlowBoard(S.sel) }
  },
  'fb-switch-user': async el => {
    if (await act('persona', { userId: el.dataset.u }, '✅ 已切换岗位权限视角')) { await hooks.reload({ files: false }); await loadFlowBoard(S.sel) }
  },
  'fb-gate': async el => {
    if (await act('project.gate', { id: el.dataset.p }, '✅ 已发起阶段门禁表决')) { await hooks.reload({ files: false }); await loadFlowBoard(S.sel) }
  },
  'fb-vote': async el => {
    if (await act('approval.vote', { id: el.dataset.a, decision: el.dataset.d, opinion: '经第三界面审核通过' }, '✅ 表决已记录并推进流程')) { await hooks.reload({ files: false }); await loadFlowBoard(S.sel) }
  },
})
VIEWS.flowboard = renderFlowBoard
