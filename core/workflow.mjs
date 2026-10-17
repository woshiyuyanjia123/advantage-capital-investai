// 可配置业务工作流（需求 一）。三个概念严格分开：
//   阶段 stage：项目实际推进到哪里（带状态标签：新项目/拟立项项目/已立项项目/已过会项目/已投资项目…）
//   工作 work：要完成的具体工作（行业研究、尽调、估值…），可在多个阶段反复出现，带成果要求
//   决策 gate：进入下一环节需要谁确认（审批/会议/签署），含通过规则与结果：通过/退回补充/否决放弃/持有
// 项目创建时固定流程版本；后台发布新版本不影响在途项目。
import { uid } from './db.mjs'

// 工作类型目录：成果格式、成果性质（标准件可模板填充 / 研究判断类由 AI 规划结构）
export const WORK_TYPES = {
  项目信息表: { format: 'xlsx', kind: 'extract', schema: 'bp', desc: '从 BP 等资料提取项目信息' },
  初审意见: { format: 'docx', kind: 'research' },
  行业研究: { format: 'docx', kind: 'research' },
  落地价值初审: { format: 'docx', kind: 'research' },
  立项报告: { format: 'pptx', kind: 'research' },
  NDA: { format: 'docx', kind: 'standard', template: 'NDA' },
  框架投资协议: { format: 'docx', kind: 'standard', template: '框架投资协议' },
  财务分析: { format: 'xlsx', kind: 'extract', schema: 'financial' },
  估值模型: { format: 'xlsx', kind: 'table' },
  尽调清单: { format: 'xlsx', kind: 'table' },
  尽调报告: { format: 'docx', kind: 'research' },
  尽调汇总: { format: 'xlsx', kind: 'extract', schema: 'dd' },
  法律尽调: { format: 'docx', kind: 'research' },
  三方尽调报告: { format: 'docx', kind: 'research' },
  行业分析报告: { format: 'docx', kind: 'research' },
  投资建议书: { format: 'docx', kind: 'research' },
  Teaser: { format: 'pptx', kind: 'research' },
  产业价值可研报告: { format: 'docx', kind: 'research' },
  投决会材料: { format: 'pptx', kind: 'research' },
  风控意见: { format: 'docx', kind: 'research' },
  交易结构方案: { format: 'docx', kind: 'research' },
  政府产业条件梳理: { format: 'docx', kind: 'research' },
  交易文件: { format: 'docx', kind: 'standard', template: '交易文件' },
  交割清单: { format: 'xlsx', kind: 'table' },
  投后报告: { format: 'docx', kind: 'research' },
  退出建议书: { format: 'docx', kind: 'research' },
  项目复盘报告: { format: 'docx', kind: 'research' },
  会议纪要: { format: 'docx', kind: 'meeting' },
  项目进度报表: { format: 'xlsx', kind: 'table' },
}

export const BUSINESS_TYPES = [
  { id: 'financial', name: '财务投资', primary: true },
  { id: 'industrial', name: '产业投资及产业项目' },
  { id: 'ma', name: '并购重组' },
  { id: 'listed', name: '上市公司资本运作' },
  { id: 'fund', name: '基金业务' },
  { id: 'attract', name: '资本招商' },
  { id: 'other', name: '其他资本相关业务' },
]

const W = (work, opt = {}) => ({ work, required: !!opt.required, recommended: !opt.required, role: opt.role ?? 'pm', format: opt.format ?? WORK_TYPES[work]?.format ?? 'docx' })
const G = (name, opt) => ({ id: uid('g_'), name, kind: opt.kind ?? 'approval', op: opt.op, roles: opt.roles, rule: opt.rule ?? 'any', requires: opt.requires ?? [], outcomes: opt.outcomes })

