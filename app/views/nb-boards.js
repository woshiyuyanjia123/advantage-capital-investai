// 点击 NotebookLM 笔记展开多维看板：阶段推进看板 / 成果与插件提交看板 / 数据与冲突核验看板 / 投决门禁看板 / 待办与笔记编辑器
import { S, D, ACT, hooks, $, esc, md, icon, avatar, get, act, drawer, drawerHead, toast, userName, fmt, ymd, DL_STATUS, WORK_STATUS, RESULT, RULE } from '/api/investai?asset=ui.js'

let boardSt = { projectId: null, tab: 'stages', noteId: null }
const BTABS = [
  ['stages', '① 阶段流程看板'],
  ['deliverables', '② 成果与插件提交看板'],
  ['evidence', '③ 数据提取与冲突看板'],
  ['gates', '④ 投决表决与门禁看板'],
  ['tasks', '⑤ 会议待办与笔记正文'],
]

export async function openNoteBoards(projectId, { tab = 'stages', noteId = null } = {}) {
  const x = S.project?.project?.id === projectId ? S.project : await get('project', { id: projectId })
  S.project = x
  boardSt = { projectId, tab, noteId }
  renderBoardDrawer()
}

function renderBoardDrawer() {
  const x = S.project
  const p = x.project
  const f = p.flow ?? { overallPct: p.progress ?? 0, stageDetails: [] }
  const note = (x.notes ?? []).find(n => n.id === boardSt.noteId) ?? x.notes?.[0]
  drawer(`${drawerHead(`🗂️ ${esc(p.name)} · 笔记多维看板（总进度 ${f.overallPct}%）`, note ? `当前关联笔记：${esc(note.title)}` : '点击下方页签切换各类管理看板')}
    <div class="nb-board-tabs">${BTABS.map(([k, l]) => `<button class="btn sm ${boardSt.tab === k ? 'pri' : ''}" data-act="nb-btab" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="body">${renderBoardTab(boardSt.tab, x, note)}</div>`, true)
}

function renderBoardTab(tab, x, note) {
  const p = x.project
  const f = p.flow ?? { stageDetails: [], submissions: [] }
  if (tab === 'stages') {
    return `<div class="kanban">${x.workflow.stages.map((s, idx) => {
      const ws = x.works.filter(w => w.stageId === s.id)
      const pct = f.stageDetails?.[idx]?.pct ?? 0
      return `<div class="kcol"><div class="khd"><b>${idx + 1}. ${esc(s.name)}</b><span>${pct}%</span></div>
        ${ws.map(w => `<div class="kcard" data-act="work-ai" data-t="${esc(w.type)}" data-w="${w.id}"><b>${esc(w.type)}</b>
          <div class="dim">${esc(w.assigneeName || '')} · ${WORK_STATUS[w.status] || w.status}</div></div>`).join('') || '<div class="empty">无必做项</div>'}</div>`
    }).join('')}</div>`
  }
  if (tab === 'deliverables') {
    return `<div class="row" style="margin-bottom:10px"><button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-ch="plugin-draft">插件起草并提交</button>
      <button class="btn sm" data-act="nb-plug-upload" data-p="${p.id}">上传本地文件提交</button></div>
      <div class="works">${x.deliverables.map(d => `<div class="wcard"><div class="row"><b class="grow">${esc(d.type)}</b><span class="pill dl-${d.status}">${DL_STATUS[d.status]} v${d.versions.length}</span></div>
        <div class="dim" style="margin:4px 0">${d.checkout ? `📝 本地编辑中：${esc(d.checkout.name)}` : `格式：${esc(d.format.toUpperCase())}`}</div>
        <div class="wacts"><button class="btn sm" data-act="open-deliverable" data-p="${p.id}" data-d="${d.id}">查看版本</button>
          ${d.checkout ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-d="${d.id}" data-ch="local-checkin">回传本地修改</button>` : ''}
          ${d.status === 'draft' && d.versions.length ? `<button class="btn sm pri" data-act="nb-plug-sub" data-p="${p.id}" data-d="${d.id}" data-ch="review-submit">提交审核</button>` : ''}</div></div>`).join('') || '<div class="empty">暂无成果</div>'}</div>`
  }
  if (tab === 'evidence') {
    return `<div class="row" style="margin-bottom:10px">${Object.entries(S.meta?.schemas ?? {}).map(([k, s]) => `<button class="btn sm" data-act="extract" data-k="${k}">${esc(s.name)}</button>`).join('')}</div>
      ${x.extractions.map(e => `<div class="li2" data-act="extraction" data-id="${e.id}"><div class="grow"><b>${esc(e.name)}</b>
        <div class="dim">缺失 ${e.missing?.length ?? 0} 项 · 冲突 ${e.conflicts?.length ?? 0} 项 · ${fmt(e.createdAt)}</div></div>
        <span class="pill ${e.status === 'confirmed' ? 'st-4' : 'st-0'}">${e.status === 'confirmed' ? '已确认' : '待核对'}</span></div>`).join('') || '<div class="empty">点击上方按钮从勾选资料提取结构化表格与冲突核对</div>'}`
  }
  if (tab === 'gates') {
    return `<div class="box" style="margin-bottom:10px"><b>当前门禁准入完成度：${f.curStagePct ?? 0}%</b>
      <div class="ready" style="margin-top:8px">${x.readiness.items.map(i => `<div class="ri ${i.ok ? 'ok' : ''}"><i>${i.ok ? '✓' : '○'}</i>${esc(i.work)}<span>${esc(i.status)}</span></div>`).join('')}</div></div>
      ${x.approvals.map(a => `<div class="li2"><div class="grow"><b>${esc(a.gate.name)}</b> · ${esc(RULE[a.gate.rule] || '')}</div><span class="pill">${a.status === 'pending' ? '表决中' : RESULT[a.result] || a.status}</span></div>`).join('') || '<div class="empty">暂无上会记录</div>'}`
  }
  return `<div class="setgrid"><div class="box"><h3>会议与阶段待办（${x.tasks.length}）</h3>
      ${x.tasks.map(t => `<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" class="ck" ${t.done ? 'checked' : ''} data-act="task" data-id="${t.id}">
        <div class="grow"><div class="tt">${esc(t.title)}</div><div class="dim">${esc(userName(t.owner))} · ${ymd(t.due)}</div></div></div>`).join('') || '<div class="empty">暂无待办</div>'}</div>
    <div class="box"><h3>本地编辑当前笔记</h3>
      <input class="input sm" id="nbNoteTitle" style="width:100%;margin-bottom:6px" value="${esc(note?.title || `${p.name} 推进笔记`)}">
      <textarea class="input area mono" id="nbNoteBody" style="height:210px">${esc(note?.content || note?.summary || '')}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="nb-note-save" data-id="${esc(note?.id || '')}">保存笔记</button></div></div></div>`
}

Object.assign(ACT, {
  'nb-open-board': el => openNoteBoards(el.dataset.p || S.sel, { tab: el.dataset.b || 'stages', noteId: el.dataset.n || null }),
  'nb-btab': el => { boardSt.tab = el.dataset.k; renderBoardDrawer() },
  'nb-note-save': async el => {
    const r = await act('nb.note.save', { projectId: boardSt.projectId, id: el.dataset.id, title: $('#nbNoteTitle')?.value, content: $('#nbNoteBody')?.value, board: boardSt.tab }, '✅ 笔记已保存')
    if (r) { S.project.notes = r; renderBoardDrawer(); hooks.refresh() }
  },
})
