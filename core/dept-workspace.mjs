// 分部门工作台与权限视角引擎：
//   1. 不同部门自动进入本部门专属操作台（独立导航、业务交互模块、部门专属 AI 技能、本部门工作队列）
//   2. 仅企业管理层 / 合伙人（d_mgmt / partner）享有全机构全局驾驶舱与全量内容查看权限（非领导请求 403）
//   3. 各部门均可查看全院脱敏项目进度看板（仅阶段与进度百分比，严格隔离底稿/金额/估值/条款/LP/商业秘密）
import { Forbidden, LEVELS } from './org.mjs'
import { BUSINESS_TYPES } from './workflow.mjs'
import { computeFlowMetrics } from './nb-flow.mjs'

const BT_NAME = Object.fromEntries(BUSINESS_TYPES.map(b => [b.id, b.name]))

/** 唯一全内容权限判定：仅管理层 / 合伙人 */
export function isExecutiveUser(user) {
  if (!user) return false
  return (user.roles ?? []).includes('partner') || user.deptId === 'd_mgmt'
}

/** 根据部门 ID、岗位及部门名称（兼容批量导入的新建部门）映射专属工作空间类型 */
export function resolveDeptKey(user, db) {
  if (!user) return 'financial'
  if (isExecutiveUser(user)) return 'executive'
  const roles = user.roles ?? []
  if (user.deptId === 'd_it' || (roles.includes('sysadmin') && !roles.includes('partner'))) return 'it'
  const byDeptId = {
    d_fin: 'financial', d_ind: 'industrial', d_finance: 'finance',
    d_legal: 'legal', d_risk: 'risk', d_post: 'postinv', d_fund: 'fund',
  }
  if (byDeptId[user.deptId]) return byDeptId[user.deptId]
  const deptName = db?.get('depts', user.deptId)?.name ?? ''
  if (/产业|招商/.test(deptName)) return 'industrial'
  if (/财务部|估值|核算/.test(deptName) || roles.includes('finance')) return 'finance'
  if (/法务|律|合规法律/.test(deptName) || roles.includes('legal')) return 'legal'
  if (/风控|合规/.test(deptName) || roles.includes('risk')) return 'risk'
  if (/投后|项目管理|退出/.test(deptName) || roles.includes('postinv')) return 'postinv'
  if (/基金|募资|承销|市场/.test(deptName) || roles.includes('fund')) return 'fund'
  return 'financial'
}

const INDUSTRIAL_PHASES = [
  {
    no: '01', id: 'i_intake', name: '立项及承接', dept: '产业投资部 · 立项委员会 · 产投市场部',
    steps: ['项目收集及录入项目库', '项目初审（跟进项目）', '落地价值初审（拟立项）', '编写立项材料', '立项会（已立项）', '设立项目组及签订框架投资协议'],
    stageIds: ['i_intake'],
  },
  {
    no: '02', id: 'i_dd', name: '尽调及承做', dept: '项目组 · 预投委会 · 产投市场部',
    steps: ['尽职调查及报告', '行业分析报告', '股权投资建议书 / Teaser 编写', '产业价值及落地可研报告', '预投委会（可合并召开）', '产投承销会'],
    stageIds: ['i_dd'],
  },
  {
    no: '03', id: 'i_land', name: '落地及承销（募投）', dept: '项目组 · 风控部 · 基金运营中心 · 会所/律所 · 投委会',
    steps: ['落地政府产业条件梳理 → 对接地方政府', '交易结构及风控机制 → 对接上市公司及社会投资人', '财务 / 法务三方尽调报告', '投委会（已过会项目）', '项目落地流程 & 股权投资流程', '落地 / 确权（已投资项目）'],
    stageIds: ['i_land', 'i_exec'],
  },
  {
    no: '04', id: 'i_post', name: '管理与退出', dept: '项目管理部 · 项目组 · 法务/风控部 · 投委会',
    steps: ['项目归档', '投后管理', '退出建议书', '投委会（持有 / 项目退出）', '项目退出与复盘归档'],
    stageIds: ['i_post', 'i_exit'],
  },
]