/** 财务投资：完整生命周期（需求 九 的验收链路） */
function financial() {
  return {
    businessType: 'financial', name: '财务投资标准流程', version: 1, status: 'published',
    stages: [
      { id: 's_opp', name: '项目机会', kind: 'pre', label: '新项目', works: [W('项目信息表', { required: true }), W('初审意见'), W('NDA')],
        gate: G('项目启动审批', { op: 'op.start.authorize', roles: ['head'], rule: 'any', requires: ['项目信息表'], outcomes: { pass: { to: 's_prep', label: '已启动项目' }, return: { to: 's_opp', label: '补充材料' }, reject: { terminate: true, label: '放弃项目' } } }) },
      { id: 's_prep', name: '立项准备', kind: 'pre', label: '拟立项项目', works: [W('行业研究'), W('财务分析'), W('立项报告', { required: true }), W('NDA', { required: true })],
        gate: G('立项会', { kind: 'meeting', op: 'op.meeting.decide', roles: ['partner', 'head'], rule: 'majority', requires: ['立项报告', 'NDA'], outcomes: { pass: { to: 's_dd', label: '已立项项目' }, return: { to: 's_prep', label: '补充后重新上会' }, reject: { terminate: true, label: '放弃项目' } } }) },
      { id: 's_dd', name: '尽职调查', kind: 'diligence', label: '已立项项目', works: [W('尽调清单'), W('行业研究'), W('财务分析', { role: 'finance' }), W('法律尽调', { role: 'legal' }), W('估值模型', { role: 'finance' }), W('尽调报告', { required: true }), W('尽调汇总')],
        gate: G('尽调结论确认', { op: 'op.pm.confirm', roles: ['head'], rule: 'any', requires: ['尽调报告'], outcomes: { pass: { to: 's_ic', label: '尽调完成' }, return: { to: 's_dd', label: '补充尽调' }, reject: { terminate: true, label: '放弃项目' } } }) },
      { id: 's_ic', name: '投资决策', kind: 'decision', label: '待投决项目', works: [W('投资建议书', { required: true }), W('投决会材料'), W('风控意见', { role: 'risk' })],
        gate: G('投资决策委员会', { kind: 'meeting', op: 'op.invest.approve', roles: ['partner'], rule: 'two_thirds', requires: ['投资建议书'], outcomes: { pass: { to: 's_trade', label: '已过会项目' }, return: { to: 's_dd', label: '退回补充尽调' }, reject: { terminate: true, label: '否决' } } }) },
      { id: 's_trade', name: '交易执行', kind: 'execution', label: '已过会项目', works: [W('交易文件', { required: true, role: 'legal' }), W('交割清单', { role: 'finance' })],
        gate: G('交割确认', { kind: 'sign', op: 'op.trade.confirm', roles: ['legal', 'finance'], rule: 'all', requires: ['交易文件'], outcomes: { pass: { to: 's_post', label: '已投资项目' }, return: { to: 's_trade', label: '补充交割条件' } } }) },
      { id: 's_post', name: '投后管理', kind: 'post', label: '已投资项目', works: [W('投后报告', { role: 'postinv' }), W('会议纪要'), W('退出建议书', { required: true, role: 'postinv' })],
        gate: G('退出决策', { kind: 'meeting', op: 'op.exit.approve', roles: ['partner'], rule: 'majority', requires: ['退出建议书'], outcomes: { pass: { to: 's_exit', label: '退出中' }, hold: { to: 's_post', label: '继续持有' }, return: { to: 's_post', label: '补充退出方案' } } }) },
      { id: 's_exit', name: '退出', kind: 'exit', label: '退出中', works: [W('交易文件', { role: 'legal' }), W('交割清单', { role: 'finance' })],
        gate: G('退出完成确认', { kind: 'sign', op: 'op.trade.confirm', roles: ['finance'], rule: 'any', outcomes: { pass: { to: 's_archive', label: '已退出' } } }) },
      { id: 's_archive', name: '复盘归档', kind: 'archive', label: '已退出', works: [W('项目复盘报告', { required: true })],
        gate: G('归档确认', { op: 'op.archive.confirm', roles: ['head', 'partner'], rule: 'any', requires: ['项目复盘报告'], outcomes: { pass: { complete: true, label: '已归档' } } }) },
    ],
  }
}

