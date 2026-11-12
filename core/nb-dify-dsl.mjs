// 机构模板：一个模板 = 一种成品 + 一段编制要求。执行时把编制要求（可以在界面上改）交给成果编制，生成的成品可以直接报送。
// 每人每月的调用次数记在账本里，从 0 开始按实际执行累计；模板的使用次数同样只记实际执行。
import { generateStudioArtifact } from './nb-studio-gen.mjs'
import { submitArtifactToNode } from './nb-flow-board.mjs'
import { checkLine } from './nb-ground.mjs'

export const DIFY_WORKFLOW_TEMPLATES = [
  { id: 'ac_equity_memo', name: '投委会备忘录', category: '投委会', targetKind: 'ic_memo',
    brief: '先给结论和交易概要，再写公司与团队、行业、产品与客户、竞争、财务口径核对、估值与条款。\n单列一章反方意见，站在否决这个项目的立场写。\n最后列出交割前必须完成的事项。' },
  { id: 'ac_dd_word', name: '尽调报告', category: '尽职调查', targetKind: 'word',
    brief: '逐项核对财务、客户、历史沿革。\n公司自述材料和审计、合同口径不一致的地方单独成节，两个口径都写出来。\n每章结尾列出还没核实的事项。' },
  { id: 'ac_ic_ppt', name: '投委会汇报', category: '投委会', targetKind: 'ppt',
    brief: '每页一个判断，标题直接写结论。\n先讲这个项目能不能投，再讲依据，最后讲还差什么。\n有可比数字的地方用图表或表格。' },
  { id: 'ac_fin_xlsx', name: '财务与合同数据表', category: '财务核查', targetKind: 'table',
    brief: '' },
  { id: 'ac_gov_ind', name: '产业招商梳理', category: '产业基金', targetKind: 'mindmap',
    brief: '按产业招商的视角梳理：区域产业政策、落地条件、返投要求、已有的产业基础。\n每个节点标出处。' },
  { id: 'ac_team_check', name: '团队核查卡片', category: '法务合规', targetKind: 'flashcards',
    brief: '围绕创始团队履历、持股与服务期、竞业限制、知识产权和诉讼出卡片。\n底稿里没有的不要出。' },
  { id: 'ac_ic_defense', name: '上会答辩演练', category: '投委会', targetKind: 'quiz',
    brief: '模拟投委会委员的质询：估值依据、毛利率变化、应收和回款、回购与对赌条款。\n每题给出底稿里的依据。' },
]
const KIND_NAME = { ic_memo: '投委会备忘录（Word）', word: '尽调报告（Word）', ppt: '演示文稿（PPT）', table: '数据表（Excel）', mindmap: '思维导图', flashcards: '闪卡', quiz: '测验' }
const DESC = t => `生成${KIND_NAME[t.targetKind] ?? '成品'}${t.targetKind === 'table' ? '：底稿原表、带数字的原文摘录、风险与待核实事项三类工作表，不经过模型' : ''}`

const QKEY = 'enterprise_quota_ledger'
const month = () => new Date().toISOString().slice(0, 7)
function ledgerOf(db) {
  const l = db.get('kvstate', QKEY)
  // 换月清零；旧版本账本没有月份字段，里面是写死的初始值，一并丢弃
  return l?.month === month() ? l : { id: QKEY, month: month(), users: {}, tplUsage: l?.month ? l.tplUsage ?? {} : {} }
}

export function getEnterpriseGovState(db, user, org) {
  const isAdmin = org?.can?.(user, 'settings.manage') || org?.can?.(user, 'ai.policy') || user?.roles?.includes('r_admin')
  const ledger = ledgerOf(db)
  const limitCalls = db.get('settings', 'main')?.quota?.monthlyCalls ?? 500
  const usedCalls = ledger.users[user.id]?.usedCalls ?? 0
  const templates = DIFY_WORKFLOW_TEMPLATES.map(t => ({ ...t, desc: DESC(t), usageCount: ledger.tplUsage[t.id] || 0 }))
  return {
    isAdmin: !!isAdmin,
    quota: { month: ledger.month, usedCalls, limitCalls, remainCalls: Math.max(0, limitCalls - usedCalls) },
    permissions: { canToggleModel: !!isAdmin, canViewApiKey: !!isAdmin, canSyncTemplate: !!isAdmin },
    templates,
  }
}

/** 模板的编制要求原文，界面上可以改了再执行。（函数名沿用旧接口。） */
export function exportDifyDslYaml(tplId = 'ac_dd_word') {
  return (DIFY_WORKFLOW_TEMPLATES.find(t => t.id === tplId) ?? DIFY_WORKFLOW_TEMPLATES[0]).brief
}

export async function runDifyWorkflow({ db, kb, org, deliverables, lifecycle, ai, dir }, user, p, b) {
  const gov = getEnterpriseGovState(db, user, org)
  if (gov.quota.remainCalls <= 0) throw Object.assign(new Error('本月的调用次数已经用完，请联系管理员调整额度'), { status: 403 })
  const tpl = DIFY_WORKFLOW_TEMPLATES.find(t => t.id === b.workflowId) ?? DIFY_WORKFLOW_TEMPLATES[0]
  const brief = String(b.brief ?? b.dslYaml ?? tpl.brief ?? '').trim().slice(0, 2000)
  const t0 = Date.now()
  const art = await generateStudioArtifact({ db, kb, org, deliverables, ai }, user, p, {
    kind: tpl.targetKind, fileIds: b.fileIds, prompt: [brief, b.prompt].filter(Boolean).join('\n'),
    pageCount: b.pageCount || 8, theme: b.theme || 'mck', density: b.density || 'standard',
  })
  const ledger = ledgerOf(db)
  ledger.users[user.id] = { usedCalls: (ledger.users[user.id]?.usedCalls ?? 0) + 1 }
  ledger.tplUsage[tpl.id] = (ledger.tplUsage[tpl.id] || 0) + 1
  db.putQuiet('kvstate', ledger)
  // 执行记录：只写实际发生的步骤
  const trace = [
    { step: 1, node: '读取底稿', status: 'succeeded', detail: `${art.sourceCount} 份` },
    { step: 2, node: '撰写', status: 'succeeded', detail: art.engine && art.engine !== '底稿摘编' ? `${art.engine} 撰写` : `底稿摘编${art.engineNote ? `（${art.engineNote}）` : ''}` },
    { step: 3, node: '数字核对', status: art.check?.unmatched?.length ? 'warn' : 'succeeded', detail: art.check ? checkLine(art.check) : '这类成品直接取自底稿，不需要核对' },
  ]
  let submission = null
  if (b.autoSubmit) {
    try {
      submission = await submitArtifactToNode({ db, kb, org, deliverables, lifecycle, dir }, user, p, { artifactPath: art.fullPath, artifactName: art.name, note: `按模板「${tpl.name}」生成后报送`, autoSubmitReview: true })
      trace.push({ step: 4, node: '报送', status: 'succeeded', detail: `${submission.workType} v${submission.version}` })
    } catch (e) { trace.push({ step: 4, node: '报送', status: 'skipped', detail: e.message }) }
  }
  return { ok: true, workflowName: tpl.name, elapsedMs: Date.now() - t0, trace, artifact: art, submission, gov: getEnterpriseGovState(db, user, org) }
}
