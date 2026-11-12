// 受控制作：把“想清楚要做什么”和“动手做”分成两步，成套生成一个项目需要的材料。
// 第一步出制作方案（planHarnessExecution）：读底稿，说明底稿能回答什么、缺什么、每份材料侧重什么，存下来给人看、给人改。
// 第二步按方案执行（runHarnessPipeline）：可选的天眼查工商核查、交叉核对、逐份制作、逐份质检、把合格的成品报送到对应工作项。
// 思考深度三档：fast 不调用模型做规划；balanced 由模型出方案；deep 再加一轮交叉核对，成品里有对不上底稿的数字时让模型重写一次。
// 没有可用模型（没配置、底稿密级不允许外发、调用失败）时每一步都如实写明，成品按底稿原文摘编，不冒充模型的结论。
import { gradeDocCredibility, runAgentMeshCrossCheck, previewAnyArtifact } from './nb-agent-mesh.mjs'
import { prepareSources, checkNumbers, checkLine, sourceDigest, projectFacts } from './nb-ground.mjs'
import { askJson } from './nb-author.mjs'
import { runTianyanchaDueDiligence } from './nb-tianyancha.mjs'
import { generateStudioArtifact, gatherDocs, withStage } from './nb-studio-gen.mjs'
import { submitArtifactToNode } from './nb-flow-board.mjs'

const ALL_KINDS = ['ic_memo', 'ppt', 'word', 'table', 'mindmap', 'audio', 'video', 'flashcards', 'quiz']

const KIND_LABELS = {
  ic_memo: '投委会备忘录',
  ppt: '演示文稿',
  word: '尽调报告',
  table: '数据表',
  mindmap: '思维导图',
  audio: '对谈稿',
  video: '讲解分镜',
  flashcards: '闪卡',
  quiz: '测验',
}

const PACK_PRESETS = {
  ic_full_pack: { name: '上会材料', desc: '投委会备忘录、演示文稿、尽调报告、数据表', kinds: ['ic_memo', 'ppt', 'word', 'table'], thinkingDepth: 'deep' },
  init_pack: { name: '立项材料', desc: '演示文稿、数据表、思维导图', kinds: ['ppt', 'table', 'mindmap'], thinkingDepth: 'balanced' },
  dd_defense_pack: { name: '答辩准备', desc: '尽调报告、投委会备忘录、闪卡、测验', kinds: ['word', 'ic_memo', 'flashcards', 'quiz'], thinkingDepth: 'deep' },
}

export const DEPTHS = [
  { id: 'fast', label: '快速', desc: '不做模型规划，直接制作' },
  { id: 'balanced', label: '标准', desc: '模型先出制作方案，再制作' },
  { id: 'deep', label: '深入', desc: '出方案、交叉核对底稿口径，数字对不上时重写一次' },
]

export function listHarnessPresets() {
  return Object.entries(PACK_PRESETS).map(([id, v]) => ({ id, ...v }))
}

/** 从一句话的要求里判断要做哪几种材料；没提到具体材料时按阶段给默认组合。 */
export function inferKindsFromGoal(goal = '', stage = '') {
  const g = String(goal || '').toLowerCase()
  const picked = new Set()
  if (/全套|上会包|所有核心|整套|一套完整|全部核心/.test(g)) ['ic_memo', 'ppt', 'word', 'table'].forEach(k => picked.add(k))
  if (/全部9|九大|所有材料|全部成果/.test(g)) ALL_KINDS.forEach(k => picked.add(k))
  if (/ppt|演示|幻灯片|路演|deck|立项报告/.test(g)) picked.add('ppt')
  if (/word|docx|尽调报告|深度报告|文书/.test(g)) picked.add('word')
  if (/\bic\b|备忘录|memo|投决|投资建议/.test(g)) picked.add('ic_memo')
  if (/excel|xlsx|表格|台账|数据表|清单/.test(g)) picked.add('table')
  if (/导图|脑图|mindmap/.test(g)) picked.add('mindmap')
  if (/音频|播客|对谈|audio/.test(g)) picked.add('audio')
  if (/视频|分镜|video/.test(g)) picked.add('video')
  if (/闪卡|问答卡|flash/.test(g)) picked.add('flashcards')
  if (/测验|考题|压力测试题|quiz/.test(g)) picked.add('quiz')
  if (!picked.size) (String(stage).includes('立项') ? ['ppt', 'word', 'table'] : ['ic_memo', 'ppt', 'word', 'table']).forEach(k => picked.add(k))
  return [...picked]
}

