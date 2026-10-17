// 成果生命周期：「谁能在什么状态下对成果做什么」只在这里判定。
// 接口层、AI（起草 / 改写 / 智能体保存草稿）、会议纪要确认都调用 authorize；前端按钮由 actions 的结果绘制。
//
// 状态：draft 草稿 → review 待审核 → final 已定稿；退回 review→draft；撤回定稿 final→draft；新增版本不改变 review，final 上不能新增版本。
import { AI_LEVELS } from './org.mjs'

export const DL_STATUS = { draft: '草稿', review: '待审核', final: '已定稿' }
const fail = (m, status = 400) => Object.assign(new Error(m), { status })

/** 每个动作：需要的状态、权限，以及给用户看的说明。 */
const RULES = {
  edit: { label: '编辑 / 上传新版本', from: ['draft', 'review'] },
  aiWrite: { label: '让 AI 起草或改写', from: ['draft', 'review'] },
  submit: { label: '提交审核', from: ['draft'], needVersion: true },
  finalize: { label: '定稿', from: ['review'], needVersion: true },
  reject: { label: '退回修改', from: ['review'] },
  reopen: { label: '撤回定稿', from: ['final'] },
}

export function createLifecycle({ db, org }) {
  const projectOf = d => db.get('projects', d.projectId)

  /** 返回 null 表示允许，否则返回原因（字符串）。不抛错，供 actions 与 authorize 共用。 */
  function check(user, d, action) {
    const rule = RULES[action]
    if (!rule) return `未知操作：${action}`
    const p = projectOf(d)
    if (!p || !org.seesProject(user, p)) return '你无权访问该项目'
    if (['terminated', 'completed'].includes(p.status) && action !== 'reopen') return `项目已${p.status === 'terminated' ? '放弃' : '归档'}，成果不能再修改`
    if (!rule.from.includes(d.status)) return { draft: '成果仍是草稿', review: '成果正在审核中', final: '成果已定稿；如需修改请先撤回定稿' }[d.status] + `，不能${rule.label}`
    if (rule.needVersion && !d.versions?.length) return '还没有任何版本'
    switch (action) {
      case 'edit':
        return org.can(user, 'deliverable.edit') ? null : `你的岗位没有「编辑成果」权限`
      case 'aiWrite': {
        if (!org.can(user, 'deliverable.edit')) return `你的岗位没有「编辑成果」权限`
        const lv = org.aiLevel(user, { businessType: p.businessType, workType: d.type })
        return lv >= 2 ? null : `AI 参与级别为「${AI_LEVELS[lv]}」（按岗位 / 业务类型 / 工作类型配置），不能让 AI 起草`
      }
      case 'submit':
        return org.can(user, 'deliverable.review') ? null : `你的岗位没有「提交审核」权限`
      case 'finalize':
        return org.canOp(user, 'op.material.finalize') ? null : '需要「材料定稿」业务操作权限'
      case 'reject':
        return org.canOp(user, 'op.material.finalize') || org.canOp(user, 'op.pm.confirm') ? null : '需要「材料定稿」或「经理确认」业务操作权限'
      case 'reopen':
        return org.canOp(user, 'op.material.finalize') ? null : '需要「材料定稿」业务操作权限'
    }
    return null
  }

  /** 不允许的原因（含可以操作的人）；允许时返回 null。权限问题 → 403，状态问题 → 409。 */
  function explain(user, d, action) {
    const why = check(user, d, action)
    if (!why) return null
    const stateProblem = !RULES[action]?.from.includes(d.status) || /版本|项目已|无权访问/.test(why)
    const who = stateProblem ? [] : holders(d, action)
    return { why: `${why}${who.length ? `。可以操作的人：${who.slice(0, 5).join('、')}` : ''}`, status: stateProblem ? 409 : 403 }
  }

  /** 不允许时抛出错误（带原因与可以操作的人）。 */
  function authorize(user, d, action) {
    if (!d) throw fail('成果不存在', 404)
    const e = explain(user, d, action)
    if (e) throw Object.assign(fail(e.why, e.status), { action })
    return projectOf(d)
  }

  /** 当前用户对该成果可做的全部动作（前端据此绘制按钮，不可做时点击显示原因）。 */
  function actions(user, d) {
    return Object.fromEntries(Object.keys(RULES).map(a => { const e = explain(user, d, a); return [a, e ? { ok: false, why: e.why } : { ok: true }] }))
  }

  /** 能执行该动作的人（不考虑当前状态）。 */
  function holders(d, action) {
    const asIf = { ...d, status: RULES[action].from[0], versions: d.versions?.length ? d.versions : [{}] }
    return db.find('users', u => !u.disabled && !check(u, asIf, action)).map(u => u.name)
  }

  /** 状态迁移（调用前须已 authorize）。 */
  const NEXT = { submit: 'review', finalize: 'final', reject: 'draft', reopen: 'draft' }
  const next = action => NEXT[action]

  return { check, authorize, actions, holders, next, RULES }
}