/** 产业投资：按《产业投资中心产业项目投资流程图》 */
function industrial() {
  return {
    businessType: 'industrial', name: '产业项目投资流程', version: 1, status: 'published', source: '产业投资流程.pdf',
    stages: [
      { id: 'i_intake', name: '立项及承接', kind: 'pre', label: '新项目', dept: '产业投资部门', works: [W('项目信息表', { required: true }), W('初审意见'), W('落地价值初审'), W('立项报告', { required: true })],
        gate: G('立项会', { kind: 'meeting', op: 'op.meeting.decide', roles: ['partner', 'head'], rule: 'majority', requires: ['立项报告'], outcomes: { pass: { to: 'i_dd', label: '已立项项目' }, return: { to: 'i_intake', label: '补充' }, reject: { terminate: true, label: '放弃项目' } } }) },
      { id: 'i_dd', name: '尽调及承做', kind: 'diligence', label: '已立项项目', dept: '项目组', works: [W('框架投资协议', { required: true, role: 'legal' }), W('尽调报告', { required: true }), W('行业分析报告', { required: true }), W('投资建议书', { required: true }), W('Teaser'), W('产业价值可研报告', { required: true })],
        gate: G('预投委会（可合并产投承销会）', { kind: 'meeting', op: 'op.meeting.decide', roles: ['partner', 'head', 'risk'], rule: 'majority', requires: ['尽调报告', '行业分析报告', '投资建议书', '产业价值可研报告'], outcomes: { pass: { to: 'i_land', label: '预投委通过' }, return: { to: 'i_dd', label: '补充尽调' }, reject: { terminate: true, label: '放弃项目' } } }) },
      { id: 'i_land', name: '落地及承销（募投）', kind: 'decision', label: '预投委通过', dept: '项目组/风控部', works: [W('政府产业条件梳理'), W('交易结构方案', { required: true }), W('三方尽调报告', { required: true, role: 'finance' }), W('风控意见', { role: 'risk' })],
        gate: G('投委会', { kind: 'meeting', op: 'op.invest.approve', roles: ['partner'], rule: 'two_thirds', requires: ['交易结构方案', '三方尽调报告'], outcomes: { pass: { to: 'i_exec', label: '已过会项目' }, return: { to: 'i_land', label: '补充' }, reject: { terminate: true, label: '放弃项目' } } }) },
      { id: 'i_exec', name: '项目落地与股权投资', kind: 'execution', label: '已过会项目', dept: '项目组', works: [W('交易文件', { required: true, role: 'legal' }), W('交割清单', { role: 'finance' })],
        gate: G('落地 / 确权确认', { kind: 'sign', op: 'op.trade.confirm', roles: ['legal', 'finance'], rule: 'all', requires: ['交易文件'], outcomes: { pass: { to: 'i_post', label: '已投资项目' } } }) },
      { id: 'i_post', name: '管理与退出', kind: 'post', label: '已投资项目', dept: '项目管理部', works: [W('投后报告', { role: 'postinv' }), W('退出建议书', { required: true })],
        gate: G('退出投委会', { kind: 'meeting', op: 'op.exit.approve', roles: ['partner'], rule: 'majority', requires: ['退出建议书'], outcomes: { pass: { to: 'i_exit', label: '项目退出' }, hold: { to: 'i_post', label: '持有' }, return: { to: 'i_post', label: '补充' } } }) },
      { id: 'i_exit', name: '项目退出与归档', kind: 'archive', label: '项目退出', works: [W('项目复盘报告', { required: true })],
        gate: G('归档确认', { op: 'op.archive.confirm', roles: ['head', 'partner'], rule: 'any', outcomes: { pass: { complete: true, label: '已归档' } } }) },
    ],
  }
}

/** 其他业务类型：通用草稿流程（共享同一套系统能力，待业务确认后在后台调整并发布） */
function generic(businessType, name) {
  return {
    businessType, name: `${name}通用流程`, version: 1, status: 'published', note: '通用模板，待业务负责人确认后调整',
    stages: [
      { id: `${businessType}_1`, name: '项目承接', kind: 'pre', label: '新项目', works: [W('项目信息表', { required: true }), W('初审意见')],
        gate: G('启动审批', { op: 'op.start.authorize', roles: ['head'], rule: 'any', requires: ['项目信息表'], outcomes: { pass: { to: `${businessType}_2`, label: '已启动' }, reject: { terminate: true, label: '放弃' } } }) },
      { id: `${businessType}_2`, name: '方案与尽调', kind: 'diligence', label: '已启动', works: [W('尽调报告', { required: true }), W('交易结构方案'), W('估值模型', { role: 'finance' })],
        gate: G('决策会', { kind: 'meeting', op: 'op.invest.approve', roles: ['partner'], rule: 'majority', requires: ['尽调报告'], outcomes: { pass: { to: `${businessType}_3`, label: '已决策' }, return: { to: `${businessType}_2`, label: '补充' }, reject: { terminate: true, label: '否决' } } }) },
      { id: `${businessType}_3`, name: '执行与管理', kind: 'post', label: '已决策', works: [W('交易文件', { required: true, role: 'legal' }), W('项目复盘报告')],
        gate: G('完成确认', { op: 'op.archive.confirm', roles: ['head'], rule: 'any', outcomes: { pass: { complete: true, label: '已完成' } } }) },
    ],
  }
}

