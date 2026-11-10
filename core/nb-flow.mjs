// NotebookLM × FDE：阶段进度百分比计算、插件提交记录与笔记存储
import { randomBytes } from 'node:crypto'

const idOf = p => `${p}_${randomBytes(4).toString('hex')}`

export function computeFlowMetrics(db, engine, p) {
  const wf = engine.def(p)
  const stages = wf.stages ?? []
  const curIdx = Math.max(0, stages.findIndex(s => s.id === p.stageId))
  const r = engine.readiness(p)
  const dls = db.find('deliverables', d => d.projectId === p.id)
  const stageDetails = stages.map((st, idx) => {
    const works = (p.works ?? []).filter(w => w.stageId === st.id)
    const reqs = works.filter(w => w.required)
    const doneCount = works.filter(w => {
      const d = w.deliverableId && db.get('deliverables', w.deliverableId)
      return w.status === 'done' || d?.status === 'final'
    }).length
    const draftCount = works.filter(w => {
      const d = w.deliverableId && db.get('deliverables', w.deliverableId)
      return d?.versions?.length > 0 && d.status !== 'final'
    }).length
    const pct = idx < curIdx ? 100 : works.length
      ? Math.min(100, Math.round(((doneCount + draftCount * 0.5) / works.length) * 100))
      : (idx === curIdx ? 50 : 0)
    return {
      id: st.id, name: st.name, index: idx,
      state: idx < curIdx ? 'done' : idx === curIdx ? 'active' : 'upcoming',
      gate: st.gate?.name ?? null, worksCount: works.length,
      reqCount: reqs.length, doneCount, draftCount, pct,
    }
  })
  const curStagePct = stageDetails[curIdx]?.pct ?? 0
  const overallPct = p.status === 'completed' ? 100 : stages.length
    ? Math.min(99, Math.round(((curIdx + curStagePct / 100) / stages.length) * 100))
    : p.progress ?? 0
  const submissions = (db.get('kvstate', `sub_${p.id}`)?.list ?? []).slice(0, 30)
  const checkoutCount = dls.filter(d => d.checkout).length
  return { overallPct, curStagePct, curIdx, stageCount: stages.length, readinessOk: r.ok, readinessItems: r.items, stageDetails, submissions, checkoutCount }
}

export function listNotes(db, projectId) {
  const rec = db.get('kvstate', `notes_${projectId}`)
  if (rec?.list) return rec.list
  const p = db.get('projects', projectId)
  if (!p) return []
  const dls = db.find('deliverables', d => d.projectId === projectId)
  const seed = dls.slice(0, 4).map(d => ({
    id: `dl_${d.id}`, title: `${d.type}（${d.status === 'final' ? '已定稿' : '草稿'}）`,
    tag: d.format.toUpperCase(), board: 'deliverables', deliverableId: d.id,
    summary: `共 ${d.versions.length} 个版本 · 支持左上工坊本地编辑与插件提交`,
    pinned: d.status !== 'final', updatedAt: p.updatedAt || Date.now(),
  }))
  seed.unshift({
    id: idOf('nt'), title: `${p.name} · 尽调与推进总览看板`,
    tag: '看板入口', board: 'stages', pinned: true,
    summary: '点击此笔记打开五维项目看板：阶段流程、插件交付、数据核验、投决门禁、待办时间轴。',
    content: `# ${p.name} 项目推进笔记\n\n- 当前阶段进度与必做成果实时同步\n- 点击上方看板页签切换不同管理视图`,
    updatedAt: Date.now(),
  })
  return seed
}

export function saveNote(db, user, projectId, b) {
  const list = listNotes(db, projectId).filter(n => !String(n.id).startsWith('dl_'))
  const id = b.id && !String(b.id).startsWith('dl_') ? String(b.id) : idOf('nt')
  const prev = list.find(n => n.id === id)
  const item = {
    id, title: String(b.title || prev?.title || '新建项目笔记').slice(0, 80),
    tag: String(b.tag || prev?.tag || '投研笔记').slice(0, 20),
    board: String(b.board || prev?.board || 'stages'),
    summary: String(b.summary || String(b.content || '').replace(/[#*>`-]/g, '').trim().slice(0, 90) || '点击查看笔记与看板'),
    content: String(b.content ?? prev?.content ?? '').slice(0, 50000),
    pinned: b.pinned !== undefined ? !!b.pinned : (prev?.pinned ?? false),
    by: user.name, updatedAt: Date.now(),
  }
  const next = [item, ...list.filter(n => n.id !== id)]
  db.put('kvstate', { id: `notes_${projectId}`, list: next }, { actor: user, reason: `保存笔记 ${item.title}`, action: 'note' })
  return listNotes(db, projectId)
}

export function deleteNote(db, user, projectId, noteId) {
  const list = listNotes(db, projectId).filter(n => !String(n.id).startsWith('dl_') && n.id !== noteId)
  db.put('kvstate', { id: `notes_${projectId}`, list }, { actor: user, reason: '删除项目笔记', action: 'note' })
  return listNotes(db, projectId)
}
