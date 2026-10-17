// 项目详情：阶段流程 · 工作与成果（真实 Office 文件、版本、定稿）· 决策表决 · 资料 · 会议 · 提取与外部填报 · 动态与历史回滚 · 成员授权
import { S, D, ACT, VIEWS, hooks, $, $$, esc, md, icon, gated, roleName, avatar, get, post, act, toast, dialog, confirmBox, askText, drawer, drawerHead, closeDrawer, menuAt, mi, can, canOp, proj, user, userName, fmt, ymd, rel, due, opts, empty, pick, toB64, ficon, levelTag, saveB64, printDoc, downloadFile, DL_STATUS, WORK_STATUS, P_STATUS, RESULT, RULE, LEVELS } from '/api/investai?asset=ui.js'

const PTABS = [['works', '工作与成果'], ['decide', '决策审批'], ['files', '项目资料'], ['meetings', '会议'], ['extract', '提取与填报'], ['timeline', '动态与历史'], ['members', '成员与授权'], ['talk', '讨论']]
const KIND = { standard: '标准文书', extract: '结构化提取', research: '研究成果', table: '表格', meeting: '会议纪要' }

async function loadProject() {
  if (!S.sel) return
  try { S.project = await get('project', { id: S.sel }) } catch (e) { S.project = { error: e.message } }
  if (S.view === 'project') render($('#view'))
  hooks.renderAI()
}
hooks.loadProject = loadProject

VIEWS.project = v => {
  if (!S.project || S.project.project?.id !== S.sel) { v.innerHTML = '<div class="page"><span class="spin"></span></div>'; loadProject(); return }
  render(v)
}

