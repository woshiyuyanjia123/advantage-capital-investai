// DeepSeek 智能体：按用户权限与 AI 参与级别调用工具完成工作。
//  辅助建议(1)：只读工具；起草待确认(2)：+ 保存草稿；授权执行(3)：+ 新建任务、资料分类
//  永不开放：表决、定稿、推进节点、删除、导出（需求 三：AI 不能替代有权人员作出正式决策）
//  外部模型路由时：机密及以上资料不可读、敏感字段脱敏（需求 三：未经授权不得发送到外部模型）
import { WORK_TYPES } from './workflow.mjs'
import { RESOURCES } from './wisburg.mjs'
import { createProjection, viewer } from './projection.mjs'
import { VOCAB } from './vocab.mjs'
import { planHarnessExecution, runHarnessPipeline } from './nb-harness.mjs'

import { connectMcp } from './mcp.mjs'
export const AGENT_SYSTEM = `你是优势资本（Advantage Capital）智能投研工作台的受控编排助手（Agentic Harness），可以调用操作工具与成果制作引擎。
工作方式：
1. 先用工具获取事实（项目、流程准入、知识库、外部研究），严禁凭记忆编造公司数据。
2. 引用资料时在句末标注来源编号 [n]，编号由读取工具返回。
3. 当用户要求制作完整材料（如 PPT、Word 尽调报告、数据表格、九章 IC 备忘录或全套上会材料包）时：优先调用 harness_plan 输出可控思考蓝图，或直接调用 harness_produce 受控完成「底稿穿透 -> Agent×Agent 互校 -> 编译二进制成品 -> 解压质检」并落盘至右下角成果舱。
4. 用户仅要求起草纯文本草稿时可调用 save_draft 保存完整 Markdown。
5. 你不能表决、定稿、推进项目阶段、删除或导出；遇到这类请求，说明需要有权人员在界面中操作。
6. 工具返回「无权」或「外部模型不可读取」时如实告诉用户，不要尝试绕过。回答使用简体中文。`

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const str = description => ({ type: 'string', description })

