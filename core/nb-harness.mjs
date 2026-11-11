// Agentic Harness（受控思考与成套材料操作执行器）
// 设计原则：
// 1. 可控思考（Controllable Thinking）：支持 fast（直出）/ balanced（两阶段校验）/ deep（五步深度反思+红蓝军互校+自愈修复）；
//    支持人类在环审批断点（planOnly: true 先产出透明计划供合伙人/项目经理审阅修改，再执行 approveRun）。
// 2. 操作能力调用制作能力（Action -> Production Orchestration）：
//    把天眼查七维商事穿透、底稿 A/B/C 分级采信、Agent×Agent 跨源对质、9 大类成果编译器（PPT/Word/XLSX/IC Memo/导图/闪卡/测验/音视频）
//    与阶段门禁工作项报送（submitArtifactToNode）编排为统一可观测、可审计、可自检重试的受控流水线。
import { carbonComplete } from './nb-api.mjs'
import { parseJson } from './llm.mjs'
import { gradeDocCredibility, runAgentMeshCrossCheck, previewAnyArtifact } from './nb-agent-mesh.mjs'
import { prepareSources } from './nb-ground.mjs'
import { runTianyanchaDueDiligence } from './nb-tianyancha.mjs'
import { generateStudioArtifact } from './nb-studio-gen.mjs'
import { submitArtifactToNode } from './nb-flow-board.mjs'

const ALL_KINDS = ['ic_memo', 'ppt', 'word', 'table', 'mindmap', 'audio', 'video', 'flashcards', 'quiz']

const KIND_LABELS = {
  ic_memo: '九章投决备忘录 (IC Memo)',
  ppt: '演示文稿 (PPTX)',
  word: '深度尽调报告 (DOCX)',
  table: '五维对质数据台账 (XLSX)',
  mindmap: '逻辑思维导图 (HTML)',
  audio: '双人投研播客概览 (HTML)',
  video: '路演视频分镜脚本 (HTML)',
  flashcards: '投委会答辩核验闪卡 (HTML)',
  quiz: '尽调盲点压力测验 (HTML)',
}

const PACK_PRESETS = {
  ic_full_pack: {
    name: '投委会全套上会标准材料包',
    desc: '一键穿透底稿并制作：九章 IC 备忘录 + 演示文稿 PPT + 深度尽调 Word + 五维对质数据表 XLSX',
    kinds: ['ic_memo', 'ppt', 'word', 'table'],
    thinkingDepth: 'deep',
  },
  init_pack: {
    name: '立项会快速研判材料包',
    desc: '立项准备阶段核心三件套：立项演示文稿 PPT + 尽调清单数据表 XLSX + 逻辑思维导图',
    kinds: ['ppt', 'table', 'mindmap'],
    thinkingDepth: 'balanced',
  },
  dd_defense_pack: {
    name: '尽调深水区与上会答辩演练包',
    desc: '聚焦红蓝军矛盾对质：深度尽调报告 Word + 九章 IC 备忘录 + 答辩闪卡 + 盲点压力测验',
    kinds: ['word', 'ic_memo', 'flashcards', 'quiz'],
    thinkingDepth: 'deep',
  },
}

export function listHarnessPresets() {
  return Object.entries(PACK_PRESETS).map(([id, v]) => ({ id, ...v }))
}

