// 工作台、项目管理（按业务类型 / 阶段）、任务、会议纪要
import { S, D, ACT, VIEWS, hooks, $, esc, md, icon, avatar, get, post, act, toast, dialog, drawer, drawerHead, closeDrawer, menuAt, mi, can, canOp, proj, userName, fmt, ymd, rel, due, opts, empty, pick, toB64, rawUrl, P_STATUS, RULE, ficon } from '/api/investai?asset=ui.js'

const STAGE_TONE = { pre: 0, diligence: 1, decision: 2, execution: 2, post: 3, exit: 4, archive: 4 }
const stagePill = p => `<span class="pill st-${STAGE_TONE[p.stageKind] ?? 3}">${esc(p.stage ?? '—')}</span>`
const statusPill = p => `<span class="pill ps-${p.status}">${esc(p.statusLabel ?? P_STATUS[p.status])}</span>`

// ───────── 工作台 ─────────
VIEWS.workbench = async v => {
  const d = D()
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>工作台</h1><p>${esc(d.me.name)}，${new Date().getHours() < 12 ? '上午好' : '下午好'}。这里汇总需要你处理的事项：待表决、待审核、到期任务与通知。</p></div>
    ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}录入项目机会</button>` : ''}</div>
    <div class="kpis">${[['grid', '#1B3466', '#93C5FD', d.kpi.active, '进行中项目'], ['vote', '#3A2C0F', '#FBBF24', d.kpi.pending, '待我处理'], ['edit', '#2D2257', '#C4B5FD', d.kpi.review, '成果待审核'], ['check', '#0D3B2E', '#6EE7B7', d.kpi.weekFinal, '本周定稿']].map(([ic, bg, c, n, l]) => `<div class="kpi"><span class="ic" style="background:${bg};color:${c}">${icon(ic, 20)}</span><div><div class="v">${n}</div><div class="l">${l}</div></div></div>`).join('')}</div>
    <div class="box" id="wbNext" style="margin-bottom:12px"><h3>${icon('spark', 15)}轮到你<span class="dim" style="font-weight:400;margin-left:6px">各项目「下一步」中需要你处理的事项</span></h3><span class="spin"></span></div>
    <div class="wb"><div class="box" id="wbApprovals"><h3>${icon('vote', 15)}待我表决</h3><span class="spin"></span></div>
      <div class="box" id="wbReview"><h3>${icon('edit', 15)}待审核成果</h3></div>
      <div class="box" id="wbTasks"><h3>${icon('cal', 15)}我的任务</h3><span class="spin"></span></div>
      <div class="box" id="wbNotif"><h3>${icon('bell', 15)}最新动态</h3><span class="spin"></span></div></div>
    <div class="box" style="margin-top:12px"><h3>${icon('grid', 15)}我参与的项目<span class="grow"></span><button class="lnk" data-act="go" data-view="pipeline">全部 ›</button></h3>${projectTable(d.projects.filter(p => p.status === 'active' && (p.owner === d.me.id || p.members?.some(m => m.userId === d.me.id))).slice(0, 8))}</div></div>`
  const [approvals, tasks, notes, next] = await Promise.all([get('approvals').catch(() => []), get('tasks').catch(() => []), get('notifications').catch(() => []), get('mynext').catch(() => [])])
  const box = (id, html) => { const el = $(id); if (el) el.innerHTML = el.querySelector('h3').outerHTML + html }
  box('#wbNext', next.length ? `<div class="guide">${next.map((g, i) => `<div class="gi mine"><span class="no">${i + 1}</span><div class="grow"><div><b>${esc(g.project)}</b> · ${esc(g.text)}</div></div><button class="btn sm pri" data-act="open-project" data-id="${g.projectId}">去处理</button></div>`).join('')}</div>` : empty('目前没有轮到你处理的事项。可以在「项目管理」查看各项目进展。'))
  box('#wbApprovals', approvals.filter(a => !a.votes.some(x => x.userId === d.me.id) && !a.recused.includes(d.me.id)).map(a => `<div class="li2" data-act="open-project" data-id="${a.projectId}"><div class="grow"><b>${esc(a.gate.name)}</b> · ${esc(a.project)}<div class="dim">${esc(RULE[a.gate.rule])} · 已表决 ${a.votes.length}/${a.voters.length - a.recused.length} · 发起 ${rel(a.requestedAt)}</div></div><span class="btn sm pri">去表决</span></div>`).join('') || empty('没有待表决事项'))
  const reviews = d.projects.flatMap(p => p.deliverables.filter(x => x.status === 'review').map(x => ({ ...x, p })))
  box('#wbReview', reviews.map(x => `<div class="li2" data-act="open-deliverable" data-p="${x.p.id}" data-d="${x.id}"><div class="grow"><b>${esc(x.type)}</b> v${x.v} · ${esc(x.p.name)}</div>${canOp('op.material.finalize') ? '<span class="btn sm">审核</span>' : '<span class="dim">等待负责人审核</span>'}</div>`).join('') || empty('没有待审核成果'))
  box('#wbTasks', tasks.filter(t => !t.done && t.owner === d.me.id).slice(0, 8).map(t => `<div class="task"><input type="checkbox" class="ck" data-act="task" data-id="${t.id}"><div class="grow"><div class="tt">${esc(t.title)}</div><div class="dim" style="font-size:11.5px">${t.projectId ? esc(proj(t.projectId)?.name ?? '') + ' · ' : ''}${esc(t.by ?? '')}</div></div>${due(t.due)}</div>`).join('') || empty('没有未完成任务'))
  box('#wbNotif', notes.slice(0, 8).map(n => `<div class="li2 ${n.read ? 'dim' : ''}" data-act="notif" data-id="${n.id}" data-p="${n.projectId ?? ''}"><span class="nk k-${n.kind}"></span><div class="grow" style="min-width:0"><div class="ell"><b>${esc(n.title)}</b></div><div class="ell dim">${esc(n.text ?? '')}</div></div><span class="dim">${rel(n.at)}</span></div>`).join('') || empty('暂无动态'))
}

