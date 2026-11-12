// 企业版演示数据（全部主体、人员、金额为虚构）。首次启动或数据结构升级时写入。
import { cp, mkdir, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ROLES } from './org.mjs'
import { defaultWorkflows, BUSINESS_TYPES } from './workflow.mjs'
import { extractAny } from './office.mjs'
import { buildComprehensiveMarkdown } from './nb-deep-doc.mjs'

export const SCHEMA = 5
export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

export const DEFAULT_SETTINGS = {
  id: 'main',
  org: { name: '某投资管理有限公司（演示）' },
  models: { mode: 'hybrid', external: { approved: true, model: null, provider: null }, local: { baseURL: '', model: '' }, sensitiveLevel: 2 },
  sensitivity: { fields: { 'project.amount': 'amount', 'project.valuation': 'valuation', 'project.terms': 'terms', 'project.lp': 'fund_lp', 'company.本轮融资金额': 'amount', 'company.投前估值': 'valuation' } },
  materialRules: [
    { pattern: '交易文件', level: 3 }, { pattern: '会议录音/', level: 2 }, { pattern: '项目资料/', level: 2 }, { pattern: '项目工作区/', level: 2 },
    { pattern: '行业研究/', level: 0 }, { pattern: '宏观数据/', level: 0 }, { pattern: '另类数据/', level: 0 }, { pattern: '智堡/', level: 0 }, { pattern: '历史成果/', level: 1 },
  ],
  aiPolicy: { businessTypes: {}, workTypes: { 交易文件: 1, 风控意见: 1 }, levels: { 3: 1 } },
  automation: { preReview: true, notifyApprovers: true, deadlineDays: 2, autoClassify: true },
  push: { channels: [] },
  schedules: [
    { id: 'wisburg', name: '智堡研报定时采集', everyMinutes: 360, enabled: true },
    { id: 'brief', name: '每日晨报', at: '08:30', enabled: true },
    { id: 'deadline', name: '截止日提醒', at: '09:00', enabled: true },
  ],
  watchlist: ['半导体材料', '电子特气', '储能', '医疗器械', '智算中心', '新材料'],
  sso: { enabled: false, preset: 'oidc', authorizeUrl: '', tokenUrl: '', userinfoUrl: '', clientId: '', scope: 'openid profile email', userField: 'email', matchBy: 'email' },
  toolknit: { enabled: false, licenseAck: false, command: 'toolknit', allowTools: [] },
  desktop: { personaSwitch: true },
  market: { provider: 'none', note: '实时行情需接入经授权的数据源' },
}

const DEPTS = [
  ['d_mgmt', '管理层'], ['d_fin', '财务投资部'], ['d_ind', '产业投资部'], ['d_finance', '财务部'], ['d_legal', '法务部'],
  ['d_risk', '风控合规部'], ['d_post', '投后管理部'], ['d_fund', '基金运营中心'], ['d_it', '信息技术部'],
]
const USERS = [
  ['u_admin', '系统管理员', 'admin', ['sysadmin'], 'd_it', '系统管理员'],
  ['u_wang', '王总', 'wang', ['partner'], 'd_mgmt', '合伙人'], ['u_li', '李总', 'li', ['partner'], 'd_mgmt', '合伙人'], ['u_liu', '刘总', 'liu', ['partner'], 'd_mgmt', '合伙人'],
  ['u_chen', '陈总', 'chen', ['head'], 'd_fin', '财务投资部负责人'], ['u_zhao', '赵总', 'zhao', ['head'], 'd_ind', '产业投资部负责人'],
  ['u_zhang', '张伟', 'zhangwei', ['pm'], 'd_fin', '投资经理'], ['u_qian', '钱程', 'qiancheng', ['pm'], 'd_ind', '产业投资经理'],
  ['u_lin', '林晓', 'linxiao', ['analyst'], 'd_fin', '投资分析师'], ['u_zhou', '周敏', 'zhoumin', ['finance'], 'd_finance', '财务估值'],
  ['u_wu', '吴律', 'wulv', ['legal'], 'd_legal', '法务'], ['u_sun', '孙琳', 'sunlin', ['risk'], 'd_risk', '风控合规'],
  ['u_zheng', '郑洁', 'zhengjie', ['postinv'], 'd_post', '投后管理'], ['u_feng', '冯晨', 'fengchen', ['fund'], 'd_fund', '基金募资'], ['u_he', '何静', 'hejing', ['staff'], 'd_fin', '综合协作'],
]

