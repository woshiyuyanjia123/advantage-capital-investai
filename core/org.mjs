// 组织与权限（需求 二）：四层权限 + AI 参与级别（需求 三）。所有判断在服务端执行，AI 调用同样经过这里。
//   第一层 功能权限：模块与动作（查看/创建/编辑/提交/审批/导出/归档…）
//   第二层 数据范围：本人 / 本部门 / 指定授权 / 全机构（另有「投后」范围）
//   第三层 业务操作：项目启动授权、经理确认、材料定稿、会议决策、投资审批…（由流程节点引用）
//   第四层 敏感信息：字段类别（金额/估值/条款/基金LP/商业秘密）+ 资料密级（公开/内部/机密/绝密）

export const FUNCTIONS = {
  'project.view': '查看项目', 'project.create': '新建项目', 'project.edit': '编辑项目', 'project.submit': '提交审批',
  'project.pause': '暂停/恢复/终止项目', 'project.archive': '归档项目', 'project.delete': '删除项目', 'project.export': '导出项目', 'project.member': '管理项目成员与授权',
  'material.view': '查看资料', 'material.upload': '上传资料', 'material.export': '导出资料',
  'deliverable.edit': '编辑成果', 'deliverable.review': '提交成果审核',
  'meeting.manage': '管理会议与纪要', 'company.view': '查看公司库', 'company.edit': '编辑公司信息', 'company.confirm': '确认提取/填报信息',
  'fill.manage': '发起外部填报', 'extract.run': '运行智能提取', 'views.manage': '维护机构观点', 'research.view': '查看外部研究',
  'workflow.config': '配置业务流程', 'org.manage': '管理组织与人员', 'settings.manage': '系统设置', 'ai.policy': '配置 AI 策略与模型',
  'audit.read': '查看审计日志', 'history.rollback': '回滚历史版本', 'export.all': '导出全量数据', 'kb.mount': '管理挂载目录', 'integration.manage': '管理外部集成',
}

export const OPS = {
  'op.start.authorize': '项目启动授权', 'op.pm.confirm': '经理确认', 'op.material.finalize': '材料定稿',
  'op.meeting.decide': '会议决策（表决）', 'op.invest.approve': '投资审批', 'op.trade.confirm': '交割确认', 'op.exit.approve': '退出审批', 'op.archive.confirm': '归档确认',
}

export const FIELD_CATEGORIES = { amount: '投资金额', valuation: '内部估值', terms: '交易条款', fund_lp: '基金与 LP 信息', trade_secret: '商业秘密' }
export const LEVELS = ['公开', '内部', '机密', '绝密']
export const AI_LEVELS = ['关闭', '辅助建议', '起草待确认', '授权执行']

const ALL_FN = Object.keys(FUNCTIONS)
const READ = ['project.view', 'material.view', 'company.view', 'research.view']
const WORK = [...READ, 'project.create', 'project.edit', 'project.submit', 'material.upload', 'deliverable.edit', 'deliverable.review', 'meeting.manage', 'company.edit', 'extract.run', 'fill.manage']