function projectTable(list) {
  if (!list.length) return empty('没有项目')
  return `<div class="tablebox"><table class="t"><thead><tr><th>项目</th><th>业务类型</th><th>阶段</th><th>状态</th><th>进度</th><th>负责人</th><th>成果</th><th>更新</th></tr></thead><tbody>${list.map(p => `<tr class="click" data-act="open-project" data-id="${p.id}">
    <td><b>${esc(p.name)}</b><div class="dim" style="font-size:11.5px">${esc(p.industry ?? '')}</div></td><td>${esc(p.businessName ?? '')}</td><td>${stagePill(p)}<div class="dim" style="font-size:11px">${p.stageIndex + 1}/${p.stageCount}</div></td><td>${statusPill(p)}${p.pendingApproval ? ' <span class="pill st-0">决策中</span>' : ''}</td>
    <td><div class="pbar"><span class="bar"><i class="pb-${STAGE_TONE[p.stageKind] ?? 3}" style="width:${p.progress}%"></i></span><b>${p.progress}%</b></div></td><td><div class="own">${avatar(p.ownerName ?? '?', 24)}<span>${esc(p.ownerName ?? '')}</span></div></td>
    <td>${p.deliverables.slice(0, 3).map(x => `<span class="dlst ${x.status}" title="${esc(x.type)} v${x.v}">${esc(x.type)}</span>`).join(' ')}${p.deliverables.length > 3 ? ` <span class="dim">+${p.deliverables.length - 3}</span>` : ''}</td><td class="dim">${rel(p.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`
}

// ───────── 项目管理 ─────────
VIEWS.pipeline = v => {
  const d = D()
  const f = S.filters
  const bts = d.businessTypes
  const bt = f.bt || ''
  const wf = bt ? d.workflows.filter(w => w.businessType === bt && w.status === 'published').sort((a, b) => b.version - a.version)[0] : null
  const list = d.projects.filter(p => (!bt || p.businessType === bt) && (!f.status || p.status === f.status) && (!f.stage || p.stageId === f.stage) && (!f.owner || p.owner === f.owner) && (!f.q || [p.name, p.company, p.industry, ...(p.tags ?? [])].some(x => String(x ?? '').includes(f.q)))).sort((a, b) => b.updatedAt - a.updatedAt)
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>项目管理</h1><p>按业务类型配置的流程推进：每个阶段有具体工作与准入条件，决策节点由有权人员表决。</p></div>
    <button class="btn" data-act="layout">${icon(S.layout === 'table' ? 'flow' : 'grid', 14)}${S.layout === 'table' ? '阶段看板' : '表格'}</button>
    ${can('project.export') ? `<button class="btn" data-act="export-all">${icon('download', 14)}导出</button>` : ''}
    ${can('project.create') ? `<button class="btn pri" data-act="new-project">${icon('plus', 14)}录入项目机会</button>` : ''}</div>
    <div class="rtabs">${[['', `全部 ${d.projects.length}`], ...bts.map(b => [b.id, `${b.name} ${d.projects.filter(p => p.businessType === b.id).length}`])].map(([k, l]) => `<button class="${bt === k ? 'on' : ''}" data-act="bt" data-k="${k}">${esc(l)}</button>`).join('')}</div>
    ${wf ? `<div class="stagebar">${wf.stages.map(s => { const n = d.projects.filter(p => p.workflowId?.startsWith(bt) && p.stageId === s.id && p.status === 'active').length; return `<button class="${f.stage === s.id ? 'on' : ''}" data-act="stage-filter" data-k="${s.id}"><b>${esc(s.name)}</b><span>${n} 个${s.gate ? ` · ${esc(s.gate)}` : ''}</span></button>` }).join('<i>›</i>')}</div>` : ''}
    <div class="filters"><div class="q">${icon('search', 14)}<input class="input" id="pq" placeholder="搜索项目、公司、行业、标签" value="${esc(f.q)}"></div>
      <select class="select" data-act-change="pf" data-k="status">${opts(Object.entries(P_STATUS), f.status, '全部状态')}</select>
      <select class="select" data-act-change="pf" data-k="owner">${opts(d.users.map(u => [u.id, u.name]), f.owner, '全部负责人')}</select></div>
    ${S.layout === 'table' ? projectTable(list) : kanban(list, wf)}</div>`
  const q = $('#pq')
  q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(() => { S.filters.q = q.value.trim(); hooks.refresh(); const n = $('#pq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length) }, 250) })
}
function kanban(list, wf) {
  const stages = wf?.stages ?? [...new Map(list.map(p => [p.stage, { id: p.stageId, name: p.stage }])).values()]
  return `<div class="kanban">${stages.map(s => { const ps = list.filter(p => wf ? p.stageId === s.id : p.stage === s.name); return `<div class="kcol"><div class="khd">${esc(s.name)}<span>${ps.length}</span></div>${ps.map(p => `<div class="kcard" data-act="open-project" data-id="${p.id}"><b>${esc(p.name)}</b><div class="dim">${esc(p.businessName)} · ${esc(p.ownerName ?? '')}</div><div class="row" style="margin-top:6px">${statusPill(p)}<span class="grow"></span><span class="dim">${p.progress}%</span></div></div>`).join('') || '<div class="empty">—</div>'}</div>` }).join('')}</div>`
}

async function newProject() {
  const d = D()
  const r = await dialog(`<h3>录入项目机会</h3><p>选择业务类型后按该类型已发布的流程创建；敏感字段（金额、估值、条款）按权限可见。</p>
    <div class="row"><label class="f grow">业务类型<select class="select" name="businessType">${opts(d.businessTypes.map(b => [b.id, b.name]), 'financial')}</select></label></div>
    <label class="f">项目名称<input class="input" name="name" placeholder="如：某科技 B 轮" required></label>
    <div class="row"><label class="f grow">公司<select class="select" name="companyId">${opts(d.companies.map(c => [c.id, c.name]), '', '新公司（填写下方名称）')}</select></label><label class="f grow">新公司名称<input class="input" name="companyName" placeholder="如：某科技有限公司"></label></div>
    <div class="row"><label class="f grow">行业<input class="input" name="industry" placeholder="如：半导体"></label><label class="f grow">融资轮次<input class="input" name="round" placeholder="如：B轮"></label></div>
    <label class="f">项目简介<textarea class="input area" name="desc" placeholder="来源、亮点、初步判断"></textarea></label>
    <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">创建</button></div>`)
  if (!r) return
  const p = await act('project.create', { businessType: r.businessType, name: r.name, companyId: r.companyId || undefined, companyName: r.companyId ? undefined : r.companyName || r.name.split(/\s/)[0], industry: r.industry, desc: r.desc, fields: r.round ? { round: r.round } : undefined }, '项目已创建，进入流程第一阶段')
  const fromNb = ['workbench', 'notebook', 'flowboard'].includes(S.view)
  if (p) { await hooks.reload(); hooks.go(fromNb ? 'notebook' : 'project', { id: p.id }) }
}

Object.assign(ACT, {
  'new-project': newProject,
  bt: el => { S.filters.bt = el.dataset.k; S.filters.stage = ''; hooks.refresh() },
  'stage-filter': el => { S.filters.stage = S.filters.stage === el.dataset.k ? '' : el.dataset.k; hooks.refresh() },
  pf: el => { S.filters[el.dataset.k] = el.value; hooks.refresh() },
  layout: () => { S.layout = S.layout === 'table' ? 'kanban' : 'table'; hooks.refresh() },
  'export-all': async () => {
    const all = can('export.all')
    const r = await dialog(`<h3>导出项目数据</h3><div class="infobox">导出内容包括流程、工作、成果版本索引；敏感字段按你的权限脱敏。导出行为记入审计日志。</div>${all ? '<label class="f"><span><input type="checkbox" name="all"> 导出全机构全部项目（需「全量导出」权限）</span></label>' : ''}<div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">导出 JSON</button></div>`)
    if (!r) return
    if (!r.all) { const p = proj(S.sel) ?? D().projects[0]; const data = await act('export', { id: p.id }); if (data) import('/api/investai?asset=ui.js').then(u => u.saveText(`${p.name}-导出.json`, JSON.stringify(data, null, 2), 'application/json')); return }
    const data = await act('export', { scope: 'all' })
    if (data) import('/api/investai?asset=ui.js').then(u => u.saveText('InvestAI-全量导出.json', JSON.stringify(data, null, 2), 'application/json'))
  },
  task: async el => { await act('task.toggle', { id: el.dataset.id }); hooks.reload() },
})

// ───────── 任务 ─────────
VIEWS.tasks = async v => {
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>任务</h1><p>会议纪要确认后的待办、到期提醒与手动任务。到期前 ${D().settings.automation?.deadlineDays ?? 2} 天自动提醒并推送。</p></div></div>
    <div class="box"><div class="addc" style="margin:0 0 10px"><input class="input" id="tnew" placeholder="新任务…"><select class="select" id="tproj">${opts(D().projects.filter(p => p.status === 'active').map(p => [p.id, p.name]), '', '不关联项目')}</select><input class="input" type="date" id="tdue" style="width:150px"><button class="btn pri" data-act="task-add">添加</button></div><div id="tlist"><span class="spin"></span></div></div></div>`
  const list = await get('tasks').catch(() => [])
  const me = D().me.id
  const group = (title, xs) => xs.length ? `<div class="sec">${title} <span class="dim">${xs.length}</span></div>${xs.map(t => `<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" class="ck" ${t.done ? 'checked' : ''} data-act="task" data-id="${t.id}"><div class="grow"><div class="tt">${esc(t.title)}</div><div class="dim" style="font-size:11.5px">${t.projectId ? `<a class="lnk" data-act="open-project" data-id="${t.projectId}">${esc(proj(t.projectId)?.name ?? '')}</a> · ` : ''}${esc(userName(t.owner))} · ${esc(t.by ?? '')}</div></div>${due(t.due)}</div>`).join('')}` : ''
  $('#tlist').innerHTML = group('我的待办', list.filter(t => t.owner === me && !t.done)) + group('团队待办（我可见的项目）', list.filter(t => t.owner !== me && !t.done)) + group('已完成', list.filter(t => t.done).slice(0, 20)) || empty('没有任务')
}
ACT['task-add'] = async () => { const t = $('#tnew').value.trim(); if (!t) return; const dueTs = $('#tdue').value ? new Date($('#tdue').value).getTime() : undefined; if (await act('task.add', { title: t, projectId: $('#tproj').value || undefined, due: dueTs }, '已添加')) hooks.refresh() }

// ───────── 会议纪要：录音上传 → 本机转写 → AI 整理 → 人工确认 → 存档并生成待办 ─────────
VIEWS.meetings = async v => {
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>会议纪要</h1><p>上传会议录音，本机转写（录音不出本机），AI 整理讨论要点、决定事项、待办与责任人；人工确认后存入项目并生成任务。</p></div>${can('meeting.manage') ? `<button class="btn pri" data-act="meeting-new">${icon('plus', 14)}新建会议</button>` : ''}</div>
    <div class="infobox" style="margin-bottom:12px">转写引擎：${D().settings.asr?.ready ? `✅ faster-whisper（${esc(D().settings.asr.model.split('/').pop())}，本机 CPU）` : `⚠ 本机转写未安装：仍可在会议中「粘贴文字稿」整理纪要。安装（约 480MB，需要 <a href="https://docs.astral.sh/uv/" target="_blank" rel="noopener">uv</a>）：在终端运行 <code class="mono">${esc(D().settings.asr?.setup ?? 'sh scripts/setup-asr.sh')}</code>，完成后重新打开本页`}</div>
    <div id="mlist"><span class="spin"></span></div></div>`
  const list = await get('meetings').catch(() => [])
  $('#mlist').innerHTML = list.length ? `<div class="tablebox"><table class="t"><thead><tr><th>会议</th><th>项目</th><th>时间</th><th>录音</th><th>状态</th><th>待办</th></tr></thead><tbody>${list.map(m => `<tr class="click" data-act="meeting" data-id="${m.id}"><td><b>${esc(m.title)}</b><div class="dim">${esc(m.kind)}</div></td><td>${esc(proj(m.projectId)?.name ?? '')}</td><td>${fmt(m.at)}</td><td>${m.recordings.length ? `${m.recordings.length} 段` : '<span class="dim">未上传</span>'}${m.asr ? ' · 已转写' : ''}</td><td>${meetingStatus(m)}</td><td>${m.todos?.length ?? 0}</td></tr>`).join('')}</tbody></table></div>` : empty('还没有会议')
}
const meetingStatus = m => `<span class="pill ${m.status === 'confirmed' ? 'st-4' : m.status === 'review' ? 'st-0' : 'st-3'}">${{ draft: '待转写', review: '纪要待确认', confirmed: '已确认存档' }[m.status] ?? m.status}</span>`

async function meetingNew(projectId) {
  const d = D()
  const r = await dialog(`<h3>新建会议</h3><label class="f">项目<select class="select" name="projectId">${opts(d.projects.filter(p => p.status === 'active').map(p => [p.id, p.name]), projectId ?? S.sel)}</select></label>
    <label class="f">会议名称<input class="input" name="title" placeholder="如：某项目尽调沟通会" required></label>
    <div class="row"><label class="f grow">类型<select class="select" name="kind">${opts(['项目会议', '尽调访谈', '立项会', '投决会', '投后会议'].map(x => [x, x]), '项目会议')}</select></label><label class="f grow">时间<input class="input" type="datetime-local" name="at"></label></div>
    <label class="f">参会人（待办责任人只会从参会人中识别）<select class="select" name="attendees" multiple size="6">${d.users.map(u => `<option value="${u.id}" ${u.id === d.me.id ? 'selected' : ''}>${esc(u.name)} · ${esc(u.title)}</option>`).join('')}</select></label>
    <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">创建</button></div>`)
  if (!r) return
  const m = await act('meeting.create', { ...r, at: r.at ? new Date(r.at).getTime() : Date.now() }, '会议已创建')
  if (m) { hooks.refresh(); openMeeting(m.id) }
}

export async function openMeeting(id) {
  const m = await get('meeting', { id }).catch(e => { toast(e.message, 'deny'); return null })
  if (!m) return
  S.drawer = { meeting: id }
  const editable = m.status !== 'confirmed' && can('meeting.manage')
  const running = [...S.live.values()].find(j => j.status === 'running' && j.meetingId === id)
  const seg = m.asr?.segments ?? []
  const audioFiles = S.files.filter(f => ['.m4a', '.mp3', '.wav', '.aac'].includes(f.ext) && !m.recordings.some(r => r.fileId === f.id))
  drawer(`${drawerHead(esc(m.title), `${esc(proj(m.projectId)?.name ?? '')} · ${fmt(m.at)} · 参会：${m.attendees.map(userName).map(esc).join('、')}`, meetingStatus(m))}
    <div class="body">
      <div class="sec" style="margin-top:0">① 录音</div>
      ${m.recordings.map(r => `<div class="li2">${ficon('.m4a', true)}<div class="grow"><b>${esc(r.name)}</b><audio controls preload="none" src="${rawUrl(r.fileId, true)}" style="width:100%;height:32px;margin-top:4px" id="aud-${r.fileId}"></audio></div>${editable ? `<button class="btn sm pri" data-act="meeting-asr" data-id="${id}" data-f="${r.fileId}" ${running ? 'disabled' : ''}>${m.asr?.fileId === r.fileId ? '重新转写' : '本机转写'}</button>` : ''}</div>`).join('') || '<div class="dim">尚未上传录音</div>'}
      ${editable ? `<div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-act="meeting-upload" data-id="${id}">${icon('upload', 13)}上传录音</button><button class="btn sm" data-act="meeting-paste" data-id="${id}" title="没有录音或本机转写引擎时：粘贴会议记录 / 文字稿">${icon('edit', 13)}粘贴文字稿</button>${audioFiles.length ? `<select class="select sm" id="linkAudio">${opts(audioFiles.map(f => [f.id, f.rel]), '', '或关联资料库中的录音…')}</select><button class="btn sm" data-act="meeting-link" data-id="${id}">关联并转写</button>` : ''}</div>` : ''}
      ${running ? `<div class="paper" style="margin-top:8px"><span class="spin"></span> ${esc({ transcribing: '本机转写中…', minutes: 'AI 整理纪要中…' }[running.phase] ?? '处理中…')} <span class="dim">${esc(running.progress ?? '')}</span></div>` : ''}
      ${seg.length ? `<div class="sec">② 转写稿 <span class="dim">${esc(m.asr.engine)} · 录音 ${Math.round(m.asr.duration)} 秒 · 用时 ${Math.round(m.asr.elapsed)} 秒${m.asr.corrections?.length ? ` · 术语校正 ${m.asr.corrections.length} 处` : ''}</span></div>
        <div class="transcript">${seg.map(s => `<div class="seg-l" data-act="seek" data-f="${m.asr.fileId}" data-t="${s.start}"><span class="ts">${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, '0')}</span>${esc(s.text)}</div>`).join('')}</div>
        ${m.asr.corrections?.length ? `<div class="dim" style="font-size:11.5px;margin-top:4px">校正：${m.asr.corrections.map(c => `${esc(c.from)}→${esc(c.to)}`).join('；')}</div>` : ''}` : ''}
      ${m.minutes ? `<div class="sec">③ 纪要草稿 <span class="dim">${esc(m.minutesEngine ?? '')}</span>${editable ? '<button class="lnk" data-act="meeting-edit">编辑纪要</button>' : ''}</div>
        <div class="paper"><div class="md" id="minutesMd">${md(m.minutes)}</div></div>
        <div class="sec">④ 待办与责任人 <span class="dim">责任人只能从参会人中选择；无法确定时为「待指定」</span></div>
        <div class="tablebox"><table class="t"><thead><tr><th>事项</th><th>责任人</th><th>期限</th></tr></thead><tbody>${(m.todos ?? []).map((t, i) => `<tr><td>${editable ? `<input class="input sm" data-todo="${i}" data-k="text" value="${esc(t.text)}">` : esc(t.text)}</td><td>${editable ? `<select class="select sm" data-todo="${i}" data-k="owner">${opts(m.attendees.map(u => [u, userName(u)]), t.owner, '待指定')}</select>` : esc(t.owner ? userName(t.owner) : '待指定')}</td><td>${editable ? `<input class="input sm" type="date" data-todo="${i}" data-k="due" value="${t.due ? ymd(t.due) : ''}">` : t.due ? ymd(t.due) : '待定'}</td></tr>`).join('') || '<tr><td colspan="3" class="dim">未识别到待办</td></tr>'}</tbody></table></div>` : ''}
    </div>
    <footer>${editable && m.minutes ? `<button class="btn sm" data-act="meeting-save-todos" data-id="${id}">保存待办修改</button><span class="grow"></span><button class="btn sm pri" data-act="meeting-confirm" data-id="${id}">${icon('check', 13)}确认纪要并存档</button>` : m.status === 'confirmed' ? `<span class="ok">✓ 已确认：纪要已存入项目成果，待办已生成任务</span><span class="grow"></span>` : '<span class="grow"></span>'}</footer>`, true)
}
hooks.openMeeting = openMeeting
window.addEventListener('investai:job', e => { const j = e.detail; if (j.kind === 'asr' && S.drawer?.meeting === j.meetingId && !$('#drawer').hidden) openMeeting(j.meetingId) })

Object.assign(ACT, {
  'meeting-paste': async el => {
    const r = await dialog(`<h3>粘贴会议文字稿</h3><p>粘贴会议记录或其他转写工具的文字稿，系统同样整理讨论要点、决定事项、待办与责任人（责任人只从参会人中识别）。</p><textarea class="input area" name="text" style="height:40vh" required placeholder="例：会议决定，下周完成补充尽调。林晓负责在10月30日前整理客户名单。"></textarea><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">整理纪要</button></div>`, { wide: true })
    if (r && await act('meeting.transcript', { id: el.dataset.id, text: r.text }, '已整理纪要草稿，请核对待办与责任人')) { await hooks.reload(); openMeeting(el.dataset.id) }
  },
  'meeting-new': el => meetingNew(el.dataset.p),
  meeting: el => openMeeting(el.dataset.id),
  'meeting-upload': async el => {
    const [file] = await pick({ multiple: false, accept: 'audio/*,.m4a,.mp3,.wav,.aac' })
    if (!file) return
    if (file.size > 60 * 1024 * 1024) return toast('录音超过 60MB：请放入 NAS「会议录音」目录后在此关联', 'deny')
    toast('上传中…')
    const m = await act('meeting.upload', { id: el.dataset.id, name: file.name, data: await toB64(file) }, '录音已上传（密级：机密，仅本机处理）')
    if (m) { await hooks.reload(); openMeeting(m.id) }
  },
  'meeting-link': async el => { const fileId = $('#linkAudio')?.value; if (!fileId) return toast('请选择录音文件'); ACT['meeting-asr']({ dataset: { id: el.dataset.id, f: fileId } }) },
  'meeting-asr': async el => { const j = await act('meeting.transcribe', { id: el.dataset.id, fileId: el.dataset.f }, '开始本机转写'); if (j) { hooks.track(j); openMeeting(el.dataset.id) } },
  seek: el => { const a = $(`#aud-${el.dataset.f}`); if (a) { a.currentTime = Number(el.dataset.t); a.play() } },
  'meeting-edit': async () => {
    const m = await get('meeting', { id: S.drawer.meeting })
    const r = await dialog(`<h3>编辑纪要</h3><textarea class="input area mono" name="minutes" style="height:52vh">${esc(m.minutes)}</textarea><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`, { wide: true })
    if (r && await act('meeting.update', { id: m.id, minutes: r.minutes }, '纪要已保存')) openMeeting(m.id)
  },
  'meeting-save-todos': async el => {
    const m = await get('meeting', { id: el.dataset.id })
    const todos = m.todos.map((t, i) => ({ ...t, text: $(`[data-todo="${i}"][data-k=text]`)?.value ?? t.text, owner: $(`[data-todo="${i}"][data-k=owner]`)?.value || null, due: $(`[data-todo="${i}"][data-k=due]`)?.value ? new Date($(`[data-todo="${i}"][data-k=due]`).value).getTime() : null }))
    if (await act('meeting.update', { id: m.id, todos }, '待办已保存')) openMeeting(m.id)
  },
  'meeting-confirm': async el => {
    await ACT['meeting-save-todos'](el)
    const m = await get('meeting', { id: el.dataset.id })
    const noOwner = m.todos.filter(t => !t.owner).length
    const ok = await dialog(`<h3>确认纪要</h3><div class="infobox">确认后：纪要作为「会议纪要」成果定稿存入项目；${m.todos.length - noOwner} 条有责任人的待办生成任务并通知责任人${noOwner ? `；<b>${noOwner} 条未指定责任人的待办不会生成任务</b>` : ''}。确认后不可再修改。</div><div class="acts"><button class="btn" data-dlg="no">返回修改</button><button class="btn pri" data-dlg="ok">确认存档</button></div>`)
    if (ok && await act('meeting.confirm', { id: m.id }, '纪要已确认存档，待办已生成任务')) { await hooks.reload(); openMeeting(m.id) }
  },
})
