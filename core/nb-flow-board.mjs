// 第三界面（企业全流程提交与四层权限协同看板）：支持左下角成品直接提交、人工轻微修改后自主提交与权限透视
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { extractAny } from './office.mjs'
import { listProjectArtifacts } from './nb-folder.mjs'

export async function buildFlowBoardState({ db, org, engine, lifecycle, dir }, user, p) {
  const wf = engine.def(p)
  const r = engine.readiness(p)
  const wsPath = db.one('mounts', x => x.kind === 'workspace')?.path ?? dir
  const arts = await listProjectArtifacts(db, wsPath, p)
  const caps = org.capabilities(user)
  const users = db.all('users').filter(u => !u.disabled).map(u => ({
    id: u.id, name: u.name, title: u.title, roles: u.roles,
    canFinalize: org.canOp(u, 'op.material.finalize'),
    canVote: org.canOp(u, 'op.ic.vote'),
    canSubmit: org.can(u, 'deliverable.review'),
    canEdit: org.can(u, 'deliverable.edit'),
  }))
  const stages = (wf.stages ?? []).map((st, idx) => {
    const works = (p.works ?? []).filter(w => w.stageId === st.id).map(w => {
      const d = w.deliverableId ? db.get('deliverables', w.deliverableId) : null
      const stub = d ?? { projectId: p.id, type: w.type, status: 'draft', versions: [] }
      return {
        ...w, assigneeName: db.get('users', w.assignee)?.name || '未指派',
        deliverable: d ? { id: d.id, type: d.type, format: d.format, status: d.status, v: d.versions.length, finalV: d.finalV, checkout: d.checkout } : null,
        perms: lifecycle.actions(user, stub),
        holders: {
          edit: lifecycle.holders(stub, 'edit').slice(0, 4),
          submit: lifecycle.holders(stub, 'submit').slice(0, 4),
          finalize: lifecycle.holders(stub, 'finalize').slice(0, 4),
        },
      }
    })
    return { id: st.id, name: st.name, index: idx, current: st.id === p.stageId, gate: st.gate ?? null, works }
  })
  return { projectId: p.id, stageId: p.stageId, readiness: r, caps, users, stages, artifacts: arts }
}

/** 将图1左下角项目专属文件夹中的成品（或人工微调后的正文）一键挂载并自主提交到流程节点 */
export async function submitArtifactToNode({ db, deliverables, lifecycle }, user, p, b) {
  // 成品只能是本项目文件夹里登记过的文件：按名字找登记记录，用记录里的路径，不读请求里给的任意路径
  const arts = db.get('kvstate', `artifacts_${p.id}`)?.list ?? []
  const art = b.artifactPath || b.artifactName ? arts.find(a => a.name === b.artifactName) ?? arts.find(a => a.fullPath === b.artifactPath) : null
  if ((b.artifactPath || b.artifactName) && !art) throw Object.assign(new Error('只能报送本项目文件夹里的成品'), { status: 400 })
  // 报送到哪个工作项：明确指定的优先；否则用成品生成时对应的工作项类型。没有对应项时报错，不默认塞进第一个工作项
  const works = p.works ?? []
  const wantType = b.workType || b.targetWorkType || art?.workType
  const work = works.find(w => w.id === b.workId) ?? (wantType ? works.find(w => w.type === wantType && w.stageId === p.stageId) ?? works.find(w => w.type === wantType) : null)
  if (!work && !wantType) throw Object.assign(new Error('这份成品没有对应的工作项，请在「阶段门禁」页选择要报送到哪一项'), { status: 400 })
  const workType = work?.type || wantType
  const d = deliverables.ensure(p.id, workType, { workId: work?.id }, user)
  if (d.status === 'final') deliverables.reopen(user, d.id, '补充提交新成品版本')
  const note = String(b.note || '从右下角成品池自主提交至流程节点').slice(0, 160)
  let ver
  if (typeof b.editedText === 'string' && b.editedText.trim()) {
    ver = await deliverables.saveText(user, d.id, b.editedText, `${note}（含人工微调）`)
  } else if (art && art.deliverableId === d.id && db.get('deliverables', d.id)?.versions?.at(-1)?.v === art.version) {
    // 生成时已经作为这个工作项的最新版本存过，直接报送，不重复加版本
    ver = { deliverable: db.get('deliverables', d.id), version: { v: art.version } }
  } else if (art) {
    const buf = await readFile(art.fullPath)
    const ext = extname(art.fullPath).toLowerCase()
    if (ext === `.${d.format}`) {
      ver = await deliverables.addVersion(user, d, { buffer: buf, ext, engine: '项目专属夹成品直交', note })
    } else {
      const extracted = await extractAny(buf, ext).catch(() => ({ text: '' }))
      ver = await deliverables.saveText(user, d.id, extracted.text || `# ${d.title}\n\n- 关联成品：${art.name}`, note)
    }
  } else {
    throw Object.assign(new Error('请选择成品文件或填写微调内容'), { status: 400 })
  }
  let finalStatus = ver.deliverable.status
  if (b.autoSubmitReview && !lifecycle.check(user, ver.deliverable, 'submit')) {
    deliverables.submit(user, d.id)
    finalStatus = 'review'
  }
  if (b.autoFinalize && finalStatus === 'review' && !lifecycle.check(user, db.get('deliverables', d.id), 'finalize')) {
    deliverables.finalize(user, d.id, {})
    finalStatus = 'final'
  }
  return { ok: true, deliverableId: d.id, workType, version: ver.version.v, status: finalStatus }
}