const PROFILE_META = {
  executive: {
    key: 'executive', workspaceTitle: '管理层全局驾驶舱', badge: '领导全局视角',
    tagline: '全机构唯一全内容权限 · 投委会决策中枢 · 跨部门巡检与敏感要素透视',
    accentVar: 'var(--ink)', tone: 'ink',
    businessLayer: '全机构项目组合 · 投决会与立项会表决 · 资金/估值/对赌条款透视 · 9 部门运行巡检',
    aiLayer: '投委会反方追问 · 跨部门风险全景 · 投资组合资金敞口汇总 · 决策要点速览',
    nav: [
      { view: 'workbench', icon: 'chart', label: '管理层全局驾驶舱', badgeKey: 'pendingApprovals' },
      { view: 'flowboard', icon: 'flow', label: '投决审批与门禁', badgeKey: 'myVotes' },
      { view: 'notebook', icon: 'spark', label: '全院底稿研判台' },
      { view: 'companies', icon: 'building', label: '全机构公司库' },
      { view: 'research', icon: 'industry', label: '宏观与行业研究' },
      { view: 'knowledge', icon: 'kb', label: '全密级底稿档案', badgeKey: 'kbFiles' },
      { view: 'settings', icon: 'set', label: '治理审计与权限', sub: 'audit' },
    ],
    focusWorkTypes: ['投资建议书', '投决会材料', '立项报告', '风控意见', '退出建议书'],
    focusRoles: ['partner'], preferredStudio: ['ic_memo', 'ppt', 'word'],
    quickQuestions: [
      ['投委会反方十问', '站在投委会投票委员立场，基于全部已勾选底稿给出最尖锐的 5 个风险追问、敏感条款漏洞与一票否决项。'],
      ['估值与对赌条款透视', '梳理本项目的投资金额、投前/投后估值、对赌与回购条款及优先清算安排，全部标注原文出处。'],
      ['阶段准入与决策建议', '对照当前决策门禁准入要求，评估本项目是否具备过会条件，列出通过/退回/附条件通过的关键依据。'],
      ['核心财务硬证据复核', '核对审计报告、合同与 BP 之间的核心财务与客户数据一致性，列出所有口径冲突项。'],
    ],
  },
  financial: {
    key: 'financial', workspaceTitle: '财务投资部操作台', badge: '财务投资部',
    tagline: '股权投研与全周期项目执行 · BP 速采立项 · 行业与财务尽调 · 投决推进',
    accentVar: 'var(--accent)', tone: 'accent',
    businessLayer: '项目机会录入 · 立项准备与立项会 · 尽调执行 · 投资建议书与上会报送',
    aiLayer: 'BP 自动识别建档 · 审计与 BP 口径冲突核查 · 立项/尽调/投决成套编制 · 访谈纪要提炼',
    nav: [
      { view: 'workbench', icon: 'grid', label: '财务投资操作台', badgeKey: 'activeProjects' },
      { view: 'notebook', icon: 'spark', label: '尽调与研判工作台' },
      { view: 'flowboard', icon: 'flow', label: '阶段门禁与报送' },
      { view: 'extract', icon: 'extract', label: 'BP与财报提取' },
      { view: 'companies', icon: 'building', label: '拟投公司库' },
      { view: 'research', icon: 'industry', label: '行业研究与智堡' },
      { view: 'meetings', icon: 'mic', label: '访谈与会议纪要' },
      { view: 'knowledge', icon: 'kb', label: '部门底稿库' },
    ],
    focusWorkTypes: ['项目信息表', '初审意见', '行业研究', '立项报告', '尽调清单', '尽调报告', '投资建议书', '投决会材料'],
    focusRoles: ['head', 'pm', 'analyst', 'staff'], preferredStudio: ['ppt', 'ic_memo', 'word'],
    quickQuestions: [
      ['审计与 BP 口径排查', '逐条对比已勾选底稿中的审计/财务数据、客户合同与 BP 自述，列出所有数据冲突或无法验证之处，并标注出处。'],
      ['投资逻辑与护城河', '提炼本项目的核心商业模式、技术壁垒、上下游议价能力与业绩增长驱动因素，全部附底稿引用。'],
      ['立项 / 上会准入检查', '对照当前阶段准入条件，列出已具备的证据链与仍缺核验的必做工作项。'],
      ['模拟投委反方追问', '站在投委会委员角度，提出针对商业模式、客户集中度与估值合理性的 5 个核心追问。'],
    ],
  },
  industrial: {
    key: 'industrial', workspaceTitle: '产业投资部操作台', badge: '产业投资部',
    tagline: '产业投行与资本招商 · 立项及承接 → 尽调及承做 → 落地及承销 → 管理与退出',
    accentVar: 'var(--green)', tone: 'green',
    businessLayer: '落地价值初审 · 产业价值可研与 Teaser · 地方政府产业条件梳理 · 预投委与产投承销会',
    aiLayer: '政府招商政策与产业条件梳理 · 产业价值及落地可研编制 · 承销 Teaser 路演稿 · 产投四阶段进度追踪',
    nav: [
      { view: 'workbench', icon: 'industry', label: '产业投资操作台', badgeKey: 'activeProjects' },
      { view: 'notebook', icon: 'spark', label: '产业尽调与可研台' },
      { view: 'flowboard', icon: 'flow', label: '产投四阶段门禁' },
      { view: 'companies', icon: 'building', label: '产业主体与园区库' },
      { view: 'research', icon: 'globe', label: '产业生态与政策研究' },
      { view: 'meetings', icon: 'mic', label: '政企对接纪要' },
      { view: 'knowledge', icon: 'kb', label: '产投底稿库' },
    ],
    focusWorkTypes: ['落地价值初审', '立项报告', '框架投资协议', '行业分析报告', '产业价值可研报告', 'Teaser', '政府产业条件梳理', '交易结构方案'],
    focusRoles: ['head', 'pm'], preferredStudio: ['ppt', 'word', 'ic_memo'],
    quickQuestions: [
      ['落地价值与产业链协同', '结合本项目底稿，评估其与地方主导产业的链主协同价值、产能落地可行性及预期拉动产值。'],
      ['政府产业条件清单', '梳理项目落地所需的土地/厂房、能耗指标、产业基金配资、税收返还及地方政府履约前提条件。'],
      ['产投承销 Teaser 提炼', '面向地方政府引导基金、上市公司及社会投资人，提炼本项目承销推介的 5 大亮点与退出预期。'],
      ['预投委 / 承销会准备度', '对照产业投资流程节点，检查尽调报告、行业分析、产业价值可研与交易结构方案的齐备情况。'],
    ],
  },
  finance: {
    key: 'finance', workspaceTitle: '财务部 · 财务尽调与估值台', badge: '财务部',
    tagline: '三表勾稽核查 · 估值模型与敏感性测算 · 财务三方尽调 · 交割打款确认',
    accentVar: 'var(--blue)', tone: 'blue',
    businessLayer: '财报与审计底稿提取 · 收入确认与毛利核查 · 估值模型测算 · 交割清单与打款先决会签',
    aiLayer: '三表自动抽取与异常波动预警 · BP vs 审计口径交叉核对 · 估值敏感性表格生成 · 交割先决清单复核',
    nav: [
      { view: 'workbench', icon: 'table', label: '财务估值操作台', badgeKey: 'deptQueue' },
      { view: 'extract', icon: 'extract', label: '财报三表智能提取' },
      { view: 'notebook', icon: 'spark', label: '财务尽调底稿台' },
      { view: 'flowboard', icon: 'flow', label: '交割确认与门禁' },
      { view: 'companies', icon: 'building', label: '企业财务台账' },
      { view: 'knowledge', icon: 'kb', label: '审计与财报库' },
    ],
    focusWorkTypes: ['财务分析', '估值模型', '三方尽调报告', '交割清单', '尽调汇总'],
    focusRoles: ['finance'], preferredStudio: ['table', 'word', 'ic_memo'],
    quickQuestions: [
      ['三表勾稽与收入确认核查', '核查利润表、资产负债表与现金流量表的勾稽关系，重点排查收入确认时点、应收账款账龄与经营现金流背离。'],
      ['毛利率与费用率异动分析', '按年度梳理营收、综合毛利率、研发/销售费用率与扣非净利润变化，找出异常波动科目并引用原文。'],
      ['估值倍数与敏感性区间', '基于底稿财务预测与本轮估值口径，测算动态 PE/PS 估值分位并给出悲观/基准/乐观三档敏感性假设。'],
      ['交割财务先决条件清单', '整理打款交割前需满足的财务审计确认、资金监管账户、税费结清及验资证明要求。'],
    ],
  },
  legal: {
    key: 'legal', workspaceTitle: '法务部 · 法律尽调与协议台', badge: '法务部',
    tagline: 'NDA 与框架协议标准件 · 法律尽调与诉讼核查 · 交易条款红线 · 确权交割会签',
    accentVar: 'var(--violet)', tone: 'violet',
    businessLayer: '协议模板与交易文件起草 · 股权沿革与代持/诉讼核查 · 回购/对赌/优先清算条款审查 · 确权会签',
    aiLayer: '交易条款红线逐条审查 · NDA/框架协议/正式协议起草 · 知识产权与涉诉风险扫描 · 交割确权清单核对',
    nav: [
      { view: 'workbench', icon: 'shield', label: '法务合规操作台', badgeKey: 'deptQueue' },
      { view: 'templates', icon: 'tpl', label: '协议与法务标准件' },
      { view: 'notebook', icon: 'spark', label: '法律尽调与条款台' },
      { view: 'flowboard', icon: 'flow', label: '确权交割会签中心' },
      { view: 'knowledge', icon: 'kb', label: '协议与法务档案' },
    ],
    focusWorkTypes: ['NDA', '框架投资协议', '法律尽调', '交易文件', '三方尽调报告'],
    focusRoles: ['legal'], preferredStudio: ['word', 'ic_memo', 'table'],
    quickQuestions: [
      ['回购、对赌与优先清算审查', '提取底稿中的所有特殊股东权利条款（回购触发条件、年化利率、业绩对赌、反稀释、领售权与优先清算权），指出潜在执行风险。'],
      ['历史沿革、代持与合规排查', '基于底稿排查股权代持还原、实控人竞业限制、重大未决诉讼、环保/行业资质及关联交易合规性。'],
      ['交易文件与先决条件起草要点', '列出本轮增资协议与股东协议中必须约定的交割先决条件、陈述与保证及违约救济条款。'],
      ['框架协议与确权节点检查', '检查 NDA、框架投资协议、工商变更与股东名册确权所需文件的签署完备性。'],
    ],
  },
  risk: {
    key: 'risk', workspaceTitle: '风控合规部 · 独立风险审查台', badge: '风控合规部',
    tagline: '全院项目独立风险评估 · 交易结构风控机制 · 预投委/投委合规意见 · 操作审计',
    accentVar: 'var(--amber)', tone: 'amber',
    businessLayer: '独立风控意见书 · 交易结构与退出保障评估 · 底稿冲突与超期预警 · 合规审计轨迹巡检',
    aiLayer: '跨底稿风险因子扫描 · 交易结构风控机制审查 · 独立风控意见起草 · 准入缺失与数字异常核验',
    nav: [
      { view: 'workbench', icon: 'vote', label: '风控合规操作台', badgeKey: 'riskAlerts' },
      { view: 'flowboard', icon: 'flow', label: '风险门禁与上会表决' },
      { view: 'notebook', icon: 'spark', label: '底稿风控复核台' },
      { view: 'companies', icon: 'building', label: '标的与风险档案' },
      { view: 'settings', icon: 'history', label: '合规审计轨迹', sub: 'audit' },
      { view: 'knowledge', icon: 'kb', label: '风控审查档案' },
    ],
    focusWorkTypes: ['风控意见', '交易结构方案', '三方尽调报告', '尽调报告', '投资建议书'],
    focusRoles: ['risk'], preferredStudio: ['word', 'ic_memo', 'table'],
    quickQuestions: [
      ['核心风险因子与缓释机制', '从行业周期、财务真实性、客户集中度、法律合规与退出路径五个维度，列出本项目最高风险点及对应风控缓释条款。'],
      ['交易结构风控漏洞审查', '评估当前交易结构、资金监管、担保措施及退出保障条款是否存在可执行性漏洞。'],
      ['底稿硬证据与自述冲突扫描', '核查所有 A 级硬证据与 C 级公司自述之间的矛盾点、未证实假设及缺失关键凭证。'],
      ['风控意见书结论框架', '基于当前底稿起草独立风控意见书要点，明确「建议通过 / 附条件通过 / 暂缓」及前置风控条件。'],
    ],
  },
  postinv: {
    key: 'postinv', workspaceTitle: '投后管理部 · 赋能与退出台', badge: '投后管理部',
    tagline: '项目归档台账 · 季度经营跟踪与赋能 · 回购与退出预警 · 退出投委会推进',
    accentVar: 'var(--cyan)', tone: 'cyan',
    businessLayer: '已投项目归档 · 季度经营预算达成率跟踪 · 投后赋能会议 · 退出建议书与退出审批',
    aiLayer: '季度投后报告起草 · 经营偏差与对赌回购预警 · IPO/并购退出路径推演 · 项目复盘归档整理',
    nav: [
      { view: 'workbench', icon: 'chart', label: '投后与退出操作台', badgeKey: 'activeProjects' },
      { view: 'notebook', icon: 'spark', label: '投后跟踪与退出研判' },
      { view: 'flowboard', icon: 'flow', label: '投后归档与退出门禁' },
      { view: 'meetings', icon: 'mic', label: '投后经营复盘会' },
      { view: 'companies', icon: 'building', label: '已投企业台账' },
      { view: 'knowledge', icon: 'kb', label: '投后归档资料' },
    ],
    focusWorkTypes: ['投后报告', '退出建议书', '项目复盘报告', '会议纪要'],
    focusRoles: ['postinv'], preferredStudio: ['word', 'ppt', 'table'],
    quickQuestions: [
      ['季度经营偏差与预警', '汇总被投企业最新营收、利润、现金流及关键客户进展，对比投资时预算指出偏差与回购触发预警。'],
      ['投后赋能与产业资源对接', '结合企业当前经营瓶颈，列出可协同的大客户导入、产业链并购或再融资赋能事项。'],
      ['退出路径与回报测算', '分析本项目 IPO 申报、产业并购、老股转让或协议回购等退出路径的时间表与收益敏感性。'],
      ['项目归档与复盘要点', '核查投后归档资料完整性并提炼可沉淀至机构知识库的投资经验与风控教训。'],
    ],
  },
  fund: {
    key: 'fund', workspaceTitle: '基金运营中心 · 募资与承销联动台', badge: '基金运营中心',
    tagline: '产投承销对接 · 上市公司与社会投资人联动 · 募投项目进度全景 · LP 服务',
    accentVar: 'var(--blue)', tone: 'blue',
    businessLayer: '基金募资节奏与 LP 对接 · 产投承销会与社会投资人协同 · 全院募投项目进度监测（合规隔离底稿）',
    aiLayer: 'LP 募资与季报材料要点 · 产投承销推介框架 · 地方产业引导基金配套策略 · 宏观与赛道叙事',
    nav: [
      { view: 'workbench', icon: 'globe', label: '基金运营与募投台', badgeKey: 'progressTotal' },
      { view: 'research', icon: 'industry', label: '宏观与募资研报' },
      { view: 'companies', icon: 'building', label: '合作主体与LP库' },
      { view: 'knowledge', icon: 'kb', label: '募资与公开资料' },
      { view: 'tasks', icon: 'cal', label: '募投协同任务' },
    ],
    focusWorkTypes: ['Teaser', '政府产业条件梳理', '项目进度报表'],
    focusRoles: ['fund'], preferredStudio: ['ppt', 'word', 'table'],
    quickQuestions: [
      ['募资路演亮点提炼', '基于当前公开研究与获授权资料，提炼面向机构 LP 与地方引导基金的赛道逻辑与基金配置亮点。'],
      ['产投承销对接方案', '梳理对接上市公司、产业方及社会投资人共同参与项目承销的合作结构与路演要点。'],
      ['LP 季度沟通简报框架', '起草基金季度募投运作简报大纲，突出宏观趋势、重点赛道布局与合规披露边界。'],
      ['出资节奏与项目协同提示', '结合当前项目推进阶段，梳理基金募资关账窗口与项目出资节奏的匹配建议。'],
    ],
  },
  it: {
    key: 'it', workspaceTitle: '信息技术部 · 系统治理与运维台', badge: '系统治理台',
    tagline: '企业开箱配置 · 组织四层权限 · 流程版本发布 · 多模型安全路由与审计（业务底稿合规隔离）',
    accentVar: 'var(--muted)', tone: 'muted',
    businessLayer: '组织架构与 CSV 批量建号 · 四层权限与密级策略 · 工作流编排发布 · 在线会话与审计追踪',
    aiLayer: '混合/本地/外部大模型健康监测 · 密级拦截护栏 · 企业知识库挂载与定时任务运维',
    nav: [
      { view: 'workbench', icon: 'set', label: '系统治理与运维台' },
      { view: 'settings', icon: 'shield', label: '企业开箱与权限配置', sub: 'onboarding' },
      { view: 'knowledge', icon: 'kb', label: '知识库挂载管理' },
      { view: 'research', icon: 'link', label: '外部接口与研究源' },
    ],
    focusWorkTypes: [], focusRoles: ['sysadmin'], preferredStudio: ['table', 'word', 'ppt'],
    quickQuestions: [
      ['系统就绪与安全边界说明', '总结当前机构四层权限、资料密级上限与外部模型路由护栏的配置要点。'],
    ],
  },
}