// 岗位默认配置；管理员可在「系统设置 → 角色权限」修改（存于 roles 集合）
export const DEFAULT_ROLES = [
  { id: 'sysadmin', name: '系统管理员', functions: ['project.view', 'org.manage', 'workflow.config', 'settings.manage', 'ai.policy', 'audit.read', 'history.rollback', 'kb.mount', 'integration.manage', 'research.view', 'company.view'], ops: [], scope: 'all', clearance: 1, categories: [], ai: 1 },
  { id: 'partner', name: '企业管理层 / 合伙人', functions: [...READ, 'project.delete', 'project.export', 'project.archive', 'project.pause', 'export.all', 'audit.read', 'views.manage', 'meeting.manage', 'history.rollback'], ops: ['op.meeting.decide', 'op.invest.approve', 'op.exit.approve', 'op.archive.confirm'], scope: 'all', clearance: 3, categories: Object.keys(FIELD_CATEGORIES), ai: 2 },
  { id: 'head', name: '投资负责人 / 部门负责人', functions: [...WORK, 'project.pause', 'project.archive', 'project.export', 'project.member', 'company.confirm', 'views.manage', 'audit.read'], ops: ['op.start.authorize', 'op.pm.confirm', 'op.material.finalize', 'op.meeting.decide', 'op.archive.confirm'], scope: 'dept', clearance: 3, categories: ['amount', 'valuation', 'terms', 'trade_secret'], ai: 3 },
  { id: 'pm', name: '项目经理 / 投资经理', functions: [...WORK, 'project.pause', 'project.member', 'company.confirm', 'project.export'], ops: ['op.pm.confirm', 'op.material.finalize'], scope: 'own', clearance: 2, categories: ['amount', 'valuation', 'terms'], ai: 3 },
  { id: 'analyst', name: '投资分析师 / 研究人员', functions: [...WORK], ops: [], scope: 'assigned', clearance: 1, categories: [], ai: 2 },
  { id: 'finance', name: '财务 / 估值人员', functions: [...READ, 'material.upload', 'deliverable.edit', 'deliverable.review', 'extract.run', 'company.edit'], ops: ['op.trade.confirm'], scope: 'assigned', clearance: 2, categories: ['amount', 'valuation'], ai: 2 },
  { id: 'legal', name: '法务人员', functions: [...READ, 'material.upload', 'deliverable.edit', 'deliverable.review'], ops: ['op.trade.confirm'], scope: 'assigned', clearance: 3, categories: ['terms', 'trade_secret'], ai: 2 },
  { id: 'risk', name: '风控 / 合规人员', functions: [...READ, 'deliverable.edit', 'deliverable.review', 'audit.read', 'material.export'], ops: ['op.meeting.decide'], scope: 'all', clearance: 3, categories: ['amount', 'valuation', 'terms'], ai: 1 },
  { id: 'fund', name: '基金管理及募资人员', functions: [...READ, 'material.upload', 'deliverable.edit'], ops: [], scope: 'assigned', clearance: 2, categories: ['amount', 'fund_lp'], ai: 2 },
  { id: 'postinv', name: '投后管理人员', functions: [...WORK], ops: ['op.exit.approve'], scope: 'postinv', clearance: 2, categories: ['amount', 'valuation'], ai: 3 },
  { id: 'staff', name: '其他内部协作人员', functions: [...READ], ops: [], scope: 'assigned', clearance: 1, categories: [], ai: 1 },
]

const SCOPE_RANK = { assigned: 1, own: 2, postinv: 2, dept: 3, all: 4 }
export const SCOPES = { own: '本人负责的项目', dept: '本部门项目', assigned: '指定授权项目', postinv: '投后阶段项目', all: '全机构项目' }

export class Forbidden extends Error {
  constructor(message, action) { super(message); this.status = 403; this.action = action }
}