const clean = (v, max = 500) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const runsOf = (db, p) => db.get('kvstate', `harness_runs_${p.id}`)?.runs || []
const saveRuns = (db, user, p, runs, reason, action) => db.put('kvstate', { id: `harness_runs_${p.id}`, runs: runs.slice(0, 20) }, { actor: user, reason, action })

/** 第一步：制作方案。返回的对象存进项目记录，执行时按 id 取回。 */
export async function planHarnessExecution(deps, user, p, opts = {}) {
  const { db, kb, org, ai } = deps
  p = withStage(db, p)
  const preset = PACK_PRESETS[opts.presetId] ?? null
  const userGoal = clean(opts.goal && opts.goal !== preset?.desc ? opts.goal : '', 800)
  const thinkingDepth = DEPTHS.some(d => d.id === opts.thinkingDepth) ? opts.thinkingDepth : (preset?.thinkingDepth || 'balanced')
  const asked = Array.isArray(opts.kinds) ? opts.kinds.filter(k => ALL_KINDS.includes(k)) : []
  const kinds = asked.length ? asked : (preset?.kinds || inferKindsFromGoal(userGoal, p.stage))
  const pageCount = Math.max(4, Math.min(24, Number(opts.pageCount) || 8))
  const density = ['concise', 'standard', 'dense'].includes(opts.density) ? opts.density : 'standard'
  const theme = String(opts.theme || 'mck')
  const withTianyancha = Boolean(opts.withTianyancha || /天眼查|工商核查/.test(userGoal))
  const autoSubmitStage = Boolean(opts.autoSubmitStage || /报送|提交审核|上会提交/.test(userGoal))

  const { docs, levelMax } = await gatherDocs({ kb, org }, user, p, opts.fileIds)
  if (!docs.length) throw Object.assign(new Error('所选底稿里没有读到文字，无法制作。请确认底稿已上传并解析完成。'), { status: 400 })
  const G = prepareSources(p, docs)
  const graded = docs.map((d, i) => ({ n: i + 1, id: d.id, name: d.name, ...gradeDocCredibility(d.name) }))
  const count = g => graded.filter(d => d.grade === g).length
  const todo = G.passages.filter(x => x.topics.includes('todo'))

  let ai1 = null, engine = '', note = ''
  if (thinkingDepth === 'fast') note = '快速档不做模型规划'
  else {
    const route = await ai?.route?.(levelMax).catch(e => ({ adapter: null, reason: e.message })) ?? { adapter: null, reason: '未配置模型' }
    if (!route.adapter) note = route.reason
    else {
      try {
        ai1 = await askJson(route.adapter, {
          maxTokens: 12000, timeoutMs: 240000,
          system: '你是优势资本的投资经理，要为一个项目成套准备材料。动手之前先把事情想清楚，把想法写给合伙人看，合伙人同意后才开始制作。只用给出的底稿和项目登记信息，底稿里没有的事实和数字不写；引用数字保持原样并标来源编号，如 [2]。用平实的中文，不写套话。只输出 JSON。',
          user: `项目登记信息：\n${projectFacts(p).map(([k, v]) => `${k}：${v}`).join('\n') || p.name}

底稿（共 ${docs.length} 份，括号里是按文件名推定的证据效力）：
${graded.map(s => `[${s.n}]《${s.name}》（${s.label}）`).join('\n')}

${sourceDigest(docs)}

要制作的材料：${kinds.map(k => `${k}（${KIND_LABELS[k]}）`).join('、')}${userGoal ? `\n使用者的要求：${userGoal}` : ''}

通读底稿后输出：
{
  "coreThesis": "这个项目最值得投委会讨论的问题和你目前的判断，一两句话，带来源编号",
  "thoughtSteps": [{"phase": "这一步在想什么，不超过 12 个字", "thought": "看到了什么、怎么判断，带来源编号", "decision": "因此怎么做"}],
  "artifactDirectives": {${kinds.map(k => `"${k}": "这份${KIND_LABELS[k]}应该侧重回答什么、重点用哪几份底稿"`).join(', ')}},
  "gaps": ["底稿里没有、但做判断需要的信息"]
}
thoughtSteps 写 3 到 5 步，依次覆盖：底稿能回答什么和不能回答什么；不同底稿对同一指标的说法是否一致；几份材料怎么分工、各自给谁看。`,
        })
        engine = route.label
      } catch (e) { note = `模型规划失败：${e.message}` }
    }
  }

  const steps = (Array.isArray(ai1?.thoughtSteps) ? ai1.thoughtSteps : []).map(s => ({ phase: clean(s?.phase, 40), thought: clean(s?.thought, 800), decision: clean(s?.decision, 400) })).filter(s => s.phase && s.thought).slice(0, 6)
  const thoughtSteps = steps.length ? steps : [
    { phase: '底稿盘点', thought: `读到 ${docs.length} 份底稿：A 级 ${count('A')} 份、B 级 ${count('B')} 份、C 级 ${count('C')} 份（按文件名推定）。整理出表格 ${G.tables.length} 张、条目 ${G.passages.length} 条，其中标为待核实的 ${todo.length} 条。`, decision: '全部纳入本次制作' },
    { phase: '口径核对', thought: `这一步没有调用模型（${note}）。`, decision: thinkingDepth === 'deep' ? '执行时再尝试交叉核对；仍没有可用模型就跳过，不同底稿之间的口径差异需要人工比对' : '不同底稿之间的口径差异需要人工比对' },
    { phase: '制作安排', thought: `依次制作 ${kinds.length} 份材料：${kinds.map(k => KIND_LABELS[k]).join('、')}。`, decision: `每份成品生成后把里面的数字和底稿逐个核对，对不上的列在质检结果里${autoSubmitStage ? '；数字全部对上的成品报送到对应工作项' : ''}` },
  ]
  const directives = Object.fromEntries(kinds.map(k => [k, clean(ai1?.artifactDirectives?.[k], 600)]))
  const gaps = (Array.isArray(ai1?.gaps) ? ai1.gaps.map(x => clean(x, 200)).filter(Boolean) : todo.map(x => clean(x.text, 200))).slice(0, 8)
  const coreThesis = clean(ai1?.coreThesis, 600)
  const check = engine ? checkNumbers([coreThesis, ...thoughtSteps.flatMap(s => [s.thought, s.decision]), ...Object.values(directives), ...gaps].join('\n'), G.corpus) : null

  const actionSteps = []
  if (withTianyancha) actionSteps.push({ id: 'act_tyc', type: 'tool', tool: 'tianyancha_enrich', label: '天眼查工商核查，结果存为底稿', status: 'pending' })
  if (thinkingDepth === 'deep') actionSteps.push({ id: 'act_mesh', type: 'tool', tool: 'agent_mesh_crosscheck', label: '交叉核对不同底稿的口径', status: 'pending' })
  for (const k of kinds) actionSteps.push({ id: `make_${k}`, type: 'produce', kind: k, label: `制作${KIND_LABELS[k]}`, directive: directives[k], status: 'pending' })
  actionSteps.push({ id: 'act_verify', type: 'verify', tool: 'artifact_quality_gate', label: '逐份质检：文件能打开，数字和底稿对得上', status: 'pending' })
  if (autoSubmitStage) actionSteps.push({ id: 'act_submit', type: 'submit', tool: 'stage_gate_submit', label: `把合格的成品报送到「${p.stage}」的对应工作项`, status: 'pending' })

  const plan = {
    id: `hplan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: p.id, projectName: p.name, stage: p.stage,
    goal: userGoal || preset?.desc || kinds.map(k => KIND_LABELS[k]).join('、'),
    userGoal, thinkingDepth, engine, engineNote: note, coreThesis, thoughtSteps, gaps, check, kinds,
    specs: { pageCount, density, theme, withTianyancha, autoSubmitStage, fileIds: opts.fileIds?.length ? opts.fileIds : docs.map(d => d.id) },
    steps: actionSteps,
    sourceSummary: { totalDocs: docs.length, gradeA: count('A'), gradeB: count('B'), gradeC: count('C'), tables: G.tables.length, passages: G.passages.length },
    createdAt: Date.now(), createdBy: user.name, status: 'planned',
  }
  saveRuns(db, user, p, [plan, ...runsOf(db, p)], `制作方案：${plan.goal.slice(0, 36)}`, 'harness.plan')
  return plan
}

function opened(kind, preview) {
  if (!preview) return false
  if (preview.kind === 'pptx') return preview.slides.length > 0
  if (preview.kind === 'docx') return preview.paras.length > 0
  if (preview.kind === 'xlsx') return preview.sheets.length > 0
  return String(preview.content ?? '').length > 200
}

/** 第二步：按方案执行。传 planId 用已有方案；不传就现场出一份再执行。planOnly 只出方案。 */
export async function runHarnessPipeline(deps, user, p, opts = {}) {
  const { db, kb, org, deliverables, lifecycle, ai, dir } = deps
  const t0 = Date.now()
  p = withStage(db, p)
  let plan = opts.planId ? runsOf(db, p).find(r => r.id === opts.planId) ?? null : null
  if (!plan) plan = await planHarnessExecution(deps, user, p, opts)
  if (opts.planOnly) return plan
  plan = structuredClone(plan)

  const asked = Array.isArray(opts.kinds) ? opts.kinds.filter(k => ALL_KINDS.includes(k)) : []
  const kinds = asked.length ? asked : plan.kinds
  const specs = { ...plan.specs, ...(opts.specs || {}) }
  if (opts.pageCount) specs.pageCount = Math.max(4, Math.min(24, Number(opts.pageCount)))
  if (opts.density) specs.density = opts.density
  if (opts.theme) specs.theme = opts.theme
  if (opts.autoSubmitStage !== undefined) specs.autoSubmitStage = Boolean(opts.autoSubmitStage)
  for (const k of kinds) if (!plan.steps.some(s => s.id === `make_${k}`)) plan.steps.splice(Math.max(0, plan.steps.findIndex(s => s.id === 'act_verify')), 0, { id: `make_${k}`, type: 'produce', kind: k, label: `制作${KIND_LABELS[k]}`, directive: '', status: 'pending' })
  plan.steps = plan.steps.filter(s => s.type !== 'produce' || kinds.includes(s.kind))
  if (specs.autoSubmitStage && !plan.steps.some(s => s.id === 'act_submit')) plan.steps.push({ id: 'act_submit', type: 'submit', tool: 'stage_gate_submit', label: `把合格的成品报送到「${p.stage}」的对应工作项`, status: 'pending' })

  const trace = []
  const has = id => plan.steps.some(s => s.id === id)
  const mark = (id, status, detail = '') => {
    const st = plan.steps.find(s => s.id === id)
    if (st) Object.assign(st, { status, detail, at: Date.now() })
    trace.push({ step: id, status, detail, elapsedMs: Date.now() - t0 })
  }
  let fileIds = [...(specs.fileIds ?? [])]

  if (has('act_tyc')) {
    try {
      const c = p.companyId ? db.get('companies', p.companyId) : null
      const tyc = await runTianyanchaDueDiligence({ db, kb }, user, p, { companyName: c?.name })
      if (tyc.file?.id && fileIds.length && !fileIds.includes(tyc.file.id)) fileIds.unshift(tyc.file.id)
      mark('act_tyc', 'done', `已把「${tyc.companyName}」的 ${tyc.fields} 项工商登记信息存为底稿《${tyc.file?.name}》`)
    } catch (e) { mark('act_tyc', 'skipped', e.message) }
  }

  const { docs, levelMax } = await gatherDocs({ kb, org }, user, p, fileIds)
  if (!docs.length) throw Object.assign(new Error('所选底稿里没有读到文字，无法制作。'), { status: 400 })

  let mesh = null
  if (has('act_mesh')) {
    mesh = await runAgentMeshCrossCheck(ai, p, docs, { level: levelMax })
    db.put('kvstate', { id: `mesh_${p.id}`, docSig: docs.map(d => d.id).join(','), savedAt: Date.now(), ...mesh }, { actor: user, reason: '交叉核对底稿口径', action: 'harness.mesh' })
    mark('act_mesh', mesh.engine ? 'done' : 'skipped', mesh.engine
      ? `${mesh.engine}：${mesh.conflicts.length ? `找到 ${mesh.conflicts.length} 处说法不一致（${mesh.conflicts.map(c => c.topic).join('、')}）` : '没有发现说法不一致的地方'}${mesh.numCheck?.unmatched?.length ? `；核对结论里有 ${mesh.numCheck.unmatched.length} 处数字在底稿里没找到` : ''}`
      : mesh.note)
  }
  const meshHint = mesh?.conflicts?.length
    ? `交叉核对时发现下面几处说法不一致。写到相关内容时回到底稿原文核实，把两个口径都写出来（下面只是转述，以底稿为准）：\n${mesh.conflicts.map(c => `- ${c.topic}：${c.bpClaim} ／ ${c.auditFact}`).join('\n')}`
    : ''

  const artifacts = [], qualityGate = []
  for (const kind of kinds) {
    const step = plan.steps.find(s => s.id === `make_${kind}`)
    const directive = [plan.userGoal && `本次制作的要求：${plan.userGoal}`, step?.directive && `这份材料的侧重：${step.directive}`, meshHint, clean(opts.prompt, 800)].filter(Boolean).join('\n')
    const make = extra => generateStudioArtifact({ db, kb, org, deliverables, ai }, user, p, { kind, pageCount: specs.pageCount, density: specs.density, theme: specs.theme, fileIds, prompt: [directive, extra].filter(Boolean).join('\n') })
    let art
    try { art = await make() } catch (e) {
      qualityGate.push({ kind, label: KIND_LABELS[kind], name: '', bytes: 0, sizeMB: 0, passed: false, engine: '', unmatched: [], detail: `没有生成：${e.message}` })
      mark(`make_${kind}`, 'warn', `没有生成：${e.message}`)
      continue
    }
    let unmatched = art.check?.unmatched ?? []
    let repair = ''
    const byModel = Boolean(art.engine) && art.engine !== '底稿摘编'
    if (unmatched.length && byModel && plan.thinkingDepth === 'deep') {
      const again = await make(`上一稿里下面这些数字在底稿中找不到：${unmatched.slice(0, 12).map(u => `${u.value}（出现在“${u.context}”）`).join('；')}。重写时改用底稿里的数字；确实需要自己算的，写明“测算”和算式；底稿里没有依据的直接删掉。`).catch(() => null)
      const left = again?.check?.unmatched ?? null
      if (again && left && left.length < unmatched.length && again.engine !== '底稿摘编') { art = again; repair = `第一稿有 ${unmatched.length} 处数字对不上，重写后剩 ${left.length} 处`; unmatched = left }
      else repair = `有 ${unmatched.length} 处数字对不上，重写一次后没有改善，保留第一稿`
    }
    const preview = await previewAnyArtifact(art.fullPath).catch(() => null)
    const ok = opened(kind, preview)
    const passed = ok && unmatched.length === 0
    const detail = [art.summary, repair, !ok ? '文件打不开或没有内容' : '', unmatched.length ? `待人工复核的数字：${unmatched.slice(0, 8).map(u => u.value).join('、')}` : ''].filter(Boolean).join('；')
    qualityGate.push({ kind, label: KIND_LABELS[kind], name: art.name, bytes: art.bytes, sizeMB: +(art.bytes / 1048576).toFixed(2), passed, engine: art.engine || '底稿摘编', unmatched: unmatched.map(u => u.value), detail })
    artifacts.push(art)
    mark(`make_${kind}`, passed ? 'done' : 'warn', `${art.name}：${detail}`)
  }
  const okCount = qualityGate.filter(x => x.passed).length
  mark('act_verify', okCount === qualityGate.length ? 'done' : 'warn', `${qualityGate.length} 份材料里 ${okCount} 份通过${okCount < qualityGate.length ? `，${qualityGate.length - okCount} 份需要人工复核` : ''}`)

  const submissions = []
  if (has('act_submit')) {
    const held = []
    for (const art of artifacts) {
      const q = qualityGate.find(x => x.name === art.name)
      if (!q?.passed) { held.push(`${KIND_LABELS[art.kind] ?? art.name}（质检没通过）`); continue }
      if (!art.workType) continue
      try { submissions.push(await submitArtifactToNode({ db, kb, org, deliverables, lifecycle, dir }, user, p, { artifactPath: art.fullPath, artifactName: art.name, autoSubmitReview: true })) }
      catch (e) { held.push(`${KIND_LABELS[art.kind] ?? art.name}（${e.message}）`) }
    }
    mark('act_submit', submissions.length ? 'done' : 'skipped', [submissions.length ? `已报送 ${submissions.length} 份：${submissions.map(s => `${s.workType} v${s.version}`).join('、')}` : '没有报送', held.length ? `没有报送的：${held.join('、')}` : ''].filter(Boolean).join('；'))
  }

  // 全部成品的数字核对汇总；没有出现数字时 anchorRate 为 null
  const sum = artifacts.reduce((a, x) => x.check ? { total: a.total + x.check.total, ok: a.ok + x.check.matched + x.check.derived } : a, { total: 0, ok: 0 })
  const run = {
    ...plan, kinds, specs, status: 'completed', completedAt: Date.now(), elapsedMs: Date.now() - t0,
    meshSummary: mesh ? { engine: mesh.engine, note: mesh.note, thesis: mesh.thesis, conflicts: mesh.conflicts, redFlags: mesh.redFlags } : null,
    numberSummary: { total: sum.total, ok: sum.ok, line: sum.total ? `成品里共 ${sum.total} 处数字，${sum.ok} 处与底稿一致或写明为测算` : '成品里没有出现数字' },
    anchorRate: sum.total ? Math.round(sum.ok / sum.total * 100) : null,
    artifacts: artifacts.map(a => ({ id: a.id, kind: a.kind, name: a.name, fullPath: a.fullPath, bytes: a.bytes, workType: a.workType, version: a.version, summary: a.summary, engine: a.engine || '底稿摘编', check: a.check ? { total: a.check.total, matched: a.check.matched, derived: a.check.derived, unmatched: a.check.unmatched, line: checkLine(a.check) } : null })),
    qualityGate, submissions, trace,
  }
  saveRuns(db, user, p, [run, ...runsOf(db, p).filter(r => r.id !== run.id)], `成套制作完成（${artifacts.length} 份）`, 'harness.run')
  return run
}

export function getHarnessStatus({ db }, p) {
  return {
    presets: listHarnessPresets(),
    depths: DEPTHS,
    kinds: Object.entries(KIND_LABELS).map(([id, label]) => ({ id, label })),
    runs: p ? runsOf(db, p) : [],
  }
}