export function defaultWorkflows() {
  return [financial(), industrial(), ...BUSINESS_TYPES.filter(b => !['financial', 'industrial'].includes(b.id)).map(b => generic(b.id, b.name))]
    .map(w => ({ ...w, id: `${w.businessType}@v${w.version}` }))
}

const fail = (m, status = 400) => Object.assign(new Error(m), { status })

/** 校验流程定义（后台保存前）：阶段 id 唯一、结果指向存在的阶段、规则合法。 */
export function validateDef(def) {
  const ids = new Set()
  if (!def.stages?.length) throw fail('流程至少需要一个阶段')
  for (const s of def.stages) {
    if (!s.id || ids.has(s.id)) throw fail(`阶段 id 重复或为空：${s.id}`)
    ids.add(s.id)
    if (!s.name) throw fail('阶段名称必填')
    for (const w of s.works ?? []) if (!WORK_TYPES[w.work]) throw fail(`未知工作类型：${w.work}`)
  }
  for (const s of def.stages) {
    if (!s.gate) continue
    if (!['any', 'all', 'majority', 'two_thirds'].includes(s.gate.rule)) throw fail(`通过规则无效：${s.gate.rule}`)
    if (!s.gate.roles?.length) throw fail(`「${s.gate.name}」需要指定审批岗位`)
    for (const [k, o] of Object.entries(s.gate.outcomes ?? {})) if (o.to && !ids.has(o.to)) throw fail(`「${s.gate.name}」的「${k}」指向不存在的阶段 ${o.to}`)
  }
  return def
}