function render(v) {
  const x = S.project
  if (x.error) { v.innerHTML = `<div class="page"><div class="empty">${esc(x.error)}</div><button class="btn" data-act="go" data-view="pipeline">返回项目列表</button></div>`; return }
  const p = x.project
  const wf = x.workflow
  const cur = wf.stages.findIndex(s => s.id === p.stageId)
  const pending = x.approvals.find(a => a.status === 'pending')
  const st = wf.stages[cur]
  const keep = $('#view .page')?.scrollTop
  v.innerHTML = `<div class="page scrollable">
    <div class="phd"><button class="btn ghost sm" data-act="go" data-view="pipeline">${icon('left', 14)}项目管理</button><span class="dim">/ ${esc(p.businessName)}</span></div>
    <div class="ph"><div class="grow"><h1>${esc(p.name)} <span class="pill ps-${p.status}">${esc(p.statusLabel ?? P_STATUS[p.status])}</span></h1>
      <p>${esc(x.company?.name ?? '')}${p.industry ? ` · ${esc(p.industry)}` : ''} · 负责人 ${esc(p.ownerName ?? '')} · 流程 ${esc(wf.name)} v${wf.version}${p.desc ? ` · ${esc(p.desc)}` : ''}</p></div>
      <button class="btn" data-act="ask-ai" data-q="${esc(`${p.name}当前阶段还缺哪些材料？有哪些风险需要关注？`)}">${icon('bot', 14)}问 AI</button>
      <button class="btn ico" data-act="project-menu" title="更多操作">${icon('dots', 16)}</button></div>
    <div class="stepper">${wf.stages.map((s, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'cur' : ''}" title="${esc(s.gate ? `决策节点：${s.gate.name}（${RULE[s.gate.rule]}）` : '')}"><i>${i < cur ? '✓' : i + 1}</i><b>${esc(s.name)}</b>${s.gate ? `<span>${esc(s.gate.name)}</span>` : '<span>无决策节点</span>'}</div>`).join('')}</div>
    <div class="pgrid">
      <div class="box"><h3>${icon('shield', 15)}当前阶段：${esc(st?.name ?? '')}<span class="grow"></span>${pending ? `<span class="pill st-0">「${esc(pending.gate.name)}」表决中</span>` : ''}</h3>
        <div class="ready">${x.readiness.items.map(i => `<div class="ri ${i.ok ? 'ok' : ''}"><i>${i.ok ? '✓' : '○'}</i>${esc(i.work)}<span>${esc(i.status)}</span></div>`).join('') || '<div class="dim">本阶段没有必做工作</div>'}</div>
        <div class="row" style="margin-top:10px">${st?.gate ? (pending ? `<button class="btn pri" data-act="ptab" data-k="decide">查看表决进度</button>` : `<button class="btn pri" data-act="gate" ${!x.readiness.ok || p.status !== 'active' || !can('project.submit') ? 'disabled' : ''} title="${esc(!can('project.submit') ? '当前岗位不能发起决策' : !x.readiness.ok ? '准入条件未满足' : '')}">${icon('vote', 14)}发起「${esc(st.gate.name)}」</button>`) : ''}
          <span class="dim" style="font-size:12px">${x.readiness.ok ? '准入条件已满足' : `还差 ${x.readiness.items.filter(i => !i.ok).length} 项`}${st?.gate ? ` · 规则：${RULE[st.gate.rule]} · 表决人：${esc(st.gate.roles.map(roleName).join('、'))}` : ''}</span></div>
        ${guideHTML(x)}</div>
      <div class="box"><h3>${icon('lock', 15)}项目信息<span class="grow"></span>${can('project.edit') ? '<button class="lnk" data-act="edit-fields">编辑</button>' : ''}</h3>
        <div class="kv">${Object.entries({ round: '融资轮次', amount: '投资金额', valuation: '估值', terms: '关键条款', lp: 'LP 信息' }).filter(([k]) => p.fields[k] !== undefined).map(([k, l]) => `<div><span>${l}</span>${p.fields[k]?.hidden ? `<b class="masked" title="敏感字段（${esc(p.fields[k].hidden)}），当前岗位无权查看">●●●● ${icon('lock', 12)}</b>` : `<b>${esc(p.fields[k])}</b>`}</div>`).join('') || '<div class="dim">暂无</div>'}
          <div><span>进度</span><b>${p.progress}%</b></div><div><span>成员</span><b>${p.members.map(m => esc(userName(m.userId))).join('、')}</b></div></div></div>
    </div>
    <div class="dtabs2">${PTABS.map(([k, l]) => `<button class="${S.ptab === k ? 'on' : ''}" data-act="ptab" data-k="${k}">${l}${badge(k, x)}</button>`).join('')}</div>
    <div class="tabbody">${TAB[S.ptab]?.(x) ?? ''}</div></div>`
  if (keep) $('#view .page').scrollTop = keep
}
function badge(k, x) {
  const n = { decide: x.approvals.filter(a => a.status === 'pending').length, meetings: x.meetings.length, extract: x.extractions.filter(e => e.status === 'pending').length, files: x.files.length }[k]
  return n ? `<span class="n">${n}</span>` : ''
}

/** 下一步：还差什么、谁来做；轮到你的事项带「去做」按钮。 */
function guideHTML(x) {
  if (!x.guide?.length) return ''
  return `<div class="sec" style="margin:12px 0 6px">下一步</div><div class="guide">${x.guide.map((g, i) => `<div class="gi ${g.mine ? 'mine' : ''}"><span class="no">${i + 1}</span><div class="grow"><div>${esc(g.text)}</div>${g.who ? `<div class="who">负责：${esc(g.who)}</div>` : ''}</div>${g.mine ? `<span class="mine-tag">轮到你</span>${g.deliverableId ? `<button class="btn sm pri" data-act="open-deliverable" data-p="${x.project.id}" data-d="${g.deliverableId}">去处理</button>` : g.workId ? `<button class="btn sm pri" data-act="work-ai" data-t="${esc(g.type)}" data-w="${g.workId}">去起草</button>` : g.tab ? `<button class="btn sm pri" data-act="ptab" data-k="${g.tab}">去表决</button>` : g.gate ? '<button class="btn sm pri" data-act="gate">发起</button>' : ''}` : ''}</div>`).join('')}</div>`
}

// ───────── 各标签页 ─────────
const TAB = {
  works(x) {
    const p = x.project
    const wf = x.workflow
    const byStage = wf.stages.map(s => ({ s, works: x.works.filter(w => w.stageId === s.id) })).filter(g => g.works.length || g.s.id === p.stageId)
    return byStage.map(({ s, works }) => `<div class="sec">${esc(s.name)}${s.id === p.stageId ? ' <span class="pill st-3">当前阶段</span>' : ''}<span class="grow"></span>${s.id === p.stageId && can('project.edit') ? `<button class="lnk" data-act="work-add">＋ 新增工作</button>` : ''}</div>
      <div class="works">${works.map(w => workCard(w, x)).join('') || '<div class="empty">本阶段暂无工作</div>'}</div>`).join('')
  },
  decide(x) {
    const me = D().me.id
    return x.approvals.map(a => {
      const mine = a.voters.includes(me) && !a.votes.some(v => v.userId === me) && !a.recused.includes(me) && a.status === 'pending'
      const outcomes = Object.entries(a.gate.outcomes)
      return `<div class="box appr ${a.status}"><h3>${icon('vote', 15)}${esc(a.gate.name)}<span class="pill ${a.status === 'pending' ? 'st-0' : a.result === 'pass' ? 'st-4' : 'st-2'}">${a.status === 'pending' ? '表决中' : `结果：${RESULT[a.result]}`}</span><span class="grow"></span><span class="dim" style="font-weight:400">${esc(RULE[a.gate.rule])} · 发起 ${fmt(a.requestedAt)} · ${esc(userName(a.requestedBy))}</span></h3>
        <div class="dim" style="font-size:12px;margin-bottom:8px">上会材料：${a.materials.map(esc).join('、') || '无'} · 结果去向：${outcomes.map(([k, o]) => `${RESULT[k]}→${esc(o.label)}`).join('；')}</div>
        <div class="votes">${a.voters.map(id => { const v = a.votes.find(z => z.userId === id); const rc = a.recused.includes(id); return `<div class="vt ${v?.decision ?? (rc ? 'recused' : 'wait')}">${avatar(userName(id), 26)}<div class="grow"><b>${esc(userName(id))}</b> <span class="dim">${esc(user(id)?.title ?? '')}</span><div>${v ? `<span class="pill vd-${v.decision}">${RESULT[v.decision]}</span> ${esc(v.opinion ?? '')}` : rc ? '<span class="dim">回避</span>' : '<span class="dim">未表决</span>'}</div></div><span class="dim">${v ? rel(v.at) : ''}</span></div>` }).join('')}</div>
        ${a.status === 'decided' ? `<div class="dim" style="margin-top:6px">有效表决人 ${a.eligible}，通过阈值 ${a.need}；决定于 ${fmt(a.decidedAt)}</div>` : ''}
        ${mine ? `<div class="votebox"><textarea class="input area" id="op-${a.id}" placeholder="表决意见（退回/否决必填）"></textarea><div class="row">${outcomes.map(([k]) => `<button class="btn ${k === 'pass' ? 'pri' : k === 'reject' ? 'danger' : ''}" data-act="vote" data-id="${a.id}" data-d="${k}">${RESULT[k]}</button>`).join('')}<span class="grow"></span><button class="btn ghost" data-act="vote" data-id="${a.id}" data-d="recuse">申请回避</button></div><div class="dim" style="font-size:11.5px">表决是正式决策，只能由你本人操作；AI 不参与表决。</div></div>` : ''}</div>`
    }).join('') || empty('本项目还没有发起过决策。满足准入条件后在上方「当前阶段」发起。')
  },
  files(x) {
    const p = x.project
    return `<div class="row" style="margin-bottom:10px">${can('material.upload') ? `<button class="btn pri sm" data-act="proj-upload">${icon('upload', 13)}上传项目资料</button>` : ''}<span class="dim" style="font-size:12px">资料存入「公司 NAS/项目资料/${esc(x.company?.short ?? p.name)}」，默认密级「机密」。也可直接拖拽文件到窗口。</span></div>
      ${fileTable(x.files)}`
  },
  meetings(x) {
    return `<div class="row" style="margin-bottom:10px">${can('meeting.manage') ? `<button class="btn pri sm" data-act="meeting-new" data-p="${x.project.id}">${icon('plus', 13)}新建会议</button>` : ''}</div>
      ${x.meetings.map(m => `<div class="li2" data-act="meeting" data-id="${m.id}">${icon('mic', 16)}<div class="grow"><b>${esc(m.title)}</b><div class="dim">${esc(m.kind)} · ${fmt(m.at)} · ${m.recordings.length} 段录音${m.asr ? ` · 转写 ${m.asr.segments} 段` : ''} · 待办 ${m.todos?.length ?? 0}</div></div><span class="pill ${m.status === 'confirmed' ? 'st-4' : 'st-0'}">${{ draft: '待转写', review: '待确认', confirmed: '已存档' }[m.status]}</span></div>`).join('') || empty('暂无会议')}`
  },
  extract(x) {
    const p = x.project
    const schemas = S.meta.schemas
    return `<div class="box"><h3>${icon('extract', 15)}从资料中提取为固定格式</h3><div class="dim" style="font-size:12px;margin-bottom:8px">选择资料与目标格式；每个字段标注来源文件与页码，缺失与多源冲突单独列出，<b>不编造数据</b>。确认后写入公司库与项目信息。</div>
        <div class="row" style="flex-wrap:wrap">${Object.entries(schemas).map(([k, s]) => `<button class="btn" data-act="extract" data-k="${k}" ${can('extract.run') ? '' : 'disabled'}>${esc(s.name)}</button>`).join('')}<span class="dim" style="font-size:11.5px">默认使用本项目全部可见资料；可在「项目资料」中勾选后提取</span></div></div>
      <div class="sec">提取记录</div>${x.extractions.map(e => `<div class="li2" data-act="extraction" data-id="${e.id}"><span class="fi sm" style="background:#059669">X</span><div class="grow"><b>${esc(e.name)}</b> <span class="dim">${e.origin === 'fill' ? '外部填报' : esc(schemas[e.schema]?.name ?? e.schema)} · ${esc(e.by ?? '')} · ${fmt(e.createdAt)}</span><div class="dim">${e.missing?.length ? `缺失 ${e.missing.length} 项` : '无缺失'}${e.conflicts?.length ? ` · <span class="bad">冲突 ${e.conflicts.length} 项</span>` : ''}</div></div><span class="pill ${e.status === 'confirmed' ? 'st-4' : 'st-0'}">${e.status === 'confirmed' ? '已确认入库' : '待人工确认'}</span></div>`).join('') || empty('暂无提取记录')}
      <div class="sec">外部自助填报<span class="grow"></span>${can('fill.manage') ? '<button class="lnk" data-act="fill-new">＋ 生成授权链接</button>' : ''}</div>
      <div class="dim" style="font-size:12px;margin-bottom:6px">向项目方发送一次性授权链接（1–14 天有效，可撤销）：对方填写字段、上传附件，提交后进入「提取记录」待你确认。外部人员看不到任何内部数据。${D().mode !== 'saas' ? '<br>⚠ 当前为桌面插件模式：外部链接需要部署 SaaS 服务端后才能被外部访问。' : ''}</div>
      ${x.fills.map(f => `<div class="li2"><div class="grow"><b>${f.fields.length} 个字段</b>${f.allowFiles ? ' + 附件' : ''} <span class="dim">· ${esc(f.contact || '未填联系人')} · 有效至 ${fmt(f.expiresAt)}</span></div><span class="pill ${f.status === 'open' ? 'st-3' : f.status === 'submitted' ? 'st-4' : 'st-2'}">${{ open: '待填写', submitted: '已提交', revoked: '已撤销' }[f.status]}</span>${f.status === 'open' ? `<button class="btn sm" data-act="fill-revoke" data-id="${f.id}">撤销</button>` : ''}</div>`).join('') || '<div class="empty">暂无</div>'}`
  },
  timeline(x) {
    return `<div class="tl2">${[...x.timeline].reverse().map(t => `<div class="tli"><i></i><div><b>${esc(t.event)}</b>${t.note ? ` <span class="dim">· ${esc(t.note)}</span>` : ''}<div class="dim">${esc(t.by)} · ${fmt(t.at)}</div></div></div>`).join('')}</div>
      <div class="sec">变更历史（每一次修改都有记录，可查看快照并回滚）</div>
      <div class="tablebox"><table class="t"><thead><tr><th>版本</th><th>操作</th><th>操作人</th><th>时间</th><th></th></tr></thead><tbody>${x.history.map(h => `<tr><td class="mono">r${h.rev}</td><td>${esc(h.reason ?? h.action)}</td><td>${esc(h.actor_name ?? '')}</td><td class="dim">${fmt(h.at)}</td><td>${can('audit.read') ? `<button class="btn sm ghost" data-act="snapshot" data-coll="projects" data-id="${x.project.id}" data-rev="${h.rev}">快照</button>` : ''}${can('history.rollback') ? `<button class="btn sm ghost" data-act="rollback" data-coll="projects" data-id="${x.project.id}" data-rev="${h.rev}">回滚到此</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
  },
  members(x) {
    const p = x.project
    const editable = can('project.member')
    return `<div class="box"><h3>${icon('user', 15)}项目成员<span class="grow"></span>${editable ? '<button class="lnk" data-act="members">调整</button>' : ''}</h3>${p.members.map(m => `<div class="li2">${avatar(userName(m.userId))}<div class="grow"><b>${esc(userName(m.userId))}</b> <span class="dim">${esc(user(m.userId)?.title ?? '')}</span></div><span class="tag">${esc({ pm: '项目经理', analyst: '投资经理/分析师', finance: '财务', legal: '法务', risk: '风控', postinv: '投后' }[m.role] ?? m.role)}</span></div>`).join('')}</div>
      <div class="box" style="margin-top:10px"><h3>${icon('shield', 15)}指定授权（项目外人员临时可见）</h3>${(x.project.grants ?? []).length ? '' : '<div class="dim">无。权限范围为「指定授权项目」的岗位（如法务、风控）需要在此授权后才能看到本项目。</div>'}${(x.project.grants ?? []).map(g => `<div class="li2">${esc(userName(g.userId))}<span class="grow"></span><span class="dim">${g.until ? `至 ${ymd(g.until)}` : '长期'} · ${esc(g.by ?? '')}</span></div>`).join('')}</div>`
  },
  talk(x) {
    return `<div class="comments">${x.comments.map(c => `<div class="cm"><div class="by">${esc(c.by)} · ${fmt(c.at)}</div>${esc(c.text)}</div>`).join('') || '<div class="empty">暂无讨论</div>'}</div><div class="addc"><input class="input" id="cmt" placeholder="发表意见（项目成员可见）"><button class="btn pri" data-act="comment">发送</button></div>`
  },
}