function roleSubBadge(user, key) {
  if (key !== 'financial') return null
  const r = user.roles ?? []
  if (r.includes('head')) return '部门负责人视角 · 统筹审批与定稿'
  if (r.includes('pm')) return '投资经理视角 · 尽调执行与推进'
  if (r.includes('analyst')) return '投资分析师视角 · 行业研究与数据核验（敏感字段自动脱敏）'
  if (r.includes('staff')) return '综合协作视角 · 纪要归档与项目协同'
  return null
}

/** 轻量部门画像（附在 state.deptProfile 中，供导航、顶栏与三栏工作台即刻个性化） */
export function getDeptProfile(user, db, org) {
  const key = resolveDeptKey(user, db)
  const meta = PROFILE_META[key] ?? PROFILE_META.financial
  const deptName = db?.get('depts', user.deptId)?.name ?? meta.badge
  const isExecutive = isExecutiveUser(user)
  const canOpenSettings = isExecutive || org.can(user, 'org.manage') || org.can(user, 'settings.manage') || org.can(user, 'workflow.config') || org.can(user, 'ai.policy') || org.can(user, 'audit.read')
  return {
    key, deptId: user.deptId ?? '', deptName, isExecutive, canOpenSettings,
    workspaceTitle: meta.workspaceTitle,
    badge: key === 'executive' ? '管理层 · 全局视角' : deptName,
    roleSubBadge: roleSubBadge(user, key),
    tagline: meta.tagline, accentVar: meta.accentVar, tone: meta.tone,
    businessLayer: meta.businessLayer, aiLayer: meta.aiLayer, nav: meta.nav,
    workspaceHints: {
      lensLabel: key === 'executive' ? '管理层投决视角' : `${deptName}视角`,
      focusWorkTypes: meta.focusWorkTypes, focusRoles: meta.focusRoles,
      preferredStudio: meta.preferredStudio, quickQuestions: meta.quickQuestions,
    },
  }
}