const COMPANIES = [
  { id: 'c_cg', name: '澄光半导体材料有限公司', short: '澄光半导体', industry: '半导体材料', region: '江苏苏州' },
  { id: 'c_hy', name: '衡远储能科技股份有限公司', short: '衡远储能', industry: '新型储能', region: '广东深圳' },
  { id: 'c_mc', name: '明川医疗器械有限公司', short: '明川医疗', industry: '医疗器械', region: '上海' },
  { id: 'c_xz', name: '星舟智能装备有限公司', short: '星舟智能装备', industry: '智能制造', region: '安徽合肥' },
  { id: 'c_jc', name: '江城新材料产业园项目公司', short: '江城新材料产业园', industry: '新材料', region: '中部某市' },
  { id: 'c_yf', name: '云帆数据科技有限公司', short: '云帆数据', industry: '企业数据智能', region: '浙江杭州' },
  { id: 'c_bc', name: '北辰算力科技有限公司', short: '北辰算力', industry: '智算中心', region: '西部某市' },
  { id: 'c_qm', name: '青木消费品牌有限公司', short: '青木消费', industry: '消费品', region: '四川成都' },
]

const VIEWS = [
  { id: 'v_semi', scope: 'industry', target: '半导体材料', stance: '看多', thesis: '晶圆扩产与国产替代共振，电子特气、湿化学品国产化率仍有翻倍空间。', points: ['优先选择已进入 12 英寸产线验证的企业', '关注原材料进口依赖与客户集中度'] },
  { id: 'v_ess', scope: 'industry', target: '新型储能', stance: '中性', thesis: '需求高增但价格战压缩毛利，选择具备海外渠道与现金流管理能力的企业。', points: ['系统集成毛利率下行至 15%-22%', '海外回款与认证是核心尽调事项'] },
  { id: 'v_med', scope: 'industry', target: '医疗器械', stance: '看多', thesis: '出海逻辑兑现，MDR 认证壁垒抬高，头部企业份额提升。', points: ['关注海外渠道库存', '汇率风险需对冲'] },
]