export function createOrg(db) {
  const roleMap = () => new Map(db.all('roles').map(r => [r.id, r]))

  /** 计算用户的有效权限（多岗位取并集，密级取最高，数据范围取最宽）。 */
  function effective(user) {
    if (!user) return null
    const roles = (user.roles ?? []).map(id => roleMap().get(id)).filter(Boolean)
    const scopes = [...new Set(roles.map(r => r.scope))]
    return {
      functions: new Set(roles.flatMap(r => r.functions)),
      ops: new Set(roles.flatMap(r => r.ops)),
      scopes,
      clearance: Math.max(0, ...roles.map(r => r.clearance)),
      categories: new Set(roles.flatMap(r => r.categories)),
      ai: Math.max(0, ...roles.map(r => r.ai)),
      roleNames: roles.map(r => r.name),
    }
  }

  const can = (user, fn) => effective(user)?.functions.has(fn) ?? false
  const canOp = (user, op) => effective(user)?.ops.has(op) ?? false
  function assert(user, fn) {
    if (!can(user, fn)) throw new Forbidden(`权限不足：「${FUNCTIONS[fn] ?? fn}」未授权给你的岗位，请联系管理员`, fn)
  }
  function assertOp(user, op) {
    if (!canOp(user, op)) throw new Forbidden(`权限不足：「${OPS[op] ?? op}」需要有权人员执行`, op)
  }

  const isMember = (user, p) => p.owner === user.id || (p.members ?? []).some(m => m.userId === user.id) || (p.grants ?? []).some(g => g.userId === user.id && (!g.until || g.until > Date.now()))

  /** 第二层：项目数据范围。 */
  function seesProject(user, p) {
    if (!user || !p) return false
    const e = effective(user)
    if (!e.functions.has('project.view')) return false
    if (isMember(user, p)) return true
    for (const s of e.scopes) {
      if (s === 'all') return true
      if (s === 'dept' && p.deptId && p.deptId === user.deptId) return true
      if (s === 'own' && p.owner === user.id) return true
      if (s === 'postinv' && ['post', 'exit', 'archive'].includes(p.stageKind)) return true
    }
    return false
  }
  function assertProject(user, p) {
    if (!p) throw Object.assign(new Error('项目不存在'), { status: 404 })
    if (!seesProject(user, p)) throw new Forbidden('无权访问该项目：不在你的数据范围内', 'scope')
  }

  /** 第四层：字段敏感类别（可配置，未配置的字段视为不敏感）。 */
  const fieldCategory = (entity, field) => db.get('settings', 'main')?.sensitivity?.fields?.[`${entity}.${field}`] ?? null
  const canField = (user, entity, field) => { const c = fieldCategory(entity, field); return !c || effective(user).categories.has(c) }
  const canLevel = (user, level = 1) => effective(user).clearance >= level

  /** 文本脱敏：用户缺少的敏感类别对应的数字替换为［已脱敏］（用于 AI 上下文与预览）。 */
  const PATTERNS = {
    amount: /(投资金额|拟投|出资|融资金额|本轮融资|融资|首付款|交易价格|对价|认缴|实缴|持仓)([^，。；\n]{0,10}?)(\d[\d.,]*\s*(?:亿|万)?(?:美元|元|人民币)?)/g,
    valuation: /(估值|投前|投后|目标价|市值|PE|PS)([^，。；\n]{0,10}?)(\d[\d.,]*\s*(?:亿|万|倍)?(?:美元|元)?)/g,
    terms: /(回购|对赌|业绩承诺|优先清算|反稀释|领售)([^，。；\n]{0,16}?)(\d[\d.,]*\s*(?:%|亿|万|倍|年)?)/g,
    fund_lp: /(LP|有限合伙人|出资人)([^，。；\n]{0,16}?)(\d[\d.,]*\s*(?:%|亿|万)?)/g,
    trade_secret: /(商业秘密|核心工艺|工艺参数|配方|源代码|未公开专利)([：:为是]\s*)([^，。；\n]{1,40})/g,
  }
  function redact(user, text) {
    const e = effective(user)
    let t = String(text ?? '')
    for (const [cat, re] of Object.entries(PATTERNS)) if (!e?.categories.has(cat)) t = t.replace(re, '$1$2［已脱敏］')
    return t
  }
  /** 发往外部模型的文本：所有敏感类别一律脱敏，与用户权限无关。 */
  const redactAll = text => Object.values(PATTERNS).reduce((t, re) => t.replace(re, '$1$2［已脱敏］'), String(text ?? ''))
  const canCategory = (user, cat) => !cat || !!effective(user)?.categories.has(cat)

  /**
   * AI 参与级别（需求 三）：岗位上限 ∧ 业务类型 ∧ 工作环节 ∧ 数据密级 取最小值。
   * 0 关闭 / 1 辅助建议 / 2 起草待确认 / 3 授权执行。AI 永远不能做正式决策。
   */
  function aiLevel(user, { businessType, workType, level } = {}) {
    const policy = db.get('settings', 'main')?.aiPolicy ?? {}
    let lv = effective(user)?.ai ?? 0
    if (businessType && policy.businessTypes?.[businessType] !== undefined) lv = Math.min(lv, policy.businessTypes[businessType])
    if (workType && policy.workTypes?.[workType] !== undefined) lv = Math.min(lv, policy.workTypes[workType])
    if (level !== undefined && policy.levels?.[level] !== undefined) lv = Math.min(lv, policy.levels[level])
    return lv
  }
  function assertAi(user, need, ctx = {}) {
    const lv = aiLevel(user, ctx)
    if (lv < need) throw new Forbidden(`AI 参与级别不足：当前为「${AI_LEVELS[lv]}」，该操作需要「${AI_LEVELS[need]}」（按岗位/业务/环节/密级配置）`, 'ai')
    return lv
  }

  function capabilities(user) {
    const e = effective(user)
    return { functions: [...e.functions], ops: [...e.ops], scopes: e.scopes, clearance: e.clearance, categories: [...e.categories], ai: e.ai, roleNames: e.roleNames }
  }

  return { effective, can, canOp, assert, assertOp, seesProject, assertProject, isMember, canField, canCategory, canLevel, fieldCategory, redact, redactAll, aiLevel, assertAi, capabilities }
}