/**
 * 全院脱敏项目进度看板：
 * 任何部门都可查看全机构项目的阶段推进与百分比，以便跨部门协同；
 * 严格隔离敏感信息：绝不包含 fields(金额/估值/条款/LP/商业秘密)、desc、files、deliverables 正文或成员授权详情。
 */
export function buildSanitizedProgressBoard({ db, org, engine }, user) {
  const deptMap = new Map(db.all('depts').map(d => [d.id, d.name]))
  const userMap = new Map(db.all('users').map(u => [u.id, u.name]))
  const companyMap = new Map(db.all('companies').map(c => [c.id, c]))
  return db.all('projects').map(p => {
    const wf = engine.def(p)
    const stages = wf?.stages ?? []
    const curStage = stages.find(s => s.id === p.stageId)
    const flow = computeFlowMetrics(db, engine, p)
    const comp = p.companyId ? companyMap.get(p.companyId) : null
    const canOpen = org.seesProject(user, p)
    return {
      id: p.id, name: p.name, company: comp?.short ?? '', industry: comp?.industry ?? '综合',
      businessType: p.businessType, businessName: BT_NAME[p.businessType] ?? p.businessType,
      deptId: p.deptId ?? '', deptName: deptMap.get(p.deptId) ?? '业务部门',
      ownerName: userMap.get(p.owner) ?? '未指派',
      stageId: p.stageId, stage: curStage?.name ?? '立项', stageKind: curStage?.kind ?? p.stageKind ?? 'pre',
      stageIndex: Math.max(0, stages.findIndex(s => s.id === p.stageId)), stageCount: stages.length,
      status: p.status, statusLabel: p.statusLabel ?? '',
      overallPct: flow.overallPct, curStagePct: flow.curStagePct, readinessOk: flow.readinessOk,
      stageDetails: flow.stageDetails.map(st => ({ index: st.index, id: st.id, name: st.name, state: st.state, pct: st.pct, gate: st.gate })),
      updatedAt: p.updatedAt, canOpen,
      accessHint: canOpen ? '已授权：可进入工作台与门禁' : '仅展示脱敏进度 · 底稿与敏感字段按权限隔离',
    }
  }).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (b.updatedAt || 0) - (a.updatedAt || 0))
}
function buildDeptWorkQueue({ db, org, engine, guideFn }, user, key, visibleProjects) {
  const meta = PROFILE_META[key] ?? PROFILE_META.financial
  const focusTypes = new Set(meta.focusWorkTypes ?? [])
  const focusRoles = new Set(meta.focusRoles ?? [])
  const active = visibleProjects.filter(p => p.status === 'active')
  const items = []

  const pendingApps = db.find('approvals', a => a.status === 'pending' && a.voters.includes(user.id) && !a.votes.some(v => v.userId === user.id) && !a.recused.includes(user.id))
  for (const a of pendingApps) {
    const p = db.get('projects', a.projectId)
    if (!p || !org.seesProject(user, p)) continue
    items.push({
      kind: 'approval', priority: 1, badge: '待我表决', tone: 'amber',
      projectId: p.id, projectName: p.name,
      title: `${a.gate?.name ?? '决策节点'}（已投 ${a.votes.length}/${Math.max(1, a.voters.length - a.recused.length)}）`,
      sub: `${BT_NAME[p.businessType] ?? ''} · 需您表决`,
      action: 'nb-flowboard', actionLabel: '去表决',
    })
  }

  if (org.canOp(user, 'op.material.finalize')) {
    for (const p of active) {
      for (const d of db.find('deliverables', x => x.projectId === p.id && x.status === 'review')) {
        items.push({
          kind: 'review', priority: 2, badge: '待定稿复核', tone: 'blue',
          projectId: p.id, projectName: p.name,
          title: `「${d.type}」v${d.versions.length} 待复核定稿`,
          sub: p.statusLabel || '',
          action: 'nb-flowboard', actionLabel: '去审核',
        })
      }
    }
  }

  const userMap = new Map(db.all('users').map(u => [u.id, u.name]))
  for (const p of active) {
    const wf = engine.def(p)
    const curStage = wf?.stages?.find(s => s.id === p.stageId)
    for (const w of p.works ?? []) {
      const d = w.deliverableId ? db.get('deliverables', w.deliverableId) : null
      if (w.status === 'done' || d?.status === 'final') continue
      const isMine = w.assignee === user.id
      const matchesDeptWork = focusTypes.has(w.type) || (w.role && focusRoles.has(w.role))
      if (!isMine && !matchesDeptWork && key !== 'executive') continue
      if (key === 'executive' && !w.required) continue
      if (w.stageId !== p.stageId && !isMine) continue
      items.push({
        kind: 'work', priority: isMine ? 3 : 4,
        badge: isMine ? '我负责' : (w.required ? '阶段必做' : '部门协同'),
        tone: isMine ? 'real' : (w.required ? 'amber' : ''),
        projectId: p.id, projectName: p.name, workId: w.id, workType: w.type,
        title: `${w.type}${d ? `（${d.status === 'review' ? '待审核' : '草稿'} v${d.versions.length}）` : '（待起草）'}`,
        sub: `${curStage?.name ?? ''} · 负责人 ${userMap.get(w.assignee) ?? '未指派'}`,
        action: d?.status === 'review' ? 'nb-flowboard' : 'nb-enter',
        actionLabel: d?.status === 'review' ? '去门禁' : '去办理',
      })
    }
  }

  const tasks = db.find('tasks', t => !t.done && t.owner === user.id).sort((a, b) => (a.due || 9e15) - (b.due || 9e15))
  for (const t of tasks.slice(0, 6)) {
    const p = t.projectId ? db.get('projects', t.projectId) : null
    const canSee = !!(p && org.seesProject(user, p))
    items.push({
      kind: 'task', priority: 5, badge: '待办任务', tone: '', taskId: t.id,
      projectId: canSee ? p.id : null, projectName: p?.name ?? '部门协同事项',
      title: t.title, sub: t.due ? `截止 ${new Date(t.due).toLocaleDateString('zh-CN')}` : '未设截止日',
      action: canSee ? 'nb-enter' : 'go-tasks', actionLabel: canSee ? '打开项目' : '查看任务',
    })
  }

  if (items.length < 4 && guideFn) {
    for (const p of active) {
      for (const g of (guideFn(user, p, engine.readiness(p)) ?? []).filter(x => x.mine).slice(0, 2)) {
        items.push({
          kind: 'step', priority: 6, badge: '下一步', tone: 'real',
          projectId: p.id, projectName: p.name, title: g.text, sub: p.statusLabel || '',
          action: g.gate ? 'nb-flowboard' : 'nb-enter', actionLabel: g.gate ? '发起表决' : '去工作台',
        })
      }
    }
  }

  const seen = new Set()
  return items.sort((a, b) => a.priority - b.priority).filter(it => {
    const k = `${it.kind}:${it.projectId}:${it.title}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 14)
}

function buildRiskAlerts({ db, engine }, projects) {
  const alerts = []
  for (const p of projects) {
    if (p.status !== 'active') continue
    const flow = computeFlowMetrics(db, engine, p)
    const missing = (flow.readinessItems ?? []).filter(i => !i.ok)
    const dls = db.find('deliverables', d => d.projectId === p.id)
    const rework = dls.filter(d => d.status === 'rework')
    const unverified = dls.filter(d => (d.versions?.at(-1)?.check?.unmatched?.length ?? 0) > 0)
    const pendingApp = db.one('approvals', a => a.projectId === p.id && a.status === 'pending')
    if (rework.length) alerts.push({ level: 'red', tag: '退回重做', projectId: p.id, projectName: p.name, detail: `${rework.map(d => d.type).join('、')} 曾被决策退回，需重点复核整改闭环`, action: 'nb-flowboard' })
    if (unverified.length) {
      const n = unverified.reduce((acc, d) => acc + (d.versions?.at(-1)?.check?.unmatched?.length ?? 0), 0)
      alerts.push({ level: 'amber', tag: '数据核验', projectId: p.id, projectName: p.name, detail: `${unverified.map(d => d.type).join('、')} 存在 ${n} 处数值待与原文底稿核对`, action: 'nb-enter' })
    }
    if (pendingApp) alerts.push({ level: 'blue', tag: '待上会决策', projectId: p.id, projectName: p.name, detail: `「${pendingApp.gate?.name}」表决进行中（已投 ${pendingApp.votes.length}/${pendingApp.voters.length}）`, action: 'nb-flowboard' })
    else if (missing.length) alerts.push({ level: 'amber', tag: '准入缺口', projectId: p.id, projectName: p.name, detail: `当前阶段尚缺必做成果：${missing.map(m => m.work).join('、')}`, action: 'nb-flowboard' })
  }
  return alerts.slice(0, 10)
}

function buildModulesForDept(key, user, org, visibleProjects) {
  const firstActive = visibleProjects.find(p => p.status === 'active') ?? visibleProjects[0] ?? null
  const firstInd = visibleProjects.find(p => p.businessType === 'industrial' && p.status === 'active') ?? firstActive
  const firstFin = visibleProjects.find(p => p.businessType === 'financial' && p.status === 'active') ?? firstActive
  const firstPost = visibleProjects.find(p => ['post', 'exit', 'archive'].includes(p.stageKind)) ?? firstActive
  const pid = p => p?.id ?? ''

  const M = {
    executive: [
      { id: 'exec-ic', layer: '业务交互', icon: 'vote', title: '投委会与立项会表决', desc: '直接进入待决策项目的门禁表决、查看票数与一票意见', act: 'dept-go-decision', projectId: pid(firstActive), tone: 'amber' },
      { id: 'exec-cross', layer: 'AI 协作', icon: 'spark', title: '投委会反方十问推演', desc: '调动全密级底稿模拟反方委员深挖估值、条款与退出漏洞', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.executive.quickQuestions[0][1], tone: 'accent' },
      { id: 'exec-ledger', layer: '领导独享', icon: 'chart', title: '全院敏感台账透视', desc: '全量查看各项目金额、投前/投后估值、对赌条款与牵头部门', act: 'dept-exec-tab', tab: 'ledger', tone: 'ink' },
      { id: 'exec-depts', layer: '管理巡检', icon: 'building', title: '九部门运行巡检矩阵', desc: '按部门巡查在途项目、成果积压与团队推进节奏', act: 'dept-exec-tab', tab: 'departments', tone: 'blue' },
    ],
    financial: [
      { id: 'fin-quick', layer: '业务交互', icon: 'upload', title: '带 BP 一键快速立项', desc: '拖入商业计划书/财报自动识别公司、赛道、轮次并建档入库', act: 'quick-project', businessType: 'financial', disabled: !org.can(user, 'project.create'), tone: 'accent' },
      { id: 'fin-conflict', layer: 'AI 协作', icon: 'extract', title: '审计与 BP 口径冲突核查', desc: '交叉核对 A 级硬证据与 BP 自述数据，逐条定位异常并溯源', act: 'dept-skill-run', projectId: pid(firstFin), prompt: PROFILE_META.financial.quickQuestions[0][1], tone: 'amber' },
      { id: 'fin-harness', layer: 'AI 工作流', icon: 'slides', title: '成套编制立项 / 投决材料', desc: '一键规划并联动生成投决备忘录、路演 PPT 与尽调报告', act: 'nb-harness-open', projectId: pid(firstFin), tone: 'blue' },
      { id: 'fin-research', layer: '业务交互', icon: 'industry', title: '行业研究与智堡研报', desc: '检索半导体、储能、医疗器械等赛道深度报告并收藏入库', act: 'go', view: 'research', tone: 'green' },
    ],
    industrial: [
      { id: 'ind-quick', layer: '业务交互', icon: 'upload', title: '产业项目快速建档', desc: '按《产业投资流程》立项承接标准，一键新建产业落地项目', act: 'quick-project', businessType: 'industrial', disabled: !org.can(user, 'project.create'), tone: 'green' },
      { id: 'ind-gov', layer: 'AI 协作', icon: 'building', title: '政府产业条件梳理', desc: '梳理土地/能耗、引导基金配资、税收政策与地方履约前提', act: 'dept-skill-run', projectId: pid(firstInd), prompt: PROFILE_META.industrial.quickQuestions[1][1], tone: 'accent' },
      { id: 'ind-feas', layer: 'AI 工作流', icon: 'doc', title: '产业价值可研与 Teaser 编制', desc: '成套编制产业价值及落地可研报告、产投承销 Teaser 路演稿', act: 'nb-harness-open', projectId: pid(firstInd), tone: 'blue' },
      { id: 'ind-gate', layer: '业务交互', icon: 'flow', title: '预投委 / 产投承销会推进', desc: '核验立项会、预投委会与产投承销会准入条件并一键报送', act: 'nb-flowboard', projectId: pid(firstInd), tone: 'amber' },
    ],
    finance: [
      { id: 'fa-extract', layer: '业务交互', icon: 'extract', title: '财报三表与 BP 智能提取', desc: '结构化抽取营收、毛利、净利、现金流并校验口径冲突', act: 'go', view: 'extract', tone: 'blue' },
      { id: 'fa-check', layer: 'AI 协作', icon: 'table', title: '三表勾稽与收入确认核查', desc: '聚焦收入确认时点、应收账龄与经营现金流背离自动诊断', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.finance.quickQuestions[0][1], tone: 'accent' },
      { id: 'fa-val', layer: 'AI 协作', icon: 'chart', title: '估值模型与敏感性测算', desc: '基于财务预测生成 PE/PS 动态估值区间与敏感性分析表', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.finance.quickQuestions[2][1], tone: 'amber' },
      { id: 'fa-close', layer: '业务交互', icon: 'check', title: '交割清单与打款确认会签', desc: '处理需财务岗位确认的交割先决条件与验资打款门禁', act: 'nb-flowboard', projectId: pid(firstActive), tone: 'green' },
    ],
    legal: [
      { id: 'lg-tpl', layer: '业务交互', icon: 'tpl', title: 'NDA / 框架协议标准件库', desc: '调用机构标准 NDA、框架投资协议与正式交易文件模板', act: 'go', view: 'templates', tone: 'violet' },
      { id: 'lg-clause', layer: 'AI 协作', icon: 'shield', title: '回购/对赌/优先清算红线审查', desc: '逐条提取特殊股东权利与触发条件，标记可执行性法律漏洞', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.legal.quickQuestions[0][1], tone: 'amber' },
      { id: 'lg-dd', layer: 'AI 协作', icon: 'doc', title: '股权沿革、代持与诉讼排查', desc: '从底稿快速汇总股权代持还原、涉诉记录与核心资质风险', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.legal.quickQuestions[1][1], tone: 'blue' },
      { id: 'lg-sign', layer: '业务交互', icon: 'flow', title: '交易文件与确权交割会签', desc: '追踪项目落地确权与交割确认（法务会签）节点', act: 'nb-flowboard', projectId: pid(firstActive), tone: 'green' },
    ],
    risk: [
      { id: 'rk-scan', layer: 'AI 协作', icon: 'shield', title: '独立风控因子与漏洞扫描', desc: '按行业、财务、法律、交易结构与退出五维度生成风险清单', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.risk.quickQuestions[0][1], tone: 'amber' },
      { id: 'rk-struct', layer: 'AI 协作', icon: 'vote', title: '交易结构与风控机制评估', desc: '专项核查资金监管、回购担保与退出兜底条款可执行性', act: 'dept-skill-run', projectId: pid(firstActive), prompt: PROFILE_META.risk.quickQuestions[1][1], tone: 'blue' },
      { id: 'rk-gate', layer: '业务交互', icon: 'flow', title: '预投委 / 风险门禁表决', desc: '核验项目阶段准入必做项并出具独立风控表决意见', act: 'nb-flowboard', projectId: pid(firstActive), tone: 'accent' },
      { id: 'rk-audit', layer: '合规治理', icon: 'history', title: '全院合规审计轨迹抽查', desc: '查阅人员权限变更、密级下载、成果定稿与审批操作日志', act: 'go', view: 'settings', sub: 'audit', tone: 'muted' },
    ],
    postinv: [
      { id: 'pi-report', layer: 'AI 协作', icon: 'doc', title: '季度投后报告编制', desc: '汇总被投企业经营营收、客户进展与预算达成偏差生成投后报告', act: 'dept-skill-run', projectId: pid(firstPost), prompt: PROFILE_META.postinv.quickQuestions[0][1], tone: 'cyan' },
      { id: 'pi-exit', layer: 'AI 协作', icon: 'chart', title: '退出路径与回报测算', desc: '编制退出建议书，比选 IPO、产业并购与协议回购退出窗口', act: 'dept-skill-run', projectId: pid(firstPost), prompt: PROFILE_META.postinv.quickQuestions[2][1], tone: 'amber' },
      { id: 'pi-meet', layer: '业务交互', icon: 'mic', title: '投后经营复盘会议纪要', desc: '整理投后季度沟通会录音与决定事项、跟踪赋能待办闭环', act: 'go', view: 'meetings', tone: 'blue' },
      { id: 'pi-gate', layer: '业务交互', icon: 'flow', title: '投后归档与退出投委门禁', desc: '推进项目归档、退出建议书定稿及退出投委会表决流程', act: 'nb-flowboard', projectId: pid(firstPost), tone: 'green' },
    ],
    fund: [
      { id: 'fd-pitch', layer: 'AI 协作', icon: 'slides', title: 'LP 募资与季报叙事助手', desc: '在右栏 AI 助手结合宏观与行业研究起草 LP 沟通与路演要点', act: 'dept-ai-prompt', prompt: PROFILE_META.fund.quickQuestions[0][1], tone: 'blue' },
      { id: 'fd-synd', layer: 'AI 协作', icon: 'globe', title: '产投承销对接方案框架', desc: '起草面向地方引导基金、上市公司与社会投资人的承销推介大纲', act: 'dept-ai-prompt', prompt: PROFILE_META.fund.quickQuestions[1][1], tone: 'accent' },
      { id: 'fd-res', layer: '业务交互', icon: 'industry', title: '宏观与赛道募资研报库', desc: '查阅智堡研报与宏观数据，支撑基金发行与出资人路演', act: 'go', view: 'research', tone: 'green' },
      { id: 'fd-cos', layer: '业务交互', icon: 'building', title: '合作主体与 LP 资料库', desc: '查看机构公司库与公开资料，协同基金募投与出资节奏', act: 'go', view: 'companies', tone: 'amber' },
    ],
    it: [
      { id: 'it-onboard', layer: '系统治理', icon: 'building', title: '企业开箱落地与批量建号', desc: '检查 6 项上线就绪度，CSV 一键批量导入部门与员工账号', act: 'enterprise-open', tone: 'accent' },
      { id: 'it-roles', layer: '权限治理', icon: 'shield', title: '四层权限与密级规则配置', desc: '维护 10 类岗位数据范围、业务操作、敏感字段与资料密级上限', act: 'go', view: 'settings', sub: 'roles', tone: 'blue' },
      { id: 'it-models', layer: '模型治理', icon: 'bot', title: '多模型安全路由配置', desc: '配置混合/本地/外部大模型连接与机密资料离线防外发阈值', act: 'nb-api', tone: 'amber' },
      { id: 'it-wf', layer: '流程治理', icon: 'flow', title: '业务流程版本编排与审计', desc: '可视化编排财投/产投工作流版本，查看操作审计与快照回滚', act: 'go', view: 'settings', sub: 'workflow', tone: 'muted' },
    ],
  }
  return M[key] ?? M.financial
}

/** 领导层（d_mgmt / partner）独享全局驾驶舱数据：非管理层一律 403 Forbidden */
export function buildExecutiveOverview({ db, engine, kb }, user) {
  if (!isExecutiveUser(user)) {
    throw new Forbidden('仅企业管理层 / 合伙人可访问全机构全局驾驶舱与全量内容', 'dept.executive')
  }
  const allProjects = db.all('projects')
  const depts = db.all('depts')
  const users = db.all('users').filter(u => !u.disabled)
  const deptMap = new Map(depts.map(d => [d.id, d.name]))
  const userMap = new Map(users.map(u => [u.id, u]))
  const compMap = new Map(db.all('companies').map(c => [c.id, c]))
  const approvals = db.find('approvals', a => a.status === 'pending')
  const allDeliverables = db.all('deliverables')
  const pendingReviews = allDeliverables.filter(d => d.status === 'review')

  const sensitiveLedger = allProjects.map(p => {
    const wf = engine.def(p)
    const st = wf?.stages?.find(s => s.id === p.stageId)
    const flow = computeFlowMetrics(db, engine, p)
    const comp = p.companyId ? compMap.get(p.companyId) : null
    const pApps = approvals.filter(a => a.projectId === p.id)
    const pRevs = pendingReviews.filter(d => d.projectId === p.id)
    return {
      id: p.id, name: p.name, company: comp?.short ?? '', industry: comp?.industry ?? '综合',
      businessType: p.businessType, businessName: BT_NAME[p.businessType] ?? p.businessType,
      deptId: p.deptId, deptName: deptMap.get(p.deptId) ?? '业务部门',
      ownerName: userMap.get(p.owner)?.name ?? '未指派',
      stage: st?.name ?? '立项', status: p.status, statusLabel: p.statusLabel ?? '',
      overallPct: flow.overallPct, readinessOk: flow.readinessOk,
      fields: p.fields ?? {}, desc: p.desc ?? '',
      pendingApprovals: pApps.length, pendingReviews: pRevs.length,
      myPendingVote: pApps.some(a => a.voters.includes(user.id) && !a.votes.some(v => v.userId === user.id) && !a.recused.includes(user.id)),
      deliverableCount: allDeliverables.filter(d => d.projectId === p.id).length,
      updatedAt: p.updatedAt,
    }
  })

  const departments = depts.map(dept => {
    const members = users.filter(u => u.deptId === dept.id)
    const memberIds = new Set(members.map(m => m.id))
    const key = resolveDeptKey({ deptId: dept.id, roles: members[0]?.roles ?? [] }, db)
    const meta = PROFILE_META[key] ?? PROFILE_META.financial
    const focusTypes = new Set(meta.focusWorkTypes ?? [])
    const relatedProjects = sensitiveLedger.filter(p => {
      if (dept.id === 'd_mgmt') return true
      if (dept.id === 'd_fin' || dept.id === 'd_ind') return p.deptId === dept.id
      const rawP = allProjects.find(x => x.id === p.id)
      if (dept.id === 'd_post') return ['post', 'exit', 'archive'].includes(rawP?.stageKind) || rawP?.members?.some(m => memberIds.has(m.userId))
      if (dept.id === 'd_risk' || dept.id === 'd_it') return p.status === 'active'
      return rawP?.members?.some(m => memberIds.has(m.userId)) || (rawP?.owner && memberIds.has(rawP.owner))
    })
    const openWorks = allProjects.filter(p => p.status === 'active').flatMap(p => (p.works ?? []).filter(w => {
      const d = w.deliverableId ? db.get('deliverables', w.deliverableId) : null
      if (w.status === 'done' || d?.status === 'final') return false
      return memberIds.has(w.assignee) || (focusTypes.size > 0 && focusTypes.has(w.type) && w.stageId === p.stageId)
    }).map(w => ({ projectId: p.id, projectName: p.name, type: w.type, required: !!w.required, assigneeName: userMap.get(w.assignee)?.name ?? '未指派' })))
    const activeRel = relatedProjects.filter(p => p.status === 'active')
    const avgPct = activeRel.length ? Math.round(activeRel.reduce((s, x) => s + x.overallPct, 0) / activeRel.length) : 0
    return {
      id: dept.id, key, name: dept.name, workspaceTitle: meta.workspaceTitle, accentVar: meta.accentVar,
      headCount: members.length, members: members.map(m => ({ id: m.id, name: m.name, title: m.title })),
      projectCount: relatedProjects.length, activeCount: activeRel.length,
      openWorksCount: openWorks.length, openWorks: openWorks.slice(0, 6),
      pendingApprovals: relatedProjects.reduce((s, x) => s + x.pendingApprovals, 0),
      pendingReviews: relatedProjects.reduce((s, x) => s + x.pendingReviews, 0),
      avgProgress: avgPct,
      projects: relatedProjects.slice(0, 8).map(x => ({ id: x.id, name: x.name, stage: x.stage, status: x.status, overallPct: x.overallPct, amount: x.fields?.amount ?? '—', valuation: x.fields?.valuation ?? '—' })),
    }
  })

  const decisionQueue = approvals.map(a => {
    const p = db.get('projects', a.projectId)
    return {
      id: a.id, projectId: a.projectId, projectName: p?.name ?? '',
      businessName: BT_NAME[p?.businessType] ?? '', deptName: deptMap.get(p?.deptId) ?? '',
      gateName: a.gate?.name ?? '决策节点', rule: a.gate?.rule ?? 'majority',
      votesDone: a.votes.length, votesTotal: Math.max(1, a.voters.length - a.recused.length),
      myTurn: a.voters.includes(user.id) && !a.votes.some(v => v.userId === user.id) && !a.recused.includes(user.id),
      amount: p?.fields?.amount ?? '—', valuation: p?.fields?.valuation ?? '—', requestedAt: a.requestedAt,
    }
  })

  return {
    summary: {
      totalProjects: allProjects.length,
      activeProjects: allProjects.filter(p => p.status === 'active').length,
      financialActive: allProjects.filter(p => p.status === 'active' && p.businessType === 'financial').length,
      industrialActive: allProjects.filter(p => p.status === 'active' && p.businessType === 'industrial').length,
      postActive: allProjects.filter(p => p.status === 'active' && ['post', 'exit'].includes(p.stageKind)).length,
      terminatedProjects: allProjects.filter(p => p.status === 'terminated').length,
      pendingApprovals: approvals.length, myPendingVotes: decisionQueue.filter(x => x.myTurn).length,
      pendingReviews: pendingReviews.length, totalUsers: users.length, totalDepts: depts.length,
      kbFiles: kb ? kb.list(user).filter(f => !f.rel.includes('/.versions/')).length : 0,
    },
    departments, sensitiveLedger, decisionQueue,
  }
}

/** 轻量导航角标计数：供 state() 立即返回，不触发重计算 */
export function getNavBadges({ db, org, kb }, user) {
  const isExec = isExecutiveUser(user)
  const visible = db.all('projects').filter(p => org.seesProject(user, p))
  const activeVisible = visible.filter(p => p.status === 'active')
  const allActive = db.find('projects', p => p.status === 'active').length
  const pendingAll = db.find('approvals', a => a.status === 'pending')
  const myVotes = pendingAll.filter(a => a.voters.includes(user.id) && !a.votes.some(v => v.userId === user.id) && !a.recused.includes(user.id) && org.seesProject(user, db.get('projects', a.projectId))).length
  const myReviews = org.canOp(user, 'op.material.finalize')
    ? db.find('deliverables', d => d.status === 'review' && activeVisible.some(p => p.id === d.projectId)).length
    : 0
  const myTasks = db.find('tasks', t => !t.done && t.owner === user.id).length
  return {
    activeProjects: activeVisible.length,
    kbFiles: kb ? kb.files().filter(f => kb.visible(user, f)).length : 0,
    pendingApprovals: isExec ? pendingAll.length : myVotes,
    myVotes,
    deptQueue: myVotes + myReviews + myTasks,
    riskAlerts: activeVisible.filter(p => db.find('deliverables', d => d.projectId === p.id && d.status === 'rework').length > 0).length + myVotes,
    progressTotal: allActive,
  }
}

/** 统一部门工作台入口：按登录者所属部门返回专属业务操作台、KPI、工作队列与全院脱敏进度看板 */
export async function buildDeptWorkspace({ db, org, engine, kb, guideFn, readinessFn }, user) {
  const profile = getDeptProfile(user, db, org)
  const key = profile.key
  const visibleProjects = db.all('projects').filter(p => org.seesProject(user, p))
  const activeVisible = visibleProjects.filter(p => p.status === 'active')
  const progressBoard = buildSanitizedProgressBoard({ db, org, engine }, user)
  const activeProgress = progressBoard.filter(p => p.status === 'active')
  const workQueue = buildDeptWorkQueue({ db, org, engine, guideFn }, user, key, visibleProjects)
  const riskAlerts = (key === 'risk' || key === 'executive') ? buildRiskAlerts({ db, engine }, visibleProjects) : []
  const executive = profile.isExecutive ? buildExecutiveOverview({ db, engine, kb }, user) : null
  const systemHealth = key === 'it' && readinessFn ? await readinessFn() : null

  const industrialPhases = (key === 'industrial' || key === 'executive')
    ? INDUSTRIAL_PHASES.map(ph => ({ ...ph, projects: progressBoard.filter(p => p.businessType === 'industrial' && ph.stageIds.includes(p.stageId)) }))
    : null

  const financialFunnel = (key === 'financial' || key === 'executive')
    ? ['s_opp', 's_prep', 's_dd', 's_ic', 's_trade', 's_post'].map((sid, idx) => {
      const names = ['项目机会', '立项准备', '尽职调查', '投资决策', '交易交割', '投后管理']
      const list = progressBoard.filter(p => p.businessType === 'financial' && p.status === 'active' && p.stageId === sid)
      return { id: sid, no: String(idx + 1).padStart(2, '0'), name: names[idx], count: list.length, projects: list.map(x => ({ id: x.id, name: x.name, overallPct: x.overallPct, canOpen: x.canOpen })) }
    })
    : null

  const handoverWatch = key === 'postinv'
    ? progressBoard.filter(p => p.status === 'active' && ['decision', 'execution'].includes(p.stageKind))
    : key === 'fund'
      ? progressBoard.filter(p => p.status === 'active' && ['diligence', 'decision', 'execution'].includes(p.stageKind))
      : []

  const pendingVotes = workQueue.filter(i => i.kind === 'approval').length
  const pendingRevs = workQueue.filter(i => i.kind === 'review').length
  const myTasks = db.find('tasks', t => !t.done && t.owner === user.id).length
  const kpisByKey = {
    executive: () => [
      { label: '全机构在途项目', value: executive.summary.activeProjects, sub: `财投 ${executive.summary.financialActive} · 产投 ${executive.summary.industrialActive}`, tone: 'ink' },
      { label: '待我投决 / 表决', value: executive.summary.myPendingVotes, sub: `全院待决 ${executive.summary.pendingApprovals} 项`, tone: executive.summary.myPendingVotes ? 'amber' : 'real' },
      { label: '全院待定稿复核', value: executive.summary.pendingReviews, sub: `覆盖 ${executive.summary.totalDepts} 个部门`, tone: 'blue' },
      { label: '全院底稿档案', value: executive.summary.kbFiles, sub: `在线成员 ${executive.summary.totalUsers} 人`, tone: 'accent' },
    ],
    financial: () => [
      { label: '授权在途项目', value: activeVisible.length, sub: `财投在途 ${activeVisible.filter(p => p.businessType === 'financial').length} 个`, tone: 'accent' },
      { label: '待办与推进事项', value: workQueue.length, sub: `待我任务 ${myTasks} 项`, tone: workQueue.length ? 'amber' : 'real' },
      { label: '待定稿复核', value: pendingRevs, sub: '审核通过即可上会', tone: 'blue' },
      { label: '全院在途进度', value: activeProgress.length, sub: '跨部门脱敏进度可视', tone: '' },
    ],
    industrial: () => [
      { label: '产投在途项目', value: activeVisible.filter(p => p.businessType === 'industrial').length, sub: `已授权共 ${activeVisible.length} 个`, tone: 'green' },
      { label: '待办产投工作项', value: workQueue.length, sub: '政府条件 / 可研 / 承销', tone: workQueue.length ? 'amber' : 'real' },
      { label: '四阶段主干覆盖', value: `${industrialPhases.filter(ph => ph.projects.length > 0).length}/4`, sub: '立项→尽调→落地→退出', tone: 'accent' },
      { label: '全院在途进度', value: activeProgress.length, sub: '跨部门脱敏进度可视', tone: '' },
    ],
    finance: () => [
      { label: '涉财授权项目', value: activeVisible.length, sub: `可见项目 ${visibleProjects.length} 个`, tone: 'blue' },
      { label: '财审与估值队列', value: workQueue.filter(i => i.kind === 'work' || i.kind === 'task').length, sub: '三表勾稽 / 估值 / 交割', tone: 'amber' },
      { label: '交割会签待办', value: pendingVotes, sub: '交割打款确认会签', tone: pendingVotes ? 'amber' : 'real' },
      { label: '全院在途进度', value: activeProgress.length, sub: '提前预判财审排期', tone: '' },
    ],
    legal: () => [
      { label: '涉法授权项目', value: activeVisible.length, sub: `可见项目 ${visibleProjects.length} 个`, tone: 'violet' },
      { label: '协议与法审队列', value: workQueue.filter(i => i.kind === 'work' || i.kind === 'task').length, sub: 'NDA / 框架 / 法调 / 交易', tone: 'amber' },
      { label: '确权交割会签', value: pendingVotes, sub: '法务交割确认节点', tone: pendingVotes ? 'amber' : 'real' },
      { label: '全院在途进度', value: activeProgress.length, sub: '提前排期法律尽调', tone: '' },
    ],
    risk: () => [
      { label: '监测在途项目', value: activeVisible.length, sub: '全院独立风险视角', tone: 'amber' },
      { label: '风险与准入预警', value: riskAlerts.length, sub: '退回 / 数据冲突 / 缺口', tone: riskAlerts.length ? 'amber' : 'real' },
      { label: '待风控表决', value: pendingVotes, sub: '预投委 / 风险门禁', tone: 'blue' },
      { label: '可审资料密级', value: LEVELS[org.effective(user)?.clearance ?? 1], sub: '不含 LP 与商业秘密', tone: '' },
    ],
    postinv: () => [
      { label: '在管投后项目', value: activeVisible.length, sub: '归档 / 赋能 / 退出跟踪', tone: 'cyan' },
      { label: '即将交割入池', value: handoverWatch.length, sub: '投决/交割期脱敏预警', tone: 'blue' },
      { label: '待办投后与退出', value: workQueue.length, sub: `个人任务 ${myTasks} 项`, tone: workQueue.length ? 'amber' : 'real' },
      { label: '全院在途进度', value: activeProgress.length, sub: '跨部门脱敏进度可视', tone: '' },
    ],
    fund: () => [
      { label: '全院募投进度项目', value: activeProgress.length, sub: '脱敏进度全景可视', tone: 'blue' },
      { label: '承销窗口期项目', value: handoverWatch.length, sub: '尽调 / 投决 / 落地阶段', tone: 'amber' },
      { label: '授权参与项目', value: activeVisible.length, sub: '未授权项目底稿隔离', tone: 'accent' },
      { label: '待办募资任务', value: myTasks, sub: 'LP 沟通与承销联动', tone: '' },
    ],
    it: () => [
      { label: '企业开箱就绪度', value: `${systemHealth?.scorePct ?? 0}%`, sub: `${systemHealth?.readyCount ?? 0}/${systemHealth?.totalCount ?? 6} 项已就绪`, tone: (systemHealth?.scorePct ?? 0) >= 80 ? 'real' : 'amber' },
      { label: '机构在册人员', value: db.all('users').filter(u => !u.disabled).length, sub: `${db.all('depts').length} 个部门 · 10 类岗位`, tone: 'blue' },
      { label: '已发布流程版本', value: db.all('workflows').filter(w => w.status === 'published').length, sub: '支持多业务线版本化', tone: 'accent' },
      { label: '全院项目进度数', value: activeProgress.length, sub: '敏感业务底稿合规隔离', tone: '' },
    ],
  }

  return {
    profile, kpis: (kpisByKey[key] ?? kpisByKey.financial)(),
    modules: buildModulesForDept(key, user, org, visibleProjects),
    workQueue, industrialPhases, financialFunnel, handoverWatch, riskAlerts, systemHealth,
    progressBoard, executive,
    counts: {
      activeProjects: activeVisible.length, deptQueue: workQueue.length, riskAlerts: riskAlerts.length,
      progressTotal: activeProgress.length,
      pendingApprovals: executive?.summary?.pendingApprovals ?? pendingVotes,
      myVotes: pendingVotes,
    },
  }
}