function workCard(w, x) {
  const d = x.deliverables.find(z => z.id === w.deliverableId) ?? x.deliverables.find(z => z.type === w.type && z.workId === w.id)
  const wt = D().workTypes[w.type] ?? {}
  const v = d?.versions.at(-1)
  const live = [...S.live.values()].find(j => j.status === 'running' && j.deliverableId === d?.id)
  return `<div class="wcard ${w.status}">
    <div class="row"><b class="grow">${esc(w.type)}${w.required ? ' <span class="req" title="必做：阶段准入条件">必做</span>' : ''}</b><span class="tag">${esc((d?.format ?? wt.format ?? 'docx').toUpperCase())}</span></div>
    <div class="dim" style="font-size:11.5px;margin:3px 0 8px" title="${esc(wt.kind === 'standard' ? '按机构固定模板填充字段，不调用模型' : wt.kind === 'extract' ? '从资料中提取固定格式，人工确认后入库' : 'AI 先规划结构，确认后起草')}">${esc(KIND[wt.kind] ?? '研究成果')} · ${esc(userName(w.assignee))}${w.due ? ` · ${ymd(w.due)}` : ''}</div>
    <div class="row">${d ? `<span class="pill dl-${d.status}">${DL_STATUS[d.status]}${d.status === 'final' ? ` v${d.finalV}` : ''}</span><span class="dim">${d.versions.length} 个版本${v ? ` · ${rel(v.at)}` : ''}</span>` : `<span class="pill ws-${w.status}">${WORK_STATUS[w.status] ?? w.status}</span>`}${d?.checkout ? `<span class="pill st-2" title="${esc(d.checkout.path)}">${esc(d.checkout.name)} 编辑中</span>` : ''}</div>
    ${live ? `<div class="prog" style="margin-top:8px"><i style="width:${Math.min(96, (live.text?.length ?? 0) / 30)}%"></i></div><div class="dim" style="font-size:11.5px">AI 起草中…</div>` : ''}
    <div class="wacts">${d?.versions.length ? `<button class="btn sm" data-act="open-deliverable" data-p="${x.project.id}" data-d="${d.id}">${icon('file', 13)}打开</button>` : ''}
      ${!d || d.status !== 'final' ? gated(w.can?.aiWrite, `<button class="btn sm ${d?.versions.length ? '' : 'pri'}" data-act="work-ai" data-t="${esc(w.type)}" data-w="${w.id}" ${live ? 'disabled' : ''}>${icon('spark', 13)}${wt.kind === 'standard' ? '模板填充' : wt.kind === 'extract' ? 'AI 提取' : d?.versions.length ? 'AI 重写' : 'AI 起草'}</button>`) : ''}
      ${!d || d.status !== 'final' ? gated(w.can?.edit, `<button class="btn sm ghost" data-act="work-upload" data-t="${esc(w.type)}" data-w="${w.id}">${icon('upload', 13)}上传</button>`) : ''}
      <button class="btn sm ghost ico" data-act="work-menu" data-w="${w.id}" title="更多">${icon('dots', 14)}</button></div></div>`
}