export function agentTools({ db, kb, org, wisburg, ai, route }, user, job, aiLevel) {
  // 观看者：外部模型路由时按「外部」投影（敏感字段全部隐藏、机密及以上资料不可见），否则按用户本人权限
  const proj = ai?.projection ?? createProjection({ db, org })
  const v = route?.route === 'external' ? viewer.external(user) : viewer.human(user)
  const LV = l => VOCAB.level[l ?? 1]
  const levelOk = f => org.aiLevel(user, { level: f?.level ?? 1 }) >= 1
  const cite = (key, entry) => {
    let s = job.sources.find(x => x.key === key)
    if (!s) { s = { n: job.sources.length + 1, key, ...entry }; job.sources.push(s) }
    return s.n
  }
  const visibleProjects = () => db.all('projects').filter(p => org.seesProject(user, p))
  const pv = p => {
    const wf = db.get('workflows', p.workflowId)
    return { id: p.id, name: p.name, businessType: wf?.name, stage: wf?.stages.find(s => s.id === p.stageId)?.name, status: p.statusLabel, progress: p.progress, owner: db.get('users', p.owner)?.name,
      fields: Object.fromEntries(Object.entries(proj.projectFields(v, p)).map(([k, x]) => [k, x?.hidden ? `（${x.hidden}：${v.external ? '外部模型不可见' : '无权查看'}）` : x])) }
  }
  const research = () => org.assert(user, 'research.view')
  const tools = [
    { name: 'list_projects', level: 1, label: '查看项目', description: '列出你有权查看的项目：名称、业务类型、阶段、状态、进度、负责人。', parameters: obj({}), run: () => visibleProjects().map(pv) },
    { name: 'get_project', level: 1, label: '读取项目', description: '读取项目详情：当前阶段工作与成果状态、关联资料文件 ID、最近动态。', parameters: obj({ projectId: str('项目 ID') }, ['projectId']),
      run: ({ projectId }) => {
        const p = db.get('projects', projectId)
        org.assertProject(user, p)
        const works = (p.works ?? []).filter(w => w.stageId === p.stageId).map(w => ({ work: w.type, required: w.required, status: w.status, deliverable: w.deliverableId ? db.get('deliverables', w.deliverableId)?.status : null }))
        return { ...pv(p), desc: p.desc, works, files: kb.list(user, { projectId: p.id }).map(f => ({ fileId: f.id, name: f.name, level: LV(f.level), readable: proj.file(v, f) && levelOk(f) })), timeline: (p.timeline ?? []).slice(-5) }
      } },
    { name: 'check_readiness', level: 1, label: '检查准入', description: '检查项目当前阶段进入下一环节的准入条件（必做成果是否已定稿）与决策节点信息。', parameters: obj({ projectId: str('项目 ID') }, ['projectId']),
      run: ({ projectId }) => { const p = db.get('projects', projectId); org.assertProject(user, p); const r = ai.engine.readiness(p); return { stage: r.stage.name, gate: r.stage.gate?.name, approvers: r.stage.gate?.roles, ready: r.ok, items: r.items } } },
    { name: 'search_knowledge', level: 1, label: '检索知识库', description: '检索你有权访问的知识库资料，返回文件 ID、片段与密级。', parameters: obj({ query: str('检索词') }, ['query']),
      run: async ({ query }) => (await kb.search(String(query), { user, limit: 6 })).map(r => proj.file(v, r.file) && levelOk(r.file)
        ? { fileId: r.file.id, name: r.file.name, level: r.file.level ?? 1, levelName: LV(r.file.level), snippet: proj.text(v, r.snippet) }
        : { fileId: r.file.id, name: r.file.name, level: r.file.level ?? 1, levelName: LV(r.file.level), snippet: `（${LV(r.file.level)}资料：外部模型不可见，内容未提供）` }) },
    { name: 'read_file', level: 1, label: '读取资料', description: '读取资料全文（最多 8000 字），返回来源编号 n。', parameters: obj({ fileId: str('文件 ID') }, ['fileId']),
      run: async ({ fileId }) => {
        const f = kb.file(String(fileId))
        if (!proj.file(v, f)) throw new Error(`该资料为${LV(f?.level)}，当前为外部模型，按策略不可读取；请配置本地模型后处理`)
        if (!levelOk(f)) throw new Error(`按机构策略，${LV(f?.level)}资料不允许 AI 读取`)
        const r = await kb.read(String(fileId), user)
        const text = proj.text(v, r.text.slice(0, 8000))
        const n = cite(`kb:${fileId}`, { path: r.path, fileId, text })
        job.reads.push({ path: r.path, fileId, role: '资料' })
        return { n, path: r.path, offline: r.offline, text }
      } },
    { name: 'wisburg_search', level: 1, label: '检索外部研究', description: `检索智堡外部研究（真实数据）。resource：${Object.entries(RESOURCES).map(([k, v]) => `${k}=${v.label}`).join('，')}。`,
      parameters: obj({ resource: { type: 'string', enum: Object.keys(RESOURCES) }, query: str('关键词，可选'), days: { type: 'integer', description: '最近多少天，可选' } }, ['resource']),
      run: async ({ resource = 'reports', query, days }) => { research(); return (await wisburg.list(resource, { query, first: 8, startTime: days ? new Date(Date.now() - days * 864e5).toISOString() : undefined })).items.map(x => ({ resource, id: x.id, title: x.title, datetime: x.datetime, preview: x.preview || x.full?.slice(0, 160) })) } },
    { name: 'wisburg_read', level: 1, label: '读取外部研究', description: '读取一条智堡内容详情，返回来源编号 n。', parameters: obj({ resource: { type: 'string', enum: Object.keys(RESOURCES) }, id: str('内容 ID') }, ['resource', 'id']),
      run: async ({ resource, id }) => {
        research()
        const x = await wisburg.detail(resource, id)
        const n = cite(`wb:${resource}:${id}`, { path: `外部研究 · ${x.source} · ${x.title}`, wisburg: { resource, id, title: x.title, datetime: x.datetime }, text: x.text })
        job.reads.push({ path: `${x.source} · ${x.title}`, wisburg: { resource, id }, role: '外部研究' })
        return { n, title: x.title, datetime: x.datetime, source: x.source, text: x.text.slice(0, 8000) }
      } },
    { name: 'list_views', level: 1, label: '查看机构观点', description: '读取机构对行业/公司的观点（立场、逻辑）。', parameters: obj({ target: str('行业或公司，可选') }),
      run: ({ target }) => db.all('views').filter(v => !target || v.target.includes(target) || target.includes(v.target)).map(v => ({ target: v.target, stance: v.stance, thesis: v.thesis, points: v.points })) },
    { name: 'save_draft', level: 2, label: '保存草稿', description: `把完整 Markdown 保存为项目成果的新版本（草稿，需人工审核定稿）。deliverableType：${Object.keys(WORK_TYPES).join('、')}。`,
      parameters: obj({ projectId: str('项目 ID'), deliverableType: { type: 'string', enum: Object.keys(WORK_TYPES) }, markdown: str('完整正文') }, ['projectId', 'deliverableType', 'markdown']),
      run: async ({ projectId, deliverableType, markdown }) => { const r = await ai.saveVersion(user, projectId, deliverableType, String(markdown), job); job.saved = r; return { saved: r.path, version: r.version, status: '草稿（待审核）' } } },
    { name: 'add_task', level: 3, label: '新建任务', description: '新建待办（补充资料、预约访谈、提醒负责人）。', parameters: obj({ title: str('任务名称'), projectId: str('项目 ID，可选'), dueInDays: { type: 'integer' }, owner: str('负责人姓名，可选') }, ['title']),
      run: ({ title, projectId, dueInDays = 3, owner }) => {
        if (projectId) org.assertProject(user, db.get('projects', projectId))
        const o = owner ? db.one('users', u => u.name === owner) : null
        const t = db.put('tasks', { title: String(title).slice(0, 80), projectId: projectId ?? null, owner: o?.id ?? user.id, due: Date.now() + dueInDays * 864e5, done: false, by: 'AI' }, { actor: { id: 'ai', name: `AI（代 ${user.name}）` }, reason: '智能体新建任务', action: 'create' })
        return { created: t.title, owner: db.get('users', t.owner)?.name }
      } },
    { name: 'harness_plan', level: 1, label: 'Harness 可控思考规划', description: '成套制作的第一步：读底稿，输出制作方案（底稿能回答什么、缺什么、每份材料侧重什么），不生成文件。',
      parameters: obj({
        projectId: str('项目 ID'),
        goal: str('制作目标与分析侧重'),
        thinkingDepth: { type: 'string', enum: ['fast', 'balanced', 'deep'] },
        kinds: { type: 'array', items: { type: 'string', enum: ['ic_memo', 'ppt', 'word', 'table', 'mindmap', 'audio', 'video', 'flashcards', 'quiz'] } },
        pageCount: { type: 'integer' },
      }, ['projectId', 'goal']),
      run: async args => {
        const p = db.get('projects', String(args.projectId))
        org.assertProject(user, p)
        return planHarnessExecution({ db, kb, org, ai }, user, p, args)
      } },
    { name: 'harness_produce', level: 2, label: 'Harness 受控制作完整材料', description: '成套制作的第二步：按方案逐份生成演示文稿、尽调报告、投委会备忘录、数据表等文件并存进项目文件夹，返回每份的数字核对结果。',
      parameters: obj({
        projectId: str('项目 ID'),
        planId: str('可选，harness_plan 生成的蓝图 ID'),
        goal: str('制作目标与定制指令'),
        thinkingDepth: { type: 'string', enum: ['fast', 'balanced', 'deep'] },
        kinds: { type: 'array', items: { type: 'string', enum: ['ic_memo', 'ppt', 'word', 'table', 'mindmap', 'audio', 'video', 'flashcards', 'quiz'] } },
        pageCount: { type: 'integer' },
        withTianyancha: { type: 'boolean' },
        autoSubmitStage: { type: 'boolean' },
      }, ['projectId']),
      run: async args => {
        const p = db.get('projects', String(args.projectId))
        org.assertProject(user, p)
        const ws = db.one('mounts', x => x.kind === 'workspace')
        const res = await runHarnessPipeline(
          { db, kb, org, deliverables: ai.deliverables, lifecycle: ai.lifecycle, ai, dir: ws?.path },
          user, p, args,
        )
        job.saved = { path: res.artifacts.map(x => x.name).join('、'), version: res.artifacts[0]?.version || 1 }
        return {
          status: res.status,
          engine: res.engine,
          coreThesis: res.coreThesis,
          artifacts: res.artifacts.map(a => ({ kind: a.kind, name: a.name, sizeMB: +(a.bytes / 1048576).toFixed(2), summary: a.summary })),
          qualityGate: res.qualityGate,
          submissions: res.submissions,
        }
      } },
  ]
  return tools.filter(t => t.level <= aiLevel)
}