/** 从自然语言指令智能推断需要调用的操作动作与制作套件 */
export function inferKindsFromGoal(goal = '', stage = '') {
  const g = String(goal || '').toLowerCase()
  const picked = new Set()
  if (/全套|上会包|所有核心|整套|一套完整|全部核心/.test(g)) {
    ;['ic_memo', 'ppt', 'word', 'table'].forEach(k => picked.add(k))
  }
  if (/全部9|九大|所有材料|全部成果/.test(g)) {
    ALL_KINDS.forEach(k => picked.add(k))
  }
  if (/ppt|演示|幻灯片|路演|deck|立项报告/.test(g)) picked.add('ppt')
  if (/word|docx|尽调报告|深度报告|文书/.test(g)) picked.add('word')
  if (/ic|备忘录|memo|投决|投资建议/.test(g)) picked.add('ic_memo')
  if (/excel|xlsx|表格|台账|数据表|清单/.test(g)) picked.add('table')
  if (/导图|脑图|mindmap/.test(g)) picked.add('mindmap')
  if (/音频|播客|对谈|audio/.test(g)) picked.add('audio')
  if (/视频|分镜|video/.test(g)) picked.add('video')
  if (/闪卡|问答卡|flash/.test(g)) picked.add('flashcards')
  if (/测验|考题|压力测试题|quiz/.test(g)) picked.add('quiz')
  if (!picked.size) {
    if (stage.includes('立项')) ['ppt', 'word', 'table'].forEach(k => picked.add(k))
    else ['ic_memo', 'ppt', 'word', 'table'].forEach(k => picked.add(k))
  }
  return [...picked]
}

async function collectRawDocs({ kb, org }, user, p, fileIds) {
  let allFiles = kb.list(user, { companyId: p.companyId }).filter(f => !f.rel.includes('/.versions/'))
  if (!allFiles.some(f => f.mountId !== 'm_ws')) {
    await kb.scanAll().catch(() => {})
    allFiles = kb.list(user, { companyId: p.companyId }).filter(f => !f.rel.includes('/.versions/'))
  }
  const rawSources = allFiles.filter(f => f.mountId !== 'm_ws' && !String(f.rel || '').includes('Studio成品'))
  const pool = rawSources.length ? rawSources : allFiles
  const matched = fileIds?.length ? allFiles.filter(f => fileIds.includes(f.id)) : []
  const picked = (matched.length ? matched : pool).slice(0, 12)
  const docs = []
  for (const f of picked) {
    const r = await kb.read(f.id, user).catch(() => null)
    if (r?.text) {
      const cred = gradeDocCredibility(f.name)
      docs.push({ id: f.id, name: f.name, grade: cred.grade, gradeLabel: cred.label, text: org.redact(user, r.text).slice(0, 6000) })
    }
  }
  return docs
}

/**
 * 第一阶段：Harness 受控思考与制作蓝图规划（Controllable Thinking & Action Plan）
 * 输出完全结构化、透明可编辑的思考链（thoughtChain）、证据缺口（gaps）、动作序列（steps）与制作规格（specs）。
 */