function fileTable(files) {
  if (!files.length) return empty('暂无资料')
  return `<div class="tablebox"><table class="t"><thead><tr><th>文件</th><th>位置</th><th>密级</th><th>大小</th><th>更新</th><th></th></tr></thead><tbody>${files.map(f => `<tr class="click" data-act="file" data-id="${f.id}"><td><div class="row">${ficon(f.ext, true)}<span class="ell">${esc(f.name)}</span>${f.pages ? `<span class="dim">${f.pages}页</span>` : ''}${f.scanned ? '<span class="tag amber">扫描件</span>' : ''}</div></td><td class="dim ell" style="max-width:260px">${esc(f.rel)}</td><td>${levelTag(f.level)}</td><td class="dim">${(f.size / 1024).toFixed(0)} KB</td><td class="dim">${ymd(f.mtime)}</td><td><button class="btn sm ghost" data-act="ctx-add" data-id="${f.id}" title="带入 AI 上下文">${icon('bot', 13)}</button></td></tr>`).join('')}</tbody></table></div>`
}

// ───────── 成果抽屉：版本 · Office 编辑 · 审核定稿 ─────────
export async function openDeliverable(pid, did, v) {
  if (!S.project || S.project.project.id !== pid) { S.sel = pid; await loadProject() }
  const d = S.project.deliverables.find(z => z.id === did)
  if (!d) return toast('成果不存在', 'deny')
  const ver = d.versions.find(z => z.v === Number(v)) ?? d.versions.at(-1)
  if (!ver) return toast('还没有版本', 'deny')
  const { text } = await get('version.text', { id: did, v: ver.v })
  S.drawer = { pid, did, v: ver.v, text }
  const p = S.project.project
  const latest = ver.v === d.versions.length
  const C = d.can ?? {}
  const editable = C.edit?.ok
  const cc = ver.citeCheck
  const rv = ver.review
  const sections = [...text.matchAll(/^##\s+(.+)$/gm)].map(m => m[1])
  drawer(`${drawerHead(`${esc(d.type)} <span class="pill dl-${d.status}">${DL_STATUS[d.status]}${d.status === 'final' ? ` v${d.finalV}` : ''}</span>`, `${esc(p.name)} · ${esc(ver.path ?? '')}`)}
    <div class="vrow"><div class="vers">${d.versions.map(z => `<button class="${z.v === ver.v ? 'on' : ''} ${d.finalV === z.v && d.status === 'final' ? 'fin' : ''}" data-act="open-deliverable" data-p="${pid}" data-d="${did}" data-v="${z.v}" title="${esc(z.by)} · ${esc(z.engine ?? '')} · ${fmt(z.at)}${z.note ? ` · ${esc(z.note)}` : ''}">v${z.v}</button>`).join('')}</div>
      <span class="dim" style="font-size:12px">${esc(ver.by)} · ${esc(ver.engine ?? '')} · ${fmt(ver.at)}${ver.note ? ` · ${esc(ver.note)}` : ''}</span></div>
    ${cc || rv ? `<div class="checks">${cc ? `<div class="ccheck ${cc.unverified?.length || cc.unsourced?.length ? 'warn' : 'ok'}" title="把正文中的数字与引用资料原文逐条比对">引用核对：${cc.verified}/${cc.total} 条带引用的数字已在原文中找到${cc.unverified?.length ? `；<b>${cc.unverified.length} 条未找到</b>` : ''}${cc.unsourced?.length ? `；${cc.unsourced.length} 处数字未标注来源` : ''}</div>` : ''}
      ${rv ? `<div class="ccheck ${rv.verdict === '通过' ? 'ok' : 'warn'}">AI 预审（${esc(rv.by)}）：<b>${esc(rv.verdict)}</b>${rv.issues.length ? `<ul>${rv.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}${rv.modelNote ? `<details><summary>模型意见</summary><div class="md">${md(rv.modelNote)}</div></details>` : ''}<div class="dim" style="font-size:11px">预审仅供参考，不代替人工审核</div></div>` : ''}
      ${cc?.unverified?.length ? `<details class="rd"><summary>查看未核对的数字</summary>${cc.unverified.map(u => `<div class="dim" style="font-size:11.5px">「${esc(u.line)}」→ [${u.refs.join(',')}] 中未找到 ${esc(u.missing.join('、'))}</div>`).join('')}</details>` : ''}</div>` : ''}
    ${d.rejected && d.status === 'draft' ? `<div class="warnbox" style="margin:0 16px 8px">退回意见（${esc(d.rejected.by)}）：${esc(d.rejected.reason)}</div>` : ''}
    ${d.checkout ? `<div class="infobox" style="margin:0 16px 8px">📝 ${esc(d.checkout.name)} 正在用本机 Office 编辑工作副本：<span class="mono">${esc(d.checkout.path)}</span>。在 Word/PPT/Excel 中保存后点「提交编辑」生成新版本。</div>` : ''}
    <div class="body"><div class="md doc">${md(text, ver.cites)}</div>
      ${ver.cites?.length ? `<div class="sec">引用来源（${ver.cites.length}）</div><div class="srcs">${ver.cites.map(c => c.wisburg ? `<button class="src" data-act="wis" data-res="${esc(c.wisburg.resource)}" data-id="${esc(c.wisburg.id)}">[${c.n}] 🌐 ${esc(c.wisburg.title ?? c.path)}</button>` : c.fileId ? `<button class="src" data-act="file" data-id="${c.fileId}">[${c.n}] ${esc(String(c.path).split('/').pop())}</button>` : `<span class="src">[${c.n}] ${esc(c.path)}</span>`).join('')}</div>` : ''}</div>
    <footer>
      <button class="btn sm" data-act="dl-download" title="下载真实 ${esc(d.format.toUpperCase())} 文件">${icon('download', 13)}下载 ${esc(d.format.toUpperCase())}</button>
      <button class="btn sm" data-act="dl-print" title="排版后用系统打印另存为 PDF">${icon('print', 13)}导出 PDF</button>
      ${editable && latest ? `${d.checkout ? `<button class="btn sm pri" data-act="dl-checkin">提交编辑</button>` : `<button class="btn sm" data-act="dl-checkout" title="用本机 Word / PowerPoint / Excel / WPS 打开">${icon('open', 13)}Office 编辑</button>`}
        <button class="btn sm" data-act="dl-edit">在线编辑</button>${sections.length ? gated(C.aiWrite, `<button class="btn sm" data-act="dl-rewrite">${icon('spark', 13)}AI 改写章节</button>`) : ''}` : ''}
      ${editable && !latest ? `<button class="btn sm" data-act="dl-restore">恢复为新版本</button>` : ''}
      <span class="grow"></span>
      ${d.status === 'draft' && latest ? gated(C.submit, `<button class="btn sm pri" data-act="dl-submit">提交审核</button>`) : ''}
      ${d.status === 'review' && latest ? gated(C.reject, `<button class="btn sm" data-act="dl-reject">退回</button>`) + gated(C.finalize, `<button class="btn sm pri" data-act="dl-final">${icon('check', 13)}定稿 v${ver.v}</button>`) : ''}
      ${d.status === 'final' ? gated(C.reopen, `<button class="btn sm" data-act="dl-reopen">撤回定稿</button>`) : ''}
    </footer>`, true)
}
hooks.openDeliverable = openDeliverable

async function workAI(type, workId) {
  const x = S.project
  const p = x.project
  const wt = D().workTypes[type] ?? {}
  if (wt.kind === 'standard') {
    const fields = await askText(`模板填充：${type}`, '补充字段（每行「字段：值」，可留空；缺失字段会标注【待补充】）', { required: false, placeholder: '签署日期：2026年10月20日\n保密期限：三年' })
    if (fields === null) return
    const j = await act('ai.generate', { projectId: p.id, type, prompt: fields })
    if (j) { hooks.track(j); toast('正在按模板填充…') }
    return
  }
  if (wt.kind === 'extract') {
    // 生成「项目信息表」等成果文件（准入条件需要它定稿），同时产生一条待确认的提取记录
    const j = await act('ai.generate', { projectId: p.id, type, workId })
    if (j) { toast('正在从项目资料中提取…'); hooks.track(j, done => { if (done.extraction) openExtraction(done.extraction) }) }
    return
  }
  S.draftType = type
  S.draftTypes = [type]
  S.atab = 'draft'
  S.aiOpen = true
  hooks.renderAI()
  document.getElementById('app').classList.remove('ai-off')
  toast('在右侧「起草成果」中可先让 AI 规划结构，再起草')
}

Object.assign(ACT, {
  ptab: el => { S.ptab = el.dataset.k; render($('#view')) },
  'ask-ai': el => { hooks.fill(el.dataset.q) },
  'open-deliverable': el => openDeliverable(el.dataset.p, el.dataset.d, el.dataset.v),
  'work-ai': el => workAI(el.dataset.t, el.dataset.w),
  'work-upload': async el => {
    const x = S.project
    const [file] = await pick({ multiple: false })
    if (!file) return
    const d = await act('deliverable.ensure', { projectId: x.project.id, type: el.dataset.t, workId: el.dataset.w })
    if (!d) return
    if (await act('deliverable.upload', { id: d.id, name: file.name, data: await toB64(file), note: '人工上传' }, '已上传为新版本')) loadProject()
  },
  'work-menu': el => {
    const x = S.project
    const w = x.works.find(z => z.id === el.dataset.w)
    menuAt(el, [`<div class="hd">${esc(w.type)}</div>`, mi('work-assign', '指定负责人 / 期限', { w: w.id }, { ic: 'user', disabled: !can('project.edit') }), mi('work-status', w.status === 'doing' ? '标记为待开始' : '标记为进行中', { w: w.id, s: w.status === 'doing' ? 'todo' : 'doing' }, { ic: 'clock', disabled: !can('project.edit') || w.status === 'done' })], 220)
  },
  'work-assign': async el => {
    const x = S.project
    const w = x.works.find(z => z.id === el.dataset.w)
    const r = await dialog(`<h3>${esc(w.type)}</h3><label class="f">负责人<select class="select" name="assignee">${opts(D().users.map(u => [u.id, `${u.name} · ${u.title}`]), w.assignee)}</select></label><label class="f">期限<input class="input" type="date" name="due" value="${w.due ? ymd(w.due) : ''}"></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`)
    if (r && await act('work.update', { projectId: x.project.id, id: w.id, assignee: r.assignee, due: r.due ? new Date(r.due).getTime() : undefined }, '已保存')) loadProject()
  },
  'work-status': async el => { if (await act('work.update', { projectId: S.project.project.id, id: el.dataset.w, status: el.dataset.s })) loadProject() },
  'work-add': async () => {
    const r = await dialog(`<h3>新增工作</h3><label class="f">工作类型<select class="select" name="type">${opts(Object.keys(D().workTypes).map(k => [k, k]), '')}</select></label><label class="f">负责人<select class="select" name="assignee">${opts(D().users.map(u => [u.id, u.name]), D().me.id)}</select></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">添加</button></div>`)
    if (r && await act('work.add', { projectId: S.project.project.id, ...r }, '已添加')) loadProject()
  },
  gate: async () => {
    const x = S.project
    const st = x.workflow.stages.find(s => s.id === x.project.stageId)
    const ok = await confirmBox(`发起「${st.gate.name}」`, `准入条件已满足：${x.readiness.items.map(i => esc(i.work)).join('、')}。<br>发起后系统会通知全部表决人（${esc(st.gate.roles.map(roleName).join('、'))}），表决规则「${RULE[st.gate.rule]}」。${D().settings.automation?.notifyApprovers !== false ? '<br>表决人将收到材料清单与准入检查结果。' : ''}`, { okText: '发起决策' })
    if (ok && await act('project.gate', { id: x.project.id }, '已发起，等待表决')) { S.ptab = 'decide'; await hooks.reload() }
  },
  vote: async el => {
    const opinion = $(`#op-${el.dataset.id}`)?.value ?? ''
    const d = el.dataset.d
    if (d === 'recuse') { if (!(await confirmBox('申请回避', '回避后你不参与本次表决，有效表决人数相应减少。'))) return; if (await act('approval.vote', { id: el.dataset.id, recuse: true }, '已回避')) hooks.reload(); return }
    if (d !== 'pass' && !opinion.trim()) return toast('退回或否决需要填写意见', 'deny')
    if (!(await confirmBox(`确认表决：${RESULT[d]}`, `这是正式决策，提交后不可撤回。${opinion ? `<br>意见：${esc(opinion)}` : ''}`, { okText: `确认${RESULT[d]}`, danger: d === 'reject' }))) return
    const a = await act('approval.vote', { id: el.dataset.id, decision: d, opinion }, '已提交表决')
    if (a) { if (a.status === 'decided') toast(`「${a.gate.name}」已形成结果：${RESULT[a.result]}`, 'ok'); hooks.reload() }
  },
  'project-menu': el => {
    const p = S.project.project
    const cur = S.project.workflow.stages.findIndex(s => s.id === p.stageId)
    menuAt(el, [
      `<div class="hd">${esc(p.name)}</div>`,
      p.status === 'active' ? mi('pctl', '暂停项目', { a: 'pause' }, { ic: 'pause', disabled: !can('project.pause') }) : '',
      p.status === 'paused' ? mi('pctl', '恢复项目', { a: 'resume' }, { ic: 'play', disabled: !can('project.pause') }) : '',
      ['active', 'paused'].includes(p.status) ? mi('pctl', '终止（放弃项目）', { a: 'terminate' }, { ic: 'stop', danger: true, disabled: !can('project.pause') }) : '',
      p.status === 'terminated' ? mi('pctl', '重新推进', { a: 'restart' }, { ic: 'play', disabled: !can('project.pause') }) : '',
      cur > 0 ? mi('sendback', '退回到之前阶段补充', {}, { ic: 'left', disabled: !canOp('op.pm.confirm') }) : '',
      '<hr>',
      mi('pexport', '导出项目（JSON）', {}, { ic: 'download', disabled: !can('project.export') }),
      mi('pdelete', '删除项目', {}, { ic: 'x', danger: true, disabled: !can('project.delete'), why: '删除项目需要管理层（合伙人）权限' }),
    ], 230)
  },
  pctl: async el => {
    const a = el.dataset.a
    const reason = await askText({ pause: '暂停项目', resume: '恢复项目', terminate: '终止项目', restart: '重新推进' }[a], '原因（记入项目动态）')
    if (reason && await act('project.control', { id: S.sel, action: a, reason }, '已更新')) hooks.reload()
  },
  sendback: async () => {
    const x = S.project
    const cur = x.workflow.stages.findIndex(s => s.id === x.project.stageId)
    const r = await dialog(`<h3>退回补充</h3><label class="f">退回到<select class="select" name="stageId">${opts(x.workflow.stages.slice(0, cur + 1).map(s => [s.id, s.name]), x.workflow.stages[Math.max(0, cur - 1)].id)}</select></label><label class="f">原因<textarea class="input area" name="reason" required></textarea></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn danger" data-dlg="ok">退回</button></div>`)
    if (r && await act('project.sendback', { id: x.project.id, ...r }, '已退回')) hooks.reload()
  },
  pexport: async () => { const data = await act('export', { id: S.sel }); if (data) import('/api/investai?asset=ui.js').then(u => u.saveText(`${S.project.project.name}-导出.json`, JSON.stringify(data, null, 2), 'application/json')) },
  pdelete: async () => {
    const p = S.project.project
    const r = await confirmBox('删除项目', `删除「${esc(p.name)}」后项目将从列表移除；变更历史保留，可由管理员回滚恢复。资料原文件不受影响。`, { danger: true, okText: '删除', typed: p.name })
    if (r && await act('project.delete', { id: p.id, confirm: r.confirm }, '已删除')) { S.project = null; await hooks.reload(); hooks.go('pipeline') }
  },
  'edit-fields': async () => {
    const p = S.project.project
    const F = { round: '融资轮次', amount: '投资金额', valuation: '估值', terms: '关键条款' }
    const r = await dialog(`<h3>编辑项目信息</h3>${Object.entries(F).map(([k, l]) => p.fields[k]?.hidden ? `<label class="f">${l}<input class="input" disabled value="无权查看或修改"></label>` : `<label class="f">${l}<input class="input" name="${k}" value="${esc(p.fields[k] ?? '')}"></label>`).join('')}<label class="f">简介<textarea class="input area" name="desc">${esc(p.desc ?? '')}</textarea></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`)
    if (!r) return
    const { desc, ...fields } = r
    if (await act('project.update', { id: p.id, desc, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')) }, '已保存（变更已记录）')) hooks.reload()
  },
  members: async () => {
    const p = S.project.project
    const ROLES = [['pm', '项目经理'], ['analyst', '投资经理/分析师'], ['finance', '财务'], ['legal', '法务'], ['risk', '风控'], ['postinv', '投后']]
    const r = await dialog(`<h3>项目成员与授权</h3><div class="mtable">${D().users.map(u => { const m = p.members.find(z => z.userId === u.id); const g = (S.project.project.grants ?? []).find(z => z.userId === u.id); return `<div class="row"><span style="width:120px">${esc(u.name)} <span class="dim">${esc(u.title)}</span></span><select class="select sm" name="m_${u.id}">${opts(ROLES, m?.role, '非成员')}</select><label class="dim"><input type="checkbox" name="g_${u.id}" ${g ? 'checked' : ''}> 指定授权</label></div>` }).join('')}</div><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`, { wide: true })
    if (!r) return
    const members = D().users.filter(u => r[`m_${u.id}`]).map(u => ({ userId: u.id, role: r[`m_${u.id}`] }))
    const grants = D().users.filter(u => r[`g_${u.id}`]).map(u => ({ userId: u.id }))
    if (await act('project.members', { id: p.id, members, grants }, '已更新成员与授权')) hooks.reload()
  },
  'proj-upload': async () => {
    const files = await pick()
    for (const file of files) await act('kb.upload', { projectId: S.sel, name: file.name, data: await toB64(file) }, `已上传 ${file.name}`)
    await hooks.reload()
  },
  comment: async () => { const t = $('#cmt')?.value.trim(); if (!t) return; if (await act('comment.add', { projectId: S.sel, text: t })) loadProject() },
  snapshot: async el => {
    const snap = await get('snapshot', { coll: el.dataset.coll, id: el.dataset.id, rev: el.dataset.rev }).catch(e => toast(e.message, 'deny'))
    if (snap) drawer(`${drawerHead(`快照 r${el.dataset.rev}`, `${esc(el.dataset.coll)}/${esc(el.dataset.id)}`)}<div class="body"><pre class="raw">${esc(JSON.stringify(snap, null, 2))}</pre></div>`)
  },
  rollback: async el => {
    const reason = await askText(`回滚到 r${el.dataset.rev}`, '回滚原因（回滚本身也会生成一条新版本记录，可再次回滚）')
    if (reason && await act('history.rollback', { coll: el.dataset.coll, id: el.dataset.id, rev: el.dataset.rev, reason }, '已回滚')) hooks.reload()
  },
  extract: async el => {
    const x = S.project
    const r = await dialog(`<h3>提取：${esc(S.meta.schemas[el.dataset.k].name)}</h3><p>${esc(S.meta.schemas[el.dataset.k].desc ?? '')}</p><div class="flist">${x.files.filter(f => f.chars > 0 || f.ext === '.xlsx').map(f => `<label class="row"><input type="checkbox" name="files" value="${f.id}" data-multi checked>${ficon(f.ext, true)}<span class="grow ell">${esc(f.name)}</span>${levelTag(f.level)}</label>`).join('') || '<div class="dim">没有可提取的资料，请先上传</div>'}</div><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">开始提取</button></div>`)
    if (!r) return
    toast('提取中…')
    const res = await act('extract.run', { projectId: x.project.id, schema: el.dataset.k, fileIds: r.files })
    if (res) { await loadProject(); openExtraction(res.id) }
  },
  extraction: el => openExtraction(el.dataset.id),
  'fill-new': async () => {
    const r = await dialog(`<h3>生成外部填报链接</h3><div class="f">需要对方填写的字段<div class="chips">${S.meta.fillFields.map((f, i) => `<label class="tag"><input type="checkbox" name="fields" value="${esc(f)}" data-multi ${i < 12 ? 'checked' : ''}>${esc(f)}</label>`).join('')}</div></div>
      <div class="row"><label class="f grow">有效期（天）<input class="input" type="number" name="days" value="7" min="1" max="14"></label><label class="f grow">对方联系人<input class="input" name="contact" placeholder="如：某公司 CFO 王总"></label></div>
      <label class="f"><span><input type="checkbox" name="allowFiles" checked> 允许上传附件（≤3 个，合计 ≤5MB）</span></label><label class="f">给对方的说明<textarea class="input area" name="note" placeholder="如：请填写贵司基本信息并上传最近一期财务报表"></textarea></label>
      <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">生成链接</button></div>`, { wide: true })
    if (!r) return
    const link = await act('fill.create', { projectId: S.sel, ...r })
    if (!link) return
    const url = `${location.origin}/fill/${link.token}`
    await dialog(`<h3>链接已生成</h3><div class="infobox">链接只显示这一次（系统只保存其哈希）。请通过安全渠道发送给对方。</div><input class="input mono" value="${esc(url)}" readonly style="width:100%"><div class="dim" style="font-size:11.5px;margin-top:6px">${D().mode === 'saas' ? '' : '⚠ 桌面插件模式下该链接只能在本机打开；对外使用需部署 SaaS 服务端。'}</div><div class="acts"><button class="btn pri" data-dlg="no">完成</button></div>`)
    loadProject()
  },
  'fill-revoke': async el => { if (await confirmBox('撤销链接', '撤销后对方将无法再打开或提交。') && await act('fill.revoke', { id: el.dataset.id }, '已撤销')) loadProject() },
  // 成果操作
  'dl-download': () => { const d = S.project.deliverables.find(z => z.id === S.drawer.did); const ver = d.versions.find(z => z.v === S.drawer.v); downloadFile(ver.fileId) },
  'dl-print': () => { const d = S.project.deliverables.find(z => z.id === S.drawer.did); printDoc(`${S.project.project.name} · ${d.type}`, S.drawer.text, `v${S.drawer.v} · ${DL_STATUS[d.status]} · ${D().settings.org?.name ?? ''}`) },
  'dl-checkout': async () => { const r = await act('deliverable.checkout', { id: S.drawer.did }); if (r) { toast('已用本机 Office 打开工作副本；保存后点「提交编辑」', 'ok'); await loadProject(); openDeliverable(S.drawer.pid, S.drawer.did) } },
  'dl-checkin': async () => { const note = await askText('提交编辑', '修改说明（可选）', { required: false, area: false }); if (note === null) return; const r = await act('deliverable.checkin', { id: S.drawer.did, note }, '已保存为新版本'); if (r) { await loadProject(); openDeliverable(S.drawer.pid, S.drawer.did) } },
  'dl-edit': async () => {
    const r = await dialog(`<h3>在线编辑（保存为新版本，原版本保留）</h3><textarea class="input area mono" name="text" style="height:56vh">${esc(S.drawer.text)}</textarea><label class="f">修改说明<input class="input" name="note"></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存为新版本</button></div>`, { wide: true })
    if (r && await act('deliverable.save', { id: S.drawer.did, text: r.text, note: r.note }, '已保存为新版本')) { await loadProject(); openDeliverable(S.drawer.pid, S.drawer.did) }
  },
  'dl-rewrite': async () => {
    const sections = [...S.drawer.text.matchAll(/^##\s+(.+)$/gm)].map(m => m[1])
    const r = await dialog(`<h3>AI 改写章节</h3><p>只改写选定章节，其他章节原样保留；结果保存为新版本。需要可用的模型。</p><label class="f">章节<select class="select" name="section">${opts(sections.map((s, i) => [i, s]), 0)}</select></label><label class="f">改写要求<textarea class="input area" name="instruction" required placeholder="如：补充竞争对手对比，数字须引用资料"></textarea></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">改写</button></div>`)
    if (!r) return
    const j = await act('ai.rewrite', { deliverableId: S.drawer.did, section: Number(r.section), instruction: r.instruction })
    if (j) { hooks.track(j); closeDrawer(); toast('AI 改写中，完成后生成新版本') }
  },
  'dl-restore': async () => { if (await act('deliverable.restore', { id: S.drawer.did, v: S.drawer.v }, `已把 v${S.drawer.v} 恢复为新版本`)) { await loadProject(); openDeliverable(S.drawer.pid, S.drawer.did) } },
  'dl-submit': async () => { if (await act('deliverable.submit', { id: S.drawer.did }, '已提交审核；AI 预审结果将附在版本上')) { await hooks.reload(); setTimeout(() => openDeliverable(S.drawer.pid, S.drawer.did), 600) } },
  'dl-final': async () => {
    if (!(await confirmBox(`定稿 v${S.drawer.v}`, '定稿后该成果成为本阶段准入材料，内容锁定；如需修改须由有权人员撤回定稿。定稿只能由你本人操作，AI 不能定稿。', { okText: '确认定稿' }))) return
    if (await act('deliverable.finalize', { id: S.drawer.did, v: S.drawer.v }, '已定稿')) { await hooks.reload(); openDeliverable(S.drawer.pid, S.drawer.did) }
  },
  'dl-reject': async () => { const reason = await askText('退回修改', '退回意见'); if (reason && await act('deliverable.reject', { id: S.drawer.did, reason }, '已退回')) { await hooks.reload(); closeDrawer() } },
  'dl-reopen': async () => { const reason = await askText('撤回定稿', '撤回原因（记入历史）'); if (reason && await act('deliverable.reopen', { id: S.drawer.did, reason }, '已撤回定稿')) { await hooks.reload(); openDeliverable(S.drawer.pid, S.drawer.did) } },
})

// ───────── 提取结果审核 ─────────
export async function openExtraction(id) {
  const x = await get('extraction', { id }).catch(e => { toast(e.message, 'deny'); return null })
  if (!x) return
  S.drawer = { extraction: id }
  const pending = x.status === 'pending'
  const src = s => s ? `${esc(String(s.path ?? '').split('/').pop())}${s.page ? ` 第${s.page}页` : ''}` : ''
  const srcBtn = s => s?.fileId ? `<button class="src" data-act="file" data-id="${s.fileId}" title="${esc(s.quote ?? '')}">${src(s)}</button>` : s ? `<span class="src" title="${esc(s.quote ?? '')}">${src(s)}</span>` : ''
  let body = ''
  if (x.rows) body = `<div class="tablebox"><table class="t"><thead><tr>${pending ? '<th style="width:28px"></th>' : ''}<th>字段</th><th>值</th><th>来源（原文）</th></tr></thead><tbody>${x.rows.map(r => `<tr class="xr ${r.status}">${pending ? `<td>${r.status === 'hidden' ? '' : `<input type="checkbox" class="ck" data-xk="${esc(r.key)}" ${r.status === 'found' ? 'checked' : ''}>`}</td>` : ''}
      <td><b>${esc(r.key)}</b>${r.period ? ` <span class="dim">${esc(r.period)}</span>` : ''}</td>
      <td>${r.status === 'hidden' ? `<span class="masked">●●●● ${icon('lock', 12)}</span> <span class="dim">${esc(r.note ?? '')}</span>` : pending ? `<input class="input sm" data-xv="${esc(r.key)}" value="${esc(r.value ?? '')}" placeholder="${r.status === 'missing' ? '资料中未找到，可人工补充' : ''}">` : esc(r.value ?? '—')}
        ${r.status === 'conflict' ? `<div class="bad" style="font-size:11.5px">⚠ 多源冲突：${(r.alternatives ?? []).map(a => `${esc(a.value)}（${src(a.source)}）`).join('；')}</div>` : ''}${r.status === 'missing' ? '<div class="warn-t" style="font-size:11.5px">缺失：资料中未找到，未做推测</div>' : ''}${r.byModel ? '<div class="dim" style="font-size:11px">模型提取 · 已核对原文</div>' : ''}</td>
      <td>${srcBtn(r.source)}${r.source?.quote ? `<div class="dim ell" style="font-size:11px;max-width:300px">「${esc(r.source.quote)}」</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
  else if (x.fin) body = `${pending ? '<div class="dim" style="font-size:12px;margin-bottom:6px">勾选要写入指标库的数值；冲突单元格请从下拉中选定核实后的值。</div>' : ''}<div class="tablebox"><table class="t"><thead><tr><th>指标（亿元）</th>${x.fin.periods.map(p => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${x.fin.grid.map(g => `<tr><td><b>${esc(g.metric)}</b></td>${x.fin.periods.map(p => { const c = g.cells[p]; const key = `${g.metric}|${p}`; return `<td class="${c?.conflict ? 'xr conflict' : !c ? 'xr missing' : ''}">${c ? `${pending ? `<label class="row" style="gap:4px"><input type="checkbox" class="ck" data-xk="${esc(key)}" ${c.conflict ? '' : 'checked'}>` : ''}${c.conflict && pending ? `<select class="select sm" data-xv="${esc(key)}">${[c, ...c.conflict].map(z => `<option value="${z.yi}">${z.yi.toFixed(2)}（${esc(src(z.source))}）</option>`).join('')}</select>` : c.yi.toFixed(2)}${pending ? '</label>' : ''}${c.conflict && !pending ? `<div class="bad" style="font-size:11px">冲突：${c.conflict.map(z => `${z.yi.toFixed(2)}（${src(z.source)}）`).join('；')}</div>` : ''}<div>${srcBtn(c.source)}</div>` : '<span class="dim">缺失</span>'}</td>` }).join('')}</tr>`).join('')}</tbody></table></div>
    ${x.fin.derived?.length ? `<div class="sec">衍生指标（由上表计算）</div><div class="chips">${x.fin.derived.map(d => `<span class="tag">${esc(d.metric)} ${esc(d.period)}：${esc(d.value)}</span>`).join('')}</div>` : ''}`
  else if (x.dd) body = `<div class="tablebox"><table class="t"><thead><tr>${pending ? '<th style="width:28px"></th>' : ''}<th>类别</th><th>发现</th><th>严重度</th><th>状态</th><th>来源</th></tr></thead><tbody>${x.dd.map((r, i) => `<tr>${pending ? `<td><input type="checkbox" class="ck" data-xk="${i}" checked></td>` : ''}<td>${esc(r.category)}</td><td>${esc(r.finding)}</td><td><span class="pill sev-${r.severity}">${esc(r.severity)}</span></td><td>${esc(r.status)}</td><td>${srcBtn(r.source)}</td></tr>`).join('')}</tbody></table></div>`
  drawer(`${drawerHead(`${esc(x.name)} <span class="pill ${pending ? 'st-0' : 'st-4'}">${pending ? '待人工确认' : '已确认入库'}</span>`, `${esc(x.engine ?? '')} · ${esc(x.by ?? '')} · ${fmt(x.createdAt)}${x.origin === 'fill' ? ' · 来自外部填报' : ''}`)}
    <div class="checks">${x.missing?.length ? `<div class="ccheck warn">缺失 ${x.missing.length} 项：${x.missing.map(esc).join('、')}</div>` : '<div class="ccheck ok">字段齐全</div>'}${x.conflicts?.length ? `<div class="ccheck bad">多源冲突 ${x.conflicts.length} 项：${x.conflicts.map(c => esc(typeof c === 'string' ? c : c.key ?? c.metric)).join('、')} — 请核实后选择正确值</div>` : ''}</div>
    <div class="body">${body}${x.sources?.length ? `<div class="sec">资料来源</div><div class="srcs">${x.sources.map(s => s.fileId ? `<button class="src" data-act="file" data-id="${s.fileId}">[${s.n}] ${esc(String(s.path).split('/').pop())}</button>` : `<span class="src">[${s.n}] ${esc(s.path)}</span>`).join('')}</div>` : ''}</div>
    <footer><button class="btn sm" data-act="x-export">${icon('download', 13)}导出 Excel</button>${x.markdown ? '<button class="btn sm" data-act="x-print">导出 PDF</button>' : ''}<span class="grow"></span>${pending && can('company.confirm') ? `<button class="btn sm pri" data-act="x-confirm">${icon('check', 13)}确认勾选项并入库</button>` : pending ? '<span class="dim">需要「确认公司信息」权限</span>' : `<span class="ok">✓ 已由 ${esc(x.confirmedBy ?? '')} 确认</span>`}</footer>`, true)
}
hooks.openExtraction = openExtraction
Object.assign(ACT, {
  'x-export': async () => { const r = await act('extract.export', { id: S.drawer.extraction }); if (r) saveB64(r.name, r.data, r.mime) },
  'x-print': async () => { const x = await get('extraction', { id: S.drawer.extraction }); printDoc(x.name, x.markdown ?? '', x.engine) },
  'x-confirm': async () => {
    const accept = $$('[data-xk]').filter(i => i.checked).map(i => i.dataset.xk)
    const edits = Object.fromEntries($$('[data-xv]').filter(i => accept.includes(i.dataset.xv) && i.value.trim()).map(i => [i.dataset.xv, i.value.trim()]))
    if (!accept.length) return toast('请至少勾选一项', 'deny')
    const x = await get('extraction', { id: S.drawer.extraction })
    const where = { bp: '公司库（融资金额、估值、轮次同步到项目信息）', financial: '指标库', dd: '尽调发现清单' }[x.schema]
    if (!(await confirmBox('确认入库', `将把勾选的 ${accept.length} 项写入${where}，保留来源与确认人。冲突项请确认已选定核实后的值。`))) return
    const r = await act('extract.confirm', { id: S.drawer.extraction, accept, edits }, '已确认入库')
    if (r) { if (r.overwritten?.length) toast(`已更新公司库中原有的：${r.overwritten.join('、')}（旧值保留在历史中）`); await hooks.reload(); openExtraction(S.drawer.extraction) }
  },
})