export async function runAgent(ctx, { adapter, user, job, text, project, context = '', aiLevel = 1, fileIds = [] }) {
  const tools = agentTools(ctx, user, job, aiLevel)
  // 可选连接器：toolknit（MCP）。仅在管理员确认授权并启用、且当前 AI 参与级别为「授权执行」时加载。
  const tk = ctx.db.get('settings', 'main')?.toolknit
  let mcp = null
  if (tk?.enabled && tk.licenseAck && aiLevel >= 3) {
    try {
      mcp = await connectMcp(tk.command || 'toolknit', ['mcp', 'serve'], { timeoutMs: 30000 })
      // 只加载管理员在「系统配置 → 集成」中逐个勾选允许的工具（toolknit 工具可访问本机文件，不受本系统权限控制）
      const allow = new Set(tk.allowTools ?? [])
      for (const t of mcp.tools.filter(x => allow.has(x.name)).slice(0, 40)) tools.push({ name: `toolknit_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60), level: 3, label: `toolknit · ${t.name}`, description: `[外部连接器 toolknit] ${String(t.description ?? '').slice(0, 300)}`, parameters: t.inputSchema ?? obj({}), run: args => mcp.call(t.name, args) })
    } catch (e) { job.steps.push({ tool: 'toolknit', label: 'toolknit 连接器', ok: false, summary: `未能连接：${e.message}`, at: Date.now() }) }
  }
  try { return await loop(ctx, { adapter, user, job, text, project, context, aiLevel, tools, fileIds }) } finally { mcp?.close() }
}

async function loop(ctx, { adapter, user, job, text, project, context, aiLevel, tools, fileIds = [] }) {
  const byName = Object.fromEntries(tools.map(t => [t.name, t]))
  const picked = (fileIds ?? []).map(id => ctx.kb.file(id)).filter(f => f && ctx.kb.visible(user, f))
  const hint = `\n\n[界面上下文] AI 参与级别：${['关闭', '辅助建议', '起草待确认', '授权执行'][aiLevel]}；模型路由：${ctx.route?.reason ?? ''}${project ? `；选中项目：${project.name}（id=${project.id}）` : ''}${picked.length ? `；用户勾选的底稿（请优先用 read_file 读取）：${picked.map(f => `《${f.name}》(fileId=${f.id})`).join('、')}` : ''}`
  const messages = [{ role: 'user', text: `${context ? `【最近的对话（供理解指代，不是本轮指令）】\n${context}\n\n【本轮问题】\n` : ''}${text}${hint}` }]
  for (let step = 0; step < 10; step++) {
    if (job.abort.signal.aborted) return
    job.phase = 'generating'
    let live = ''
    // 额度要同时容纳思维链和 save_draft 里的完整正文（6000 时长稿件会被截断成不完整的工具参数）
    const r = await adapter.turn({ system: AGENT_SYSTEM, messages, tools, signal: job.abort.signal, maxTokens: 32000, reasoning: 'high', onText: t => { live += t; job.text = live } })
    messages.push({ role: 'assistant', text: r.text, reasoning: r.reasoning, toolCalls: r.toolCalls, replay: r.replay })
    if (!r.toolCalls.length) { job.text = r.text; return }
    for (const call of r.toolCalls) {
      const tool = byName[call.name]
      const row = { tool: call.name, label: tool?.label ?? call.name, args: call.arguments.slice(0, 200), ok: true, at: Date.now() }
      job.steps.push(row)
      ctx.ai.record(job)
      let result
      try {
        if (!tool) throw new Error(`工具 ${call.name} 不可用（可能超出你的 AI 参与级别）`)
        result = await tool.run(JSON.parse(call.arguments || '{}'))
        row.summary = Array.isArray(result) ? `${result.length} 条结果` : result?.title ?? result?.saved ?? result?.created ?? result?.path ?? result?.stage ?? '完成'
      } catch (e) { row.ok = false; row.summary = e.message; result = { error: e.message } }
      messages.push({ role: 'tool', toolCallId: call.id, text: JSON.stringify(result).slice(0, 12000) })
    }
  }
  job.text += '\n\n> 已达到 10 步工具调用上限，任务停止。'
}