/** 流程引擎：所有项目状态变化都经过这里，写入历史，并自己发出事件（approval.requested / approval.decided）。 */
export function createEngine({ db, org, events }) {
  const def = p => db.get('workflows', p.workflowId) ?? (() => { throw fail('项目绑定的流程版本不存在', 500) })()
  const stageOf = p => def(p).stages.find(s => s.id === p.stageId)
  const meta = (user, reason, action) => ({ actor: user, reason, action })
  const emit = (type, payload) => events?.emit(type, payload)

  /**
   * 进入阶段：实例化该阶段的工作。未完成的同类工作移到本阶段继续；已完成的同类工作——
   * 必做的视为已满足（不重复要求），非必做的在本阶段新建一份（如退出阶段的交易文件，是新的成果）。
   * 不修改传入的文档（返回新对象），保证历史快照记录的是修改前的状态。
   */
  function enterStage(p0, stageId, user, reason) {
    const p = structuredClone(p0)
    const st = def(p).stages.find(s => s.id === stageId)
    if (!st) throw fail(`阶段不存在：${stageId}`)
    const works = p.works ?? []
    for (const spec of st.works ?? []) {
      const same = works.filter(w => w.type === spec.work)
      if (same.some(w => w.stageId === stageId)) continue
      const open = same.find(w => w.status !== 'done')
      if (open) { open.stageId = stageId; open.required = spec.required || open.required; continue }
      if (same.length && spec.required) continue
      works.push({ id: uid('w_'), type: spec.work, stageId, required: spec.required, format: spec.format, assignee: assigneeFor(p, spec.role), status: 'todo', createdAt: Date.now() })
    }
    const timeline = [...(p.timeline ?? []), { at: Date.now(), by: user?.name ?? '系统', event: `进入「${st.name}」`, note: reason ?? '' }]
    return { ...p, stageId, stageKind: st.kind, statusLabel: st.label, works, timeline }
  }

  function assigneeFor(p, role) {
    const m = (p.members ?? []).find(x => x.role === role)
    return m?.userId ?? p.owner
  }

  /** 阶段准入检查：必做工作的成果已定稿，且没有被退回要求补充。 */
  function readiness(p) {
    const st = stageOf(p)
    const items = (st.works ?? []).filter(w => w.required).map(spec => {
      const w = (p.works ?? []).find(x => x.type === spec.work && x.stageId === st.id) ?? (p.works ?? []).find(x => x.type === spec.work && x.status === 'done')
      const d = w?.deliverableId ? db.get('deliverables', w.deliverableId) : null
      if (w?.status === 'rework') return { work: spec.work, ok: false, status: '需补充：撤回定稿后修改并重新定稿', workId: w.id }
      return { work: spec.work, ok: !!d && d.status === 'final', status: d ? { draft: '草稿', review: '待审核', final: '已定稿' }[d.status] : '未开始', workId: w?.id }
    })
    const gateReq = (st.gate?.requires ?? []).filter(r => !items.some(i => i.work === r)).map(r => {
      const d = db.find('deliverables', x => x.projectId === p.id && x.type === r && x.status === 'final')[0]
      return { work: r, ok: !!d, status: d ? '已定稿' : '未定稿' }
    })
    const all = [...items, ...gateReq]
    return { stage: st, items: all, ok: all.every(i => i.ok) }
  }

  function create(user, input) {
    org.assert(user, 'project.create')
    const wf = db.find('workflows', w => w.businessType === input.businessType && w.status === 'published').sort((a, b) => b.version - a.version)[0]
    if (!wf) throw fail(`业务类型「${input.businessType}」没有已发布的流程，请先在「系统配置 → 流程配置」中发布`)
    let p = {
      id: uid('p_'), name: String(input.name ?? '').trim().slice(0, 80), companyId: input.companyId ?? null, businessType: wf.businessType, workflowId: wf.id,
      owner: input.owner ?? user.id, deptId: input.deptId ?? user.deptId, members: input.members ?? [{ userId: user.id, role: 'pm' }], grants: [],
      status: 'active', fields: input.fields ?? {}, tags: input.tags ?? [], desc: input.desc ?? '', progress: 0, works: [], timeline: [],
    }
    if (!p.name) throw fail('项目名称必填')
    p = enterStage(p, wf.stages[0].id, user, '创建项目')
    return db.put('projects', p, meta(user, '创建项目', 'create'))
  }

  function progressOf(p) {
    const stages = def(p).stages
    const i = stages.findIndex(s => s.id === p.stageId)
    const st = stages[i]
    const done = (p.works ?? []).filter(w => w.stageId === st.id && w.status === 'done').length
    const total = Math.max(1, (st.works ?? []).length)
    return p.status === 'completed' ? 100 : Math.round(((i + Math.min(1, done / total) * 0.9) / stages.length) * 100)
  }

  function save(user, p, reason, action) {
    return db.put('projects', { ...p, progress: progressOf(p) }, meta(user, reason, action))
  }

  /** 决策节点的表决人：具备岗位与业务操作权限。「指定授权」类岗位（法务、财务等）看不到项目时，按流程自动授予可见。 */
  function votersFor(p, gate) {
    const eligible = db.find('users', u => !u.disabled && (u.roles ?? []).some(x => gate.roles.includes(x)) && org.canOp(u, gate.op))
    const assignedOnly = u => { const sc = org.effective(u).scopes; return sc.length > 0 && sc.every(x => x === 'assigned') }
    const grant = eligible.filter(u => !org.seesProject(u, p) && assignedOnly(u))
    return { voters: eligible.filter(u => org.seesProject(u, p) || grant.includes(u)), grant }
  }

  /** 发起决策（审批 / 上会 / 签署）。准入不满足时拒绝并列出缺项。 */
  function requestGate(user, p0) {
    org.assert(user, 'project.submit')
    if (p0.status !== 'active') throw fail(`项目当前为「${statusName(p0.status)}」，不能发起决策`)
    const st = stageOf(p0)
    if (!st.gate) throw fail('当前阶段没有配置决策节点')
    if (db.one('approvals', a => a.projectId === p0.id && a.status === 'pending')) throw fail('已有进行中的决策')
    const r = readiness(p0)
    if (!r.ok) throw fail(`准入条件未满足：${r.items.filter(i => !i.ok).map(i => `${i.work}（${i.status}）`).join('、')}`)
    const { voters, grant } = votersFor(p0, st.gate)
    if (!voters.length) throw fail(`没有符合条件的表决人：需要岗位 ${st.gate.roles.join('/')} 且具备该业务操作权限，请检查岗位配置`)
    return db.tx(() => {
      const p = structuredClone(p0)
      if (grant.length) p.grants = [...(p.grants ?? []), ...grant.map(u => ({ userId: u.id, until: null, by: `流程：「${st.gate.name}」表决人` }))]
      const a = db.put('approvals', { projectId: p.id, stageId: st.id, gate: st.gate, status: 'pending', voters: voters.map(v => v.id), votes: [], recused: [], requestedBy: user.id, requestedAt: Date.now(), materials: r.items.map(i => i.work) }, meta(user, `发起「${st.gate.name}」`, 'request'))
      save(user, { ...p, timeline: [...p.timeline, { at: Date.now(), by: user.name, event: `发起「${st.gate.name}」`, note: grant.length ? `已为 ${grant.map(u => u.name).join('、')} 开放项目可见（表决需要）` : '' }] }, `发起「${st.gate.name}」`, 'gate')
      emit('approval.requested', { approval: a, user })
      return a
    })
  }

  const THRESH = { any: () => 1, all: n => n, majority: n => Math.floor(n / 2) + 1, two_thirds: n => Math.ceil((n * 2) / 3) }

  /** 表决：有权人员逐一给出意见；回避不计入；达到规则阈值即生效。AI 不能调用。 */
  function vote(user, approvalId, decision, opinion = '', { recuse = false } = {}) {
    const a = db.get('approvals', approvalId)
    if (!a || a.status !== 'pending') throw fail('决策不存在或已结束', 409)
    if (!a.voters.includes(user.id)) throw fail('你不在本次决策的表决人名单中', 403)
    org.assertOp(user, a.gate.op)
    const p = db.get('projects', a.projectId)
    if (p?.status !== 'active') throw fail(`项目当前为「${statusName(p?.status)}」，不能表决`, 409)
    if (a.votes.some(v => v.userId === user.id) || a.recused.includes(user.id)) throw fail('你已表决或已回避', 409)
    let next = { ...a }
    if (recuse) next.recused = [...a.recused, user.id]
    else {
      if (!a.gate.outcomes[decision]) throw fail(`本节点不支持「${decision}」`)
      if (!String(opinion).trim() && decision !== 'pass') throw fail('退回、否决或继续持有需要填写意见')
      next.votes = [...a.votes, { userId: user.id, name: user.name, decision, opinion: String(opinion).slice(0, 2000), at: Date.now() }]
    }
    const n = next.voters.length - next.recused.length
    return db.tx(() => {
      if (n === 0) {
        // 全体回避：本次决策无法形成结果，取消并请负责人调整表决人后重新发起
        const cancelled = db.put('approvals', { ...next, status: 'cancelled', result: null, cancelReason: '全体表决人回避', decidedAt: Date.now(), need: 0, eligible: 0 }, meta(user, '全体回避，决策取消', 'cancel'))
        save(user, { ...p, timeline: [...p.timeline, { at: Date.now(), by: '决策', event: `「${a.gate.name}」取消`, note: '全体表决人回避，请调整表决人后重新发起' }] }, '决策取消', 'cancel')
        return cancelled
      }
      const need = THRESH[a.gate.rule](n)
      const counts = Object.fromEntries(Object.keys(a.gate.outcomes).map(k => [k, next.votes.filter(v => v.decision === k).length]))
      let result = Object.entries(counts).find(([, c]) => c >= need)?.[0]
      if (!result && a.gate.rule === 'all' && next.votes.some(v => v.decision !== 'pass')) result = next.votes.find(v => v.decision !== 'pass').decision
      if (!result && next.votes.length >= n) result = ['return', 'reject', 'hold'].find(k => a.gate.outcomes[k]) ?? null
      const decided = db.put('approvals', { ...next, status: result ? 'decided' : 'pending', result: result ?? null, decidedAt: result ? Date.now() : null, need, eligible: n }, meta(user, recuse ? '回避' : `表决：${decision}`, 'vote'))
      if (result) { applyOutcome(user, decided); emit('approval.decided', { approval: decided, user }) }
      return decided
    })
  }

  function applyOutcome(user, a) {
    const p = db.get('projects', a.projectId)
    const o = a.gate.outcomes[a.result]
    const note = `「${a.gate.name}」结果：${{ pass: '通过', return: '退回补充', reject: '否决', hold: '继续持有' }[a.result]}（${o.label}）`
    if (o.terminate) return save(user, { ...p, status: 'terminated', statusLabel: o.label, timeline: [...p.timeline, { at: Date.now(), by: '决策', event: note }] }, note, 'terminate')
    if (o.complete) return save(user, { ...p, status: 'completed', statusLabel: o.label, timeline: [...p.timeline, { at: Date.now(), by: '决策', event: note }] }, note, 'complete')
    let next = enterStage({ ...p, timeline: [...p.timeline, { at: Date.now(), by: '决策', event: note }] }, o.to, user, note)
    if (a.result === 'return') next.works = next.works.map(w => w.stageId === o.to && w.required && w.status === 'done' ? { ...w, status: 'rework' } : w)
    next.statusLabel = o.label
    return save(user, next, note, a.result)
  }

  /** 取消进行中的决策（项目终止、退回、暂停后重新安排时）。 */
  function cancelPending(user, p, reason) {
    for (const a of db.find('approvals', x => x.projectId === p.id && x.status === 'pending')) db.put('approvals', { ...a, status: 'cancelled', cancelReason: reason, decidedAt: Date.now() }, meta(user, `决策取消：${reason}`, 'cancel'))
  }

  /** 无决策节点或特殊情况的流转：暂停 / 恢复 / 终止 / 重新推进。 */
  function control(user, p, action, reason) {
    org.assert(user, 'project.pause')
    if (!String(reason ?? '').trim()) throw fail('请填写原因')
    const map = {
      pause: () => { if (p.status !== 'active') throw fail('只有进行中的项目可以暂停'); return { status: 'paused' } },
      resume: () => { if (p.status !== 'paused') throw fail('只有暂停的项目可以恢复'); return { status: 'active' } },
      terminate: () => { if (!['active', 'paused'].includes(p.status)) throw fail('项目已结束'); return { status: 'terminated', statusLabel: '放弃项目' } },
      restart: () => { if (p.status !== 'terminated') throw fail('只有已放弃的项目可以重新推进'); return { status: 'active', statusLabel: stageOf(p).label } },
    }
    if (!map[action]) throw fail('无效操作')
    const change = map[action]()
    return db.tx(() => {
      if (action === 'terminate') cancelPending(user, p, `项目终止：${reason}`)
      return save(user, { ...p, ...change, timeline: [...p.timeline, { at: Date.now(), by: user.name, event: { pause: '暂停', resume: '恢复', terminate: '终止（放弃）', restart: '重新推进' }[action], note: reason }] }, reason, action)
    })
  }

  /** 退回到之前阶段补充材料（不经决策的人工退回，需负责人权限）。 */
  function sendBack(user, p, toStageId, reason) {
    org.assertOp(user, 'op.pm.confirm')
    const stages = def(p).stages
    const to = stages.findIndex(s => s.id === toStageId)
    if (to < 0) throw fail('目标阶段不存在')
    if (to > stages.findIndex(s => s.id === p.stageId)) throw fail('只能退回到当前或之前的阶段')
    if (!String(reason ?? '').trim()) throw fail('请填写退回原因')
    if (p.status !== 'active') throw fail(`项目当前为「${statusName(p.status)}」，不能退回`)
    return db.tx(() => { cancelPending(user, p, `退回补充：${reason}`); return save(user, enterStage(p, toStageId, user, `退回补充：${reason}`), `退回补充：${reason}`, 'return') })
  }

  const statusName = s => ({ active: '进行中', paused: '已暂停', terminated: '已放弃', completed: '已完成' }[s] ?? s)

  return { def, stageOf, enterStage, readiness, votersFor, create, requestGate, vote, control, sendBack, save, progressOf, statusName }
}