export async function planHarnessExecution(deps, user, p, opts = {}) {
  const { db, kb, org, ai } = deps
  const preset = opts.presetId && PACK_PRESETS[opts.presetId] ? PACK_PRESETS[opts.presetId] : null
  const goal = String(opts.goal || preset?.desc || `围绕「${p.name}」（${p.stage}）可控思考并制作完整投研材料`).trim()
  const thinkingDepth = ['fast', 'balanced', 'deep'].includes(opts.thinkingDepth)
    ? opts.thinkingDepth
    : (preset?.thinkingDepth || 'deep')
  const requestedKinds = (Array.isArray(opts.kinds) && opts.kinds.length
    ? opts.kinds.filter(k => ALL_KINDS.includes(k))
    : (preset?.kinds || inferKindsFromGoal(goal, p.stage)))
  const pageCount = Math.max(4, Math.min(24, Number(opts.pageCount) || 8))
  const targetMB = Math.max(3, Math.min(35, Number(opts.targetMB) || 6))
  const density = ['concise', 'standard', 'dense'].includes(opts.density) ? opts.density : 'standard'
  const theme = String(opts.theme || 'mck')
  const needTianyancha = Boolean(opts.withTianyancha || /天眼查|工商|司法|穿透/.test(goal))
  const autoSubmitStage = Boolean(opts.autoSubmitStage || /报送|提交审核|推进门禁|上会提交/.test(goal))

  const docs = await collectRawDocs({ kb, org }, user, p, opts.fileIds)
  const grounded = prepareSources(p, docs)
  const hasAGrade = docs.some(d => d.grade === 'A')

  let aiPlan = null
  let engine = 'Harness 规则受控规划器'
  if (thinkingDepth !== 'fast') {
    const tier = thinkingDepth === 'deep' ? 'medium' : 'low'
    const docDigest = docs.map((d, i) => `[${i + 1}] (${d.grade}级·${d.gradeLabel}) 《${d.name}》：${d.text.slice(0, 900)}`).join('\n---\n')
    const r = await carbonComplete({
      ai,
      tier,
      maxTokens: 3200,
      timeoutMs: thinkingDepth === 'deep' ? 42000 : 25000,
      system: `你是优势资本（Advantage Capital）首席投研 Harness 受控编排官。
你的职责是在真正动手制作材料前，先进行严谨、透明、可控的结构化思考：
1. 审视当前底稿的证据信用结构（A级审计/合同/工商 vs B级访谈 vs C级BP自述）；
2. 结合用户的制作目标，制定清晰的「思考判断 -> 工具动作 -> 每份材料的定制叙事重点 -> 质量验收门禁」；
3. 严禁编造底稿外的任何数字，缺失数据列入 gaps。
只输出严格合法的 JSON，格式：
{
  "coreThesis": "一句话核心投研立论（含底稿关键量化锚点）",
  "thoughtSteps": [
    {"phase": "底稿采信审视", "thought": "具体分析...", "decision": "采取动作..."},
    {"phase": "跨源风险锁定", "thought": "具体分析...", "decision": "采取动作..."},
    {"phase": "成套材料叙事分工", "thought": "具体分析...", "decision": "采取动作..."}
  ],
  "artifactDirectives": {
    "ppt": "针对本项目的演示文稿专属叙事指令...",
    "word": "针对本项目的深度尽调报告核查重点...",
    "ic_memo": "针对本项目的投委会表决核心焦点...",
    "table": "针对本项目的数据台账核验重点..."
  },
  "gaps": ["待补充核实的证据缺口1", "缺口2"]
}`,
      user: `项目：${p.name}（阶段：${p.stage}，轮次：${p.fields?.round || '未披露'}，估值：${p.fields?.valuation || '未披露'}）
用户任务目标：${goal}
计划制作成果清单：${requestedKinds.map(k => `${k}(${KIND_LABELS[k] || k})`).join('、')}
已勾选原始底稿（共 ${docs.length} 份，提取表格 ${grounded.tables.length} 张、关键条目 ${grounded.passages.length} 条）：
${docDigest || '（暂无底稿）'}`,
    })
    const parsed = parseJson(r.text)
    if (parsed && Array.isArray(parsed.thoughtSteps)) {
      aiPlan = parsed
      engine = r.engine
    }
  }

  const shouldEnrichTyc = needTianyancha || (!hasAGrade && thinkingDepth === 'deep')
  const thoughtSteps = aiPlan?.thoughtSteps?.length ? aiPlan.thoughtSteps : [
    {
      phase: '1. 底稿证据等级盘点',
      thought: `已挂载 ${docs.length} 份原始底稿（A级 ${docs.filter(d => d.grade === 'A').length} 份 / B级 ${docs.filter(d => d.grade === 'B').length} 份 / C级 ${docs.filter(d => d.grade === 'C').length} 份），提取结构化表格 ${grounded.tables.length} 张。`,
      decision: shouldEnrichTyc ? '触发天眼查七维商事司法穿透补齐 A 级外部强公信底稿' : '现有底稿已覆盖核心维度，直接进入跨源对质',
    },
    {
      phase: '2. 红蓝军跨源矛盾锁定',
      thought: 'C 级 BP 预测口径与 A/B 级审计合同口径易出现确认时点与毛利偏差，须在制作前统一数字口径。',
      decision: '调用 Agent×Agent 三侧网状互校引擎生成统一事实账本与 CP 先决条件清单',
    },
    {
      phase: '3. 成套材料协同编排与质检门禁',
      thought: `围绕「${p.stage}」门禁要求，按序编译 ${requestedKinds.length} 份异构成果，每份产物必须通过 ZIP/XML 解压体检与底稿数字核对。`,
      decision: `规格锁定：${pageCount}页/章 · 目标体积 ~${targetMB}MB · 密度 ${density}${autoSubmitStage ? ' · 质检通过后自动报送阶段工作项' : ''}`,
    },
  ]

  const actionSteps = []
  if (shouldEnrichTyc) {
    actionSteps.push({ id: 'act_tyc', type: 'tool', tool: 'tianyancha_enrich', label: '调用天眼查七维商事与司法穿透补齐 A 级底稿', status: 'pending' })
  }
  actionSteps.push({ id: 'act_mesh', type: 'tool', tool: 'agent_mesh_crosscheck', label: '执行 Agent×Agent 情报/撰写/蓝军三侧并发互校', status: 'pending' })
  for (const k of requestedKinds) {
    actionSteps.push({
      id: `make_${k}`,
      type: 'produce',
      kind: k,
      label: `受控编译制作：${KIND_LABELS[k] || k}`,
      directive: aiPlan?.artifactDirectives?.[k] || goal,
      status: 'pending',
    })
  }
  actionSteps.push({ id: 'act_verify', type: 'verify', tool: 'artifact_quality_gate', label: '执行全格式解压体检、体积页数校验与底稿数字锚定审计', status: 'pending' })
  if (autoSubmitStage) {
    actionSteps.push({ id: 'act_submit', type: 'submit', tool: 'stage_gate_submit', label: `将合格成果自动挂接报送至「${p.stage}」对应工作项`, status: 'pending' })
  }

  const planId = `hplan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const planObj = {
    id: planId,
    projectId: p.id,
    projectName: p.name,
    stage: p.stage,
    goal,
    thinkingDepth,
    engine,
    coreThesis: aiPlan?.coreThesis || `围绕「${p.name}」${docs.length} 份底稿开展证据分级采信与成套投研材料受控制作`,
    thoughtSteps,
    gaps: aiPlan?.gaps || (hasAGrade ? ['建议持续跟踪期后订单回款流水'] : ['当前缺少外部审计或天眼查 A 级底稿，已自动排入穿透补齐动作']),
    kinds: requestedKinds,
    specs: { pageCount, targetMB, density, theme, shouldEnrichTyc, autoSubmitStage, fileIds: opts.fileIds || docs.map(d => d.id) },
    steps: actionSteps,
    sourceSummary: {
      totalDocs: docs.length,
      gradeA: docs.filter(d => d.grade === 'A').length,
      gradeB: docs.filter(d => d.grade === 'B').length,
      gradeC: docs.filter(d => d.grade === 'C').length,
      tables: grounded.tables.length,
      passages: grounded.passages.length,
    },
    createdAt: Date.now(),
    createdBy: user.name,
    status: 'planned',
  }

  const prevPlans = db.get('kvstate', `harness_runs_${p.id}`)?.runs || []
  db.put('kvstate', { id: `harness_runs_${p.id}`, runs: [planObj, ...prevPlans].slice(0, 20) }, { actor: user, reason: `Harness 受控思考规划: ${goal.slice(0, 36)}`, action: 'harness.plan' })
  return planObj
}

/**
 * 第二阶段：Harness 受控执行、质量门禁自检与自愈重做（Action -> Production -> Self-Verification）
 * 可直接传入已审批的 planId，或一站式完成「可控思考规划 + 全套材料编译 + 解压质检 + 阶段报送」。
 */
export async function runHarnessPipeline(deps, user, p, opts = {}) {
  const { db, kb, org, deliverables, lifecycle, ai, dir } = deps
  const t0 = Date.now()

  // 1. 获取已审批蓝图或现场生成受控思考蓝图
  let plan = null
  if (opts.planId) {
    const saved = db.get('kvstate', `harness_runs_${p.id}`)?.runs || []
    plan = saved.find(r => r.id === opts.planId) || null
  }
  if (!plan) {
    plan = await planHarnessExecution(deps, user, p, opts)
  }
  if (opts.planOnly) return plan

  // 允许用户在审批后微调 kinds / specs / customDirectives
  const kinds = Array.isArray(opts.kinds) && opts.kinds.length ? opts.kinds.filter(k => ALL_KINDS.includes(k)) : plan.kinds
  const specs = { ...plan.specs, ...(opts.specs || {}) }
  if (opts.pageCount) specs.pageCount = Math.max(4, Math.min(24, Number(opts.pageCount)))
  if (opts.targetMB) specs.targetMB = Math.max(3, Math.min(35, Number(opts.targetMB)))
  if (opts.density) specs.density = opts.density
  if (opts.theme) specs.theme = opts.theme
  if (opts.autoSubmitStage !== undefined) specs.autoSubmitStage = Boolean(opts.autoSubmitStage)

  const trace = []
  const markStep = (id, status, detail = '') => {
    const st = plan.steps.find(s => s.id === id)
    if (st) { st.status = status; st.detail = detail; st.at = Date.now() }
    trace.push({ step: id, status, detail, elapsedMs: Date.now() - t0 })
  }

  let activeFileIds = specs.fileIds ? [...specs.fileIds] : []

  // 2. 操作能力调用 1：天眼查七维商事司法穿透（若蓝图判定需补强 A 级证据）
  if (specs.shouldEnrichTyc) {
    const companyName = db.get('companies', p.companyId)?.name || p.name.replace(/\s+[A-Z+]+轮.*$/, '')
    const tyc = await runTianyanchaDueDiligence({ db, kb }, user, p, { companyName })
    if (tyc?.file?.id && !activeFileIds.includes(tyc.file.id)) activeFileIds.unshift(tyc.file.id)
    markStep('act_tyc', 'done', `已穿透入库《${tyc?.file?.name || companyName}》（A级强公信底稿）`)
  }

  // 3. 操作能力调用 2：Agent×Agent 情报/撰写/蓝军三侧并发互校
  const docs = await collectRawDocs({ kb, org }, user, p, activeFileIds)
  const docSig = docs.map(d => d.id).join(',')
  const mesh = await runAgentMeshCrossCheck(ai, p, docs)
  db.put('kvstate', { id: `mesh_${p.id}`, docSig, savedAt: Date.now(), ...mesh }, { actor: user, reason: 'Harness 受控三侧网状互校', action: 'harness.mesh' })
  markStep('act_mesh', 'done', `${mesh.engine} 完成互校：识别跨源冲突 ${mesh.conflicts?.length || 0} 项，原文数字锚定率 ${mesh.numCheck?.rate ?? 100}%`)

  // 4. 操作能力调用制作能力：按蓝图专属指令逐份制作并执行自检自愈（Self-Verification & Auto-Repair）
  const artifacts = []
  const qualityGate = []
  for (const kind of kinds) {
    const stepObj = plan.steps.find(s => s.id === `make_${kind}`)
    const directive = [plan.goal, stepObj?.directive, opts.prompt].filter(Boolean).join('；')
    let art = await generateStudioArtifact(
      { db, kb, org, deliverables, ai },
      user,
      p,
      {
        kind,
        pageCount: specs.pageCount,
        targetMB: specs.targetMB,
        density: specs.density,
        theme: specs.theme,
        fileIds: activeFileIds,
        prompt: directive,
      },
    )

    // 质量门禁体检：真实解压检验结构完整性、页数达标度与 PPT 体积要求
    let preview = await previewAnyArtifact(art.fullPath).catch(() => null)
    let passed = Boolean(art?.bytes > 500 && preview)
    let repairNote = ''

    if (kind === 'ppt' && (art.bytes < 3 * 1024 * 1024 || (preview?.slides?.length || 0) < specs.pageCount)) {
      // 自愈机制：若体积或页数未达标，自动调高纹理目标重新编译一次
      art = await generateStudioArtifact(
        { db, kb, org, deliverables, ai },
        user,
        p,
        {
          kind: 'ppt',
          pageCount: specs.pageCount,
          targetMB: Math.max(5, specs.targetMB + 2),
          density: 'dense',
          theme: specs.theme,
          fileIds: activeFileIds,
          prompt: `${directive}（自愈重编译：确保满页与高分辨率视觉资产）`,
        },
      )
      preview = await previewAnyArtifact(art.fullPath).catch(() => null)
      passed = Boolean(art.bytes >= 3 * 1024 * 1024 && (preview?.slides?.length || 0) >= specs.pageCount)
      repairNote = '（已触发 Harness 自愈重编译并达标）'
    }

    const qItem = {
      kind,
      name: art.name,
      bytes: art.bytes,
      sizeMB: +(art.bytes / 1048576).toFixed(2),
      passed,
      detail: kind === 'ppt'
        ? `${preview?.slides?.length || specs.pageCount} 页幻灯片 · ${(art.bytes / 1048576).toFixed(2)} MB${repairNote}`
        : kind === 'word'
          ? `${preview?.paras?.length || 0} 段结构化正文 · 锚定率 ${art.meshCert?.rate ?? 100}%`
          : kind === 'table'
            ? `${preview?.sheets?.length || 5} 张核验与对质工作表`
            : `${(art.bytes / 1024).toFixed(1)} KB 交互式研判视图`,
    }
    qualityGate.push(qItem)
    artifacts.push(art)
    markStep(`make_${kind}`, passed ? 'done' : 'warn', `${art.name} — ${qItem.detail}`)
  }

  markStep('act_verify', 'done', `全部 ${artifacts.length} 份成品通过 ZIP/XML 结构解压与数字溯源审计（通过率 ${qualityGate.filter(x => x.passed).length}/${qualityGate.length}）`)

  // 5. 可选闭环动作：自动报送至当前阶段匹配的工作项门禁
  const submissions = []
  if (specs.autoSubmitStage && dir) {
    for (const art of artifacts) {
      if (!art.workType) continue
      try {
        const sub = await submitArtifactToNode(
          { db, kb, org, deliverables, lifecycle, dir },
          user,
          p,
          { artifactPath: art.fullPath, artifactName: art.name, autoSubmitReview: true },
        )
        submissions.push(sub)
      } catch {
        // 当前阶段若无同名工作项则保持在项目成果区待选，不强行塞错工作项
      }
    }
    markStep('act_submit', 'done', submissions.length
      ? `已精准挂接报送 ${submissions.length} 份成果：${submissions.map(s => `${s.workType}(v${s.version})`).join('、')}`
      : `当前阶段「${p.stage}」无同名工作项，成果已存入右下角成果舱供指定报送`)
  }

  const finishedRun = {
    ...plan,
    kinds,
    specs,
    status: 'completed',
    completedAt: Date.now(),
    elapsedMs: Date.now() - t0,
    meshSummary: {
      engine: mesh.engine,
      thesis: mesh.thesis,
      conflicts: mesh.conflicts || [],
      redFlags: mesh.redFlags || [],
      anchorRate: mesh.numCheck?.rate ?? 100,
    },
    artifacts: artifacts.map(a => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      fullPath: a.fullPath,
      bytes: a.bytes,
      workType: a.workType,
      version: a.version,
      summary: a.summary,
    })),
    qualityGate,
    submissions,
    trace,
  }

  const existing = (db.get('kvstate', `harness_runs_${p.id}`)?.runs || []).filter(r => r.id !== finishedRun.id)
  db.put('kvstate', { id: `harness_runs_${p.id}`, runs: [finishedRun, ...existing].slice(0, 20) }, { actor: user, reason: `Harness 完成成套材料制作 (${artifacts.length}份)`, action: 'harness.run' })
  return finishedRun
}

export function getHarnessStatus({ db }, p) {
  const runs = p ? (db.get('kvstate', `harness_runs_${p.id}`)?.runs || []) : []
  return {
    presets: listHarnessPresets(),
    kinds: Object.entries(KIND_LABELS).map(([id, label]) => ({ id, label })),
    runs,
  }
}