/** 写入演示数据。engine 用于按真实流程推进项目，保证数据与流程一致。 */
export async function seed({ db, dir, engine, renderDeliverable, system }) {
  for (const sub of ['nas', 'local', 'templates', 'archive', 'workspace', 'uploads']) await mkdir(join(dir, sub), { recursive: true })
  if (existsSync(FIXTURES)) for (const sub of ['nas', 'templates', 'archive']) if (existsSync(join(FIXTURES, sub))) await cp(join(FIXTURES, sub), join(dir, sub), { recursive: true, force: false, errorOnExist: false })

  const m = { actor: system, reason: '初始化演示数据', action: 'seed' }
  db.put('settings', structuredClone(DEFAULT_SETTINGS), m)
  for (const r of DEFAULT_ROLES) db.put('roles', structuredClone(r), m)
  for (const [id, name] of DEPTS) db.put('depts', { id, name }, m)
  for (const [id, name, username, roles, deptId, title] of USERS) db.put('users', { id, name, username, roles, deptId, title }, m)
  for (const b of BUSINESS_TYPES) db.put('businessTypes', { ...b }, m)
  for (const w of defaultWorkflows()) db.put('workflows', w, m)
  for (const c of COMPANIES) db.put('companies', { ...c, fields: { 企业名称: { value: c.name, by: '系统', status: 'confirmed' }, 所属行业: { value: c.industry, by: '系统', status: 'confirmed' }, 注册地: { value: c.region, by: '系统', status: 'confirmed' } } }, m)
  for (const v of VIEWS) db.put('views', { ...v, by: '陈总', version: 1 }, m)
  db.put('kvstate', { id: 'persona', userId: 'u_zhang' }, m)

  const mounts = [
    { id: 'm_nas', name: '公司 NAS', kind: 'nas', path: join(dir, 'nas'), note: '演示目录；在设置中改为真实挂载点，如 /Volumes/research' },
    { id: 'm_local', name: '本地文件夹', kind: 'local', path: join(dir, 'local') },
    { id: 'm_tpl', name: '模板与规范', kind: 'templates', path: join(dir, 'templates'), readonly: true },
    { id: 'm_arch', name: '历史项目沉淀', kind: 'archive', path: join(dir, 'archive'), readonly: true },
    { id: 'm_ws', name: '项目工作区', kind: 'workspace', path: join(dir, 'workspace'), readonly: true },
    { id: 'm_up', name: '我的上传', kind: 'uploads', path: join(dir, 'uploads') },
  ]
  for (const mt of mounts) db.put('mounts', mt, m)

  const U = id => db.get('users', id)
  const day = n => Date.now() + n * 864e5
  const mk = (owner, input) => engine.create(U(owner), input)
  const toStage = (p, stageId, by, note) => engine.save(U(by), engine.enterStage(db.get('projects', p.id), stageId, U(by), note), note, 'seed')
  const loadRealDocs = async p => {
    const short = db.get('companies', p.companyId)?.short || p.name.split(' ')[0]
    const sub = join(dir, 'nas/项目资料', short)
    if (!existsSync(sub)) return [{ name: `${p.name}立项信息`, text: `${p.name}：${p.desc || ''}` }]
    const names = await readdir(sub).catch(() => [])
    const out = []
    for (const n of names) {
      const ex = await extractAny(await readFile(join(sub, n)), extname(n)).catch(() => ({ text: '' }))
      if (ex.text) out.push({ name: n, text: ex.text })
    }
    return out
  }
  const finalize = async (p, type, md, by, status = 'final') => {
    const realDocs = await loadRealDocs(p)
    if (md) realDocs.unshift({ name: `${p.name}核定纪要`, text: md })
    const richMd = buildComprehensiveMarkdown(p, type, realDocs)
    const d = await renderDeliverable({ projectId: p.id, type, markdown: richMd, user: U(by), engine: '底稿摘编', status })
    const cur = db.get('projects', p.id)
    db.put('projects', { ...cur, works: cur.works.map(w => w.type === type && !w.deliverableId ? { ...w, deliverableId: d.id, status: status === 'final' ? 'done' : 'doing' } : w) }, m)
    return d
  }
  const fin = { members: [{ userId: 'u_zhang', role: 'pm' }, { userId: 'u_lin', role: 'analyst' }, { userId: 'u_zhou', role: 'finance' }, { userId: 'u_wu', role: 'legal' }] }

  // p1 澄光半导体：项目机会已通过启动审批 → 立项准备（待编写立项报告与 NDA）
  let p1 = mk('u_zhang', { name: '澄光半导体 B轮', companyId: 'c_cg', businessType: 'financial', ...fin, fields: { amount: '8000 万元', valuation: '投前 30 亿元', terms: '2030 年底前未上市按 8% 年化回购', round: 'B轮' }, tags: ['半导体材料', '国产替代'], desc: '电子特气与湿化学品供应商，二期产线扩产。' })
  await finalize(p1, '项目信息表', '| 字段 | 值 | 来源 |\n|---|---|---|\n| 企业名称 | 澄光半导体材料有限公司 | BP 第2页 |\n| 本轮融资 | B轮 3 亿元 | BP 第5页 |', 'u_zhang')
  p1 = toStage(p1, 's_prep', 'u_chen', '项目启动审批通过（演示数据）')

  // p2 衡远储能：尽职调查中，有一段待转写的会议录音
  let p2 = mk('u_zhang', { name: '衡远储能 C轮', companyId: 'c_hy', businessType: 'financial', ...fin, fields: { amount: '1.2 亿元', valuation: '投前 45 亿元', terms: '业绩承诺：2026-2027 年净利润合计不低于 1.5 亿元', round: 'C轮' }, tags: ['新型储能', '出海'], desc: '工商业储能系统集成，海外收入占比 22%。' })
  await finalize(p2, '项目信息表', '| 字段 | 值 |\n|---|---|\n| 企业名称 | 衡远储能科技股份有限公司 |', 'u_zhang')
  p2 = toStage(p2, 's_prep', 'u_chen', '启动审批通过')
  await finalize(p2, '立项报告', '## 立项建议\n- 建议立项', 'u_zhang')
  await finalize(p2, 'NDA', '已签署', 'u_wu')
  p2 = toStage(p2, 's_dd', 'u_wang', '立项会通过（演示数据）')
  await finalize(p2, '尽调清单', '| 类别 | 事项 | 状态 |\n|---|---|---|\n| 财务 | 收入确认时点 | 进行中 |\n| 法律 | 前员工诉讼 | 待核实 |', 'u_lin', 'draft')
  db.put('meetings', { projectId: p2.id, title: '衡远储能尽调沟通会', kind: '项目会议', at: day(-1), attendees: ['u_zhang', 'u_lin', 'u_zhou', 'u_wu'], recordings: [], status: 'draft', decisions: [], todos: [] }, m)

  // p3 明川医疗：投资决策阶段，投资建议书待审核（演示投委会三分之二表决）
  let p3 = mk('u_zhang', { name: '明川医疗 Pre-IPO', companyId: 'c_mc', businessType: 'financial', ...fin, fields: { amount: '1 亿元', valuation: '投前 38 亿元', terms: '上市对赌：2028 年底前申报 IPO', round: 'Pre-IPO' }, tags: ['医疗器械', '出海'], desc: '监护与影像设备，海外收入占比 44%。' })
  for (const [st, by] of [['s_prep', 'u_chen'], ['s_dd', 'u_wang'], ['s_ic', 'u_chen']]) p3 = toStage(p3, st, by, '演示数据推进')
  const ddmc = await readFile(join(dir, 'nas/项目资料/明川医疗/尽调报告-终稿.docx')).catch(() => null)
  await finalize(p3, '尽调报告', '## 结论\n经营稳健，海外渠道库存与汇率是主要风险。', 'u_zhang')
  await finalize(p3, '投资建议书', `## 投资结论\n建议以投前 38 亿元估值投资 1 亿元。\n## 投资逻辑\n- 海外收入占比 44%，MDR 认证 26 项\n- 2025 年营业收入 4.31 亿元，净利润 0.89 亿元\n## 主要风险\n- 海外渠道库存\n- 汇率波动\n## 交易方案\n- 上市对赌：2028 年底前申报 IPO`, 'u_zhang', 'review')
  void ddmc

  // p4 星舟智能装备：已投资，投后管理
  let p4 = mk('u_zhang', { name: '星舟智能装备 B轮', companyId: 'c_xz', businessType: 'financial', members: [...fin.members, { userId: 'u_zheng', role: 'postinv' }], fields: { amount: '6000 万元', valuation: '投后 20 亿元', round: 'B轮' }, tags: ['智能制造'], desc: '协作机器人与关节模组，2025 年已完成投资。' })
  for (const st of ['s_prep', 's_dd', 's_ic', 's_trade', 's_post']) p4 = toStage(p4, st, 'u_chen', '演示数据推进')
  await finalize(p4, '投后报告', '## 2026Q3 投后报告\n- 收入同比增长 31%\n- 新增汽车零部件客户 2 家', 'u_zheng')

  // p5 江城新材料产业园：产业投资 · 尽调及承做
  let p5 = mk('u_qian', { name: '江城新材料产业园项目', companyId: 'c_jc', businessType: 'industrial', deptId: 'd_ind', members: [{ userId: 'u_qian', role: 'pm' }, { userId: 'u_zhou', role: 'finance' }, { userId: 'u_wu', role: 'legal' }], fields: { amount: '3 亿元（股权）+ 落地配套', valuation: '项目总投资 28 亿元', round: '产业项目' }, tags: ['新材料', '产业落地'], desc: '新材料产业园一期，地方政府产业基金跟投。' })
  await finalize(p5, '项目信息表', '| 字段 | 值 |\n|---|---|\n| 项目 | 江城新材料产业园 |', 'u_qian')
  await finalize(p5, '立项报告', '## 立项建议\n- 建议立项', 'u_qian')
  p5 = toStage(p5, 'i_dd', 'u_zhao', '立项会通过（演示数据）')

  // p6 云帆数据：新项目，只有 BP 与财报（用于智能提取与冲突识别）
  mk('u_zhang', { name: '云帆数据 B+轮', companyId: 'c_yf', businessType: 'financial', ...fin, fields: { round: 'B+轮' }, tags: ['企业服务', 'AI'], desc: '制造业数据中台与 AI 质检 SaaS。' })
  // p7 北辰算力：产业投资 · 立项及承接
  mk('u_qian', { name: '北辰算力智算中心', companyId: 'c_bc', businessType: 'industrial', deptId: 'd_ind', members: [{ userId: 'u_qian', role: 'pm' }], fields: { amount: '待定', round: '产业项目' }, tags: ['智算中心'], desc: '西部某市 2000P 智算中心建设与运营。' })
  // p8 青木消费：立项会否决（历史样例）
  const p8 = mk('u_zhang', { name: '青木消费 A轮', companyId: 'c_qm', businessType: 'financial', ...fin, tags: ['消费品'], desc: '新消费品牌，渠道扩张期。' })
  const p8b = toStage(p8, 's_prep', 'u_chen', '启动审批通过')
  engine.save(U('u_wang'), { ...p8b, status: 'terminated', statusLabel: '放弃项目', timeline: [...p8b.timeline, { at: Date.now(), by: '决策', event: '「立项会」结果：否决（放弃项目）', note: '渠道费用率过高，商业模式未验证' }] }, '立项会否决（演示数据）', 'terminate')

  const tasks = [
    ['核对澄光半导体最大客户续约条款', 'u_lin', 1], ['完成衡远储能海外认证进度核查', 'u_zhang', 3], ['复核衡远储能收入确认时点差异', 'u_zhou', 2],
    ['明川医疗投资建议书提交投委会', 'u_zhang', 1], ['江城产业园地方政策条款梳理', 'u_qian', 4], ['星舟智能装备 Q3 投后会议', 'u_zheng', 5],
  ]
  for (const [title, owner, d] of tasks) db.put('tasks', { title, owner, due: day(d), done: false, projectId: db.one('projects', p => title.includes(p.name.split(' ')[0].slice(0, 2)))?.id ?? null }, m)
}
