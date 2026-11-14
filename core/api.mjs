// 统一接口：GET ?asset=<file> 提供前端；GET/POST ?op=<name> 业务接口。所有权限在这里与各模块内校验。
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { cpus, loadavg } from 'node:os'
import { statfs } from 'node:fs/promises'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { FUNCTIONS, OPS, FIELD_CATEGORIES, LEVELS, AI_LEVELS, SCOPES } from './org.mjs'
import { WORK_TYPES, BUSINESS_TYPES, validateDef } from './workflow.mjs'
import { SCHEMAS } from './extract.mjs'
import { FILL_FIELDS } from './fill.mjs'
import { SSO_PRESETS } from './sso.mjs'
import { asrRuntime, AUDIO } from './meetings.mjs'
import { writeSecret, readSecrets, pushWebhook } from './notify.mjs'
import { renderXlsx, renderDocx, MIME } from './office.mjs'
import { connectMcp } from './mcp.mjs'
import { parseApiKeyInput } from './llm.mjs'
import { RESOURCES } from './wisburg.mjs'
import { findProject, findType } from './intent.mjs'
import { createMarket } from './market.mjs'
import { viewer } from './projection.mjs'
import { VOCAB } from './vocab.mjs'
import { createSessionStore, createLoginGuard, createSync, DEFAULT_SECURITY, DEFAULT_SYNC, SYNC_ROLES, SYNC_COLLECTIONS, DEVICE_SCOPES } from './cloud.mjs'
import { probeLocalModels, quickConnectApi, validateCustomBaseURL } from './nb-api.mjs'
import { computeFlowMetrics, listNotes, saveNote, deleteNote } from './nb-flow.mjs'
import { slidesFromMd, slidesToMd, transcribeAudioLocal, handlePluginSubmit } from './nb-studio.mjs'
import { listProjectArtifacts, openProjectFolderOrFile } from './nb-folder.mjs'
import { buildFollowUps, generateStudioArtifact } from './nb-studio-gen.mjs'
import { buildFlowBoardState, submitArtifactToNode } from './nb-flow-board.mjs'
import { getOsState, dispatchAgentOs, inlineCoCreateRewrite, toggleAutoTask } from './nb-qwen-os.mjs'
import { DIFY_WORKFLOW_TEMPLATES, exportDifyDslYaml, runDifyWorkflow, getEnterpriseGovState } from './nb-dify-dsl.mjs'
import { TYC_DIMENSIONS, runTianyanchaDueDiligence, tianyanchaConfigured } from './nb-tianyancha.mjs'
import { previewAnyArtifact, runAgentMeshCrossCheck } from './nb-agent-mesh.mjs'
import { planHarnessExecution, runHarnessPipeline, getHarnessStatus } from './nb-harness.mjs'

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'"
const ASSET = /^(?:views\/)?[a-z0-9-]+\.(?:html|css|js|svg)$/
const TYPE = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml' }
// 可执行文件路径：macOS / Linux 的 /…/python3、Windows 的 C:\…\python.exe 都要接受；toolknit 只允许命令名或绝对路径，不经 shell
export const PYTHON_EXE = /(^|[\\/])python3?(\.\d+)?(\.exe)?$/i
export const TOOLKNIT_CMD = /^(toolknit(\.exe)?|(\/|[A-Za-z]:[\\/])[^\0"'`$;&|<>]+[\\/]toolknit(\.exe)?)$/i
const fail = (m, status = 400) => Object.assign(new Error(m), { status })
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })

export function hashPassword(pw, salt = randomBytes(16).toString('hex')) { return { salt, hash: scryptSync(pw, salt, 32).toString('hex') } }
function checkPassword(pw, rec) {
  if (!rec) return false
  const a = Buffer.from(scryptSync(pw, rec.salt, 32).toString('hex'))
  const b = Buffer.from(rec.hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * 写请求是否来自其他站点。优先用浏览器给出的 Sec-Fetch-Site（页面无法伪造）；没有时比较 Origin 与 Host。
 * 不能用 request.url 的主机比较：DSH 把插件请求的地址改写为内部主机（http://dsh.internal/…），
 * 桌面版页面来自 dsh-app:// 协议，两者都与浏览器看到的来源不同（2.3 及以前因此在 DSH 中所有写操作被拒绝）。
 */
export function crossSite(request, url = new URL(request.url)) {
  const site = request.headers.get('sec-fetch-site')
  if (site) return !['same-origin', 'none'].includes(site)
  const origin = request.headers.get('origin')
  if (!origin) return false
  if (origin === 'null') return true
  const o = new URL(origin)
  // DSH 桌面版自己的页面协议：普通网页无法向它发请求
  if (o.protocol === 'dsh-app:') return false
  return o.host !== url.host && o.host !== request.headers.get('host')
}

export function createApi(ctx) {
  const { db, org, kb, ai, engine, deliverables, extractor, meetings, fill, sso, notify, scheduler, wisburg, mode, appDir, dir, lifecycle, projection, persona } = ctx
  const market = createMarket({ db, org, wisburg })
  const S = () => db.get('settings', 'main')
  const SEC = () => ({ ...DEFAULT_SECURITY, ...S()?.security })
  // 云端部署：会话入库（重启不掉线、闲置超时）、登录失败锁定、设备令牌与信息同步（core/cloud.mjs）
  const sessions = createSessionStore(db, () => S()?.security)
  const guard = createLoginGuard(() => S()?.security)
  const sync = createSync({ db, org, projection, settings: S })
  const sidOf = request => /(?:^|;\s*)investai_sid=([a-f0-9]{48})/.exec(request.headers.get('cookie') ?? '')?.[1]
  const clientIp = request => request.headers.get('x-investai-client') ?? ''
  // 通过 HTTPS 访问（或 HTTPS 反向代理转发）时 Cookie 只在加密连接上发送
  const secure = request => request && new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  const bearer = request => /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  // 设备令牌只能调用同步接口；须改密码的账号只能看状态、改密码、退出
  const DEVICE_OPS = { 'sync.status': null, 'sync.pull': 'sync.pull', 'sync.push': 'sync.push' }
  const MUST_CHANGE_OPS = new Set(['state', 'me.password', 'logout', 'security.policy'])
  const meta = (user, reason, action) => ({ actor: user, reason, action })

  function currentUser(request) {
    if (mode !== 'saas') return persona()
    const s = sessions.resolve(sidOf(request))
    if (!s) return null
    return db.get('users', s.userId)?.disabled ? null : db.get('users', s.userId)
  }
  const session = (user, request) => {
    const sid = sessions.create(user, { ip: clientIp(request ?? new Request('http://x')), ua: request?.headers.get('user-agent') ?? '' })
    return `investai_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SEC().sessionHours * 3600}${secure(request)}`
  }

  // ───────── 视图（按权限裁剪） ─────────
  const pub = u => u && ({ id: u.id, name: u.name, title: u.title, deptId: u.deptId, roles: u.roles })
  const fieldView = (user, p) => projection.projectFields(viewer.human(user), p)
  function projectView(user, p) {
    const wf = db.get('workflows', p.workflowId)
    const st = wf?.stages.find(s => s.id === p.stageId)
    const c = p.companyId ? db.get('companies', p.companyId) : null
    const dls = db.find('deliverables', d => d.projectId === p.id)
    return { id: p.id, name: p.name, companyId: p.companyId, company: c?.short, industry: c?.industry, businessType: p.businessType, businessName: BUSINESS_TYPES.find(b => b.id === p.businessType)?.name, workflowId: p.workflowId, workflowVersion: wf?.version,
      stageId: p.stageId, stage: st?.name, stageKind: st?.kind, stageIndex: wf?.stages.findIndex(s => s.id === p.stageId), stageCount: wf?.stages.length, statusLabel: p.statusLabel, status: p.status, progress: p.progress,
      owner: p.owner, ownerName: db.get('users', p.owner)?.name, deptId: p.deptId, members: p.members, grants: p.grants ?? [], tags: p.tags, desc: p.desc, fields: fieldView(user, p), updatedAt: p.updatedAt, createdAt: p.createdAt,
      deliverables: dls.map(d => ({ id: d.id, type: d.type, format: d.format, status: d.status, v: d.versions.length, generating: !!d.generating, checkout: !!d.checkout })),
      flow: computeFlowMetrics(db, engine, p),
      pendingApproval: !!db.one('approvals', a => a.projectId === p.id && a.status === 'pending') }
  }
  const visibleProjects = user => db.all('projects').filter(p => org.seesProject(user, p))
  const project = (user, id) => { const p = db.get('projects', id); org.assertProject(user, p); return p }
  const deliverable = (user, id) => { const d = db.get('deliverables', id); if (!d) throw fail('成果不存在', 404); project(user, d.projectId); return d }

  function settingsView(user) {
    const s = S()
    const admin = mode !== 'saas' || org.can(user, 'settings.manage') || org.can(user, 'ai.policy')
    return { org: s.org, models: { mode: s.models.mode, sensitiveLevel: s.models.sensitiveLevel, external: s.models.external, local: admin ? s.models.local : undefined }, sensitivity: s.sensitivity, materialRules: admin ? s.materialRules : undefined, aiPolicy: s.aiPolicy, automation: s.automation,
      security: org.can(user, 'org.manage') ? SEC() : { minPassword: SEC().minPassword }, sync: org.can(user, 'sync.manage') ? { ...DEFAULT_SYNC, ...s.sync, roles: SYNC_ROLES, available: SYNC_COLLECTIONS, scopes: DEVICE_SCOPES } : undefined,
      push: admin ? { channels: s.push.channels } : undefined, schedules: s.schedules, watchlist: s.watchlist, sso: admin ? s.sso : { enabled: s.sso.enabled }, toolknit: s.toolknit, market: s.market, asr: asrRuntime(s), desktop: s.desktop ?? { personaSwitch: true } }
  }

  async function state(user) {
    const ps = visibleProjects(user)
    const week = Date.now() - 7 * 864e5
    const myTasks = db.find('tasks', t => t.owner === user.id)
    return {
      rev: db.rev, mode, me: { ...pub(user), dept: db.get('depts', user.deptId)?.name, mustChange: mode === 'saas' && !!user.mustChange }, caps: org.capabilities(user),
      users: db.all('users').filter(u => !u.disabled).map(pub), depts: db.all('depts'), businessTypes: db.all('businessTypes'),
      workflows: db.all('workflows').map(w => ({ id: w.id, businessType: w.businessType, name: w.name, version: w.version, status: w.status, stages: w.stages.map(s => ({ id: s.id, name: s.name, kind: s.kind, label: s.label, gate: s.gate?.name })) })),
      projects: ps.map(p => projectView(user, p)),
      companies: db.all('companies').filter(c => ps.some(p => p.companyId === c.id) || org.can(user, 'company.view')).map(c => ({ id: c.id, name: c.name, short: c.short, industry: c.industry, region: c.region })),
      mounts: (await kb.mountsView()).map(m => ({ ...m, path: org.can(user, 'kb.mount') ? m.path : undefined })),
      model: await ai.status(), wisburg: await wisburg.status(),
      kpi: {
        active: ps.filter(p => p.status === 'active').length,
        weekFinal: db.find('deliverables', d => d.status === 'final' && d.finalAt > week && ps.some(p => p.id === d.projectId)).length,
        pending: myTasks.filter(t => !t.done).length + db.find('approvals', a => a.status === 'pending' && a.voters.includes(user.id) && !a.votes.some(v => v.userId === user.id)).length,
        review: db.find('deliverables', d => d.status === 'review' && ps.some(p => p.id === d.projectId)).length,
        kbFiles: kb.files().filter(f => kb.visible(user, f)).length,
        aiWeek: db.find('jobs', j => j.startedAt > week && j.status === 'done').length,
      },
      unread: db.find('notifications', n => n.userId === user.id && !n.read).length,
      settings: settingsView(user), workTypes: WORK_TYPES,
      storage: await statfs(dir).then(s => ({ free: s.bavail * s.bsize, total: s.blocks * s.bsize }), () => null),
    }
  }

  /** 「下一步」：当前阶段还差什么、谁来做；标出轮到当前用户的事项。 */
  function guide(user, p, r) {
    const names = list => list.slice(0, 4).join('、') + (list.length > 4 ? ` 等 ${list.length} 人` : '')
    if (p.status !== 'active') return [{ text: `项目${VOCAB.project[p.status]}${p.status === 'paused' ? '：恢复后继续推进' : ''}`, who: '', mine: false }]
    const steps = []
    for (const i of r.items.filter(x => !x.ok)) {
      const w = (p.works ?? []).find(x => x.id === i.workId) ?? (p.works ?? []).find(x => x.type === i.work && x.stageId === p.stageId)
      const d = w?.deliverableId ? db.get('deliverables', w.deliverableId) : null
      const stub = { projectId: p.id, type: i.work, status: 'draft', versions: [] }
      if (w?.status === 'rework' && d) steps.push({ text: `「${i.work}」被要求补充：撤回定稿 → 修改 → 重新提交并定稿`, who: names(lifecycle.holders(d, 'reopen')), mine: !lifecycle.check(user, d, 'reopen'), deliverableId: d.id })
      else if (!d?.versions?.length) steps.push({ text: `起草或上传「${i.work}」（必做）`, who: db.get('users', w?.assignee)?.name ?? '', mine: !lifecycle.check(user, d ?? stub, 'edit'), workId: w?.id, type: i.work })
      else if (d.status === 'draft') steps.push({ text: `提交「${i.work}」审核`, who: names(lifecycle.holders(d, 'submit')), mine: !lifecycle.check(user, d, 'submit'), deliverableId: d.id })
      else if (d.status === 'review') steps.push({ text: `审核并定稿「${i.work}」`, who: names(lifecycle.holders(d, 'finalize')), mine: !lifecycle.check(user, d, 'finalize'), deliverableId: d.id })
    }
    const pending = db.one('approvals', a => a.projectId === p.id && a.status === 'pending')
    if (pending) {
      const waiting = pending.voters.filter(v => !pending.votes.some(x => x.userId === v) && !pending.recused.includes(v))
      steps.push({ text: `「${pending.gate.name}」表决中：已表决 ${pending.votes.length}/${pending.voters.length - pending.recused.length}（${VOCAB.rule[pending.gate.rule]}）`, who: names(waiting.map(v => db.get('users', v)?.name)), mine: waiting.includes(user.id), tab: 'decide' })
    } else if (r.ok && r.stage.gate) steps.push({ text: `准入条件已满足：发起「${r.stage.gate.name}」`, who: names(db.find('users', u => !u.disabled && org.can(u, 'project.submit') && org.seesProject(u, p)).map(u => u.name)), mine: org.can(user, 'project.submit'), gate: true })
    else if (!r.stage.gate) steps.push({ text: '本阶段没有决策节点：完成工作后由负责人推进', who: '', mine: false })
    return steps
  }

  async function projectDetail(user, id) {
    const p = project(user, id)
    const wf = engine.def(p)
    const r = engine.readiness(p)
    const dls = db.find('deliverables', d => d.projectId === p.id)
    const pv = projectView(user, p)
    const chatMsgs = db.get('chats', ai.chatKey(user.id, p.id))?.messages ?? []
    const lastUserQ = [...chatMsgs].reverse().find(m => m.role === 'user')?.text ?? ''
    const lastAiAns = [...chatMsgs].reverse().find(m => m.role === 'ai')?.text ?? ''
    const lackingWorks = (r?.items ?? []).filter(i => !i.ok).map(i => i.work)
    return {
      project: pv, timeline: p.timeline ?? [],
      // 每项工作：当前用户能否编辑 / 让 AI 起草（没有成果时按「草稿」判定），前端据此启用按钮并显示原因
      works: (p.works ?? []).map(w => { const d = w.deliverableId ? db.get('deliverables', w.deliverableId) : { projectId: p.id, type: w.type, status: 'draft', versions: [] }; return { ...w, assigneeName: db.get('users', w.assignee)?.name, can: { edit: lifecycle.actions(user, d).edit, aiWrite: lifecycle.actions(user, d).aiWrite } } }),
      guide: guide(user, p, r),
      workflow: { id: wf.id, name: wf.name, version: wf.version, stages: wf.stages },
      readiness: { ok: r.ok, items: r.items, gate: r.stage.gate },
      deliverables: dls.map(d => ({ ...d, versions: d.versions.map(v => ({ ...v })), can: lifecycle.actions(user, d) })),
      approvals: db.find('approvals', a => a.projectId === p.id).sort((a, b) => b.createdAt - a.createdAt),
      meetings: db.find('meetings', m => m.projectId === p.id).map(m => ({ ...m, asr: m.asr ? { ...m.asr, segments: m.asr.segments?.length } : null })),
      extractions: db.find('extractions', x => x.projectId === p.id).sort((a, b) => b.createdAt - a.createdAt).map(x => ({ id: x.id, name: x.name, schema: x.schema, status: x.status, origin: x.origin, missing: x.missing, conflicts: x.conflicts, createdAt: x.createdAt, by: x.by })),
      fills: db.find('fills', f => f.projectId === p.id).map(({ tokenHash, ...f }) => f),
      files: kb.list(user, { companyId: p.companyId }).filter(f => !f.rel.includes('/.versions/')),
      company: p.companyId ? projection.company(viewer.human(user), db.get('companies', p.companyId)) : null,
      comments: db.get('comments', p.id)?.list ?? [],
      tasks: db.find('tasks', t => t.projectId === p.id),
      notes: listNotes(db, p.id),
      artifacts: await listProjectArtifacts(db, db.one('mounts', x => x.kind === 'workspace')?.path ?? dir, p),
      followUps: buildFollowUps(pv, lastUserQ, kb.list(user, { companyId: p.companyId }).slice(0, 3).map(f => f.name), lastAiAns, lackingWorks),
      osState: getOsState(db, p),
      history: db.history('projects', p.id, 60),
      canVote: db.find('approvals', a => a.projectId === p.id && a.status === 'pending' && a.voters.includes(user.id)).map(a => a.id),
    }
  }

  // ───────── 对话入口 ─────────
  async function chat(user, b) {
    const text = String(b.text ?? '').trim().slice(0, 4000)
    if (!text) throw fail('指令不能为空')
    const context = b.context ?? {}
    const ps = visibleProjects(user)
    const p = findProject(text, ps) ?? ps.find(x => x.id === context.projectId) ?? null
    ai.addChat(user.id, { role: 'user', text }, p?.id ?? null)
    const reply = msg => { ai.addChat(user.id, { role: 'ai', ...msg }, p?.id ?? null); return msg }
    if (/(删除|删掉).{0,8}项目|导出(全部|全量|所有)|全量导出/.test(text)) return reply({ text: `「${/删/.test(text) ? '删除项目' : '导出全量数据'}」属于敏感操作，AI 不执行；${org.can(user, /删/.test(text) ? 'project.delete' : 'export.all') ? '请在界面中操作并完成二次确认' : '⚠️ 权限不足，请联系管理员'}。`, tone: 'deny' })
    if (/(表决|投票|批准|审批通过|定稿|推进到|立项通过|过会)/.test(text) && !/(生成|起草|准备|材料|纪要|分析)/.test(text)) return reply({ text: '⚠️ AI 不能替代有权人员作出正式决策（表决、审批、定稿、推进阶段）。我可以帮你准备材料、检查准入条件、汇总意见。', tone: 'warn' })
    const type = findType(text)
    if (p && type && /(生成|起草|撰写|编写|编制|制作|写一份|做一份|准备一份|出一份|填写|更新)/.test(text)) {
      const job = await ai.generate(user, { projectId: p.id, type, prompt: text, fileIds: context.fileIds ?? [], outline: context.outline })
      return { intent: 'generate', job: ai.poll(job.id), nav: { projectId: p.id } }
    }
    const mode = /(合规|检查)/.test(text) ? 'compliance' : /(解析|解读|总结|摘要|概括|提炼)/.test(text) ? 'summary' : 'qa'
    const job = await ai.agent(user, text, { project: p, mode, fileIds: context.fileIds ?? [] })
    return { intent: 'chat', job: ai.poll(job.id) }
  }

  const POST = {
    chat, 'chat.clear': (user, b) => { if (b?.projectId) project(user, b.projectId); db.putQuiet('chats', { id: ai.chatKey(user.id, b?.projectId), messages: [] }); return { ok: true } },
    'job.cancel': (user, b) => ai.poll(ai.cancel(user, b.id).id),
    'ai.plan': (user, b) => ai.plan(user, b),
    'ai.generate': async (user, b) => ai.poll((await ai.generate(user, b)).id),
    'ai.rewrite': async (user, b) => { const d = deliverable(user, b.deliverableId); return ai.poll((await ai.generate(user, { projectId: d.projectId, deliverableId: d.id, type: d.type, section: Number(b.section), prompt: String(b.instruction ?? '') })).id) },
    'ai.prereview': async (user, b) => ai.preReview(deliverable(user, b.id), user),
    'ai.test': async user => { if (mode === 'saas') org.assert(user, 'ai.policy'); return ai.testModel() },
    'nb.api.connect': async (user, b) => { if (mode === 'saas') org.assert(user, 'ai.policy'); return quickConnectApi({ db, ai, mode }, user, b) },
    'nb.note.save': (user, b) => { const p = project(user, b.projectId); return saveNote(db, user, p.id, b) },
    'nb.note.del': (user, b) => { const p = project(user, b.projectId); return deleteNote(db, user, p.id, b.id) },
    'nb.plugin.submit': (user, b) => handlePluginSubmit({ db, ai, deliverables, engine }, user, project(user, b.projectId), b),
    'nb.slides.save': async (user, b) => {
      const p = project(user, b.projectId)
      const d = b.deliverableId ? deliverable(user, b.deliverableId) : deliverables.ensure(p.id, b.workType || '立项报告', { format: 'pptx' }, user)
      const latest = d.versions?.at(-1)
      if (latest?.richDeck && !b.confirmOverwrite) throw fail(`当前「${d.type}」v${latest.v}（${latest.engine || '成果编制'}）包含矢量图表与 cards 版式，在左上方幻灯片面板保存会覆盖为简版文本；确认覆盖请传 confirmOverwrite`, 409)
      const md = slidesToMd(b.title || d.title, b.slides ?? [])
      return deliverables.saveText(user, d.id, md, b.note || '左上方 PPT 工坊本地修改保存')
    },
    'nb.asr': (user, b) => transcribeAudioLocal({ db, kb, meetings, settings: S() }, user, b),
    'nb.studio.make': (user, b) => generateStudioArtifact({ db, kb, org, deliverables, ai }, user, project(user, b.projectId), b),
    'nb.flow.submit': (user, b) => submitArtifactToNode({ db, kb, org, deliverables, lifecycle, dir: db.one('mounts', x => x.kind === 'workspace')?.path ?? dir }, user, project(user, b.projectId), b),
    'nb.harness.plan': (user, b) => planHarnessExecution({ db, kb, org, ai }, user, project(user, b.projectId), b),
    'nb.harness.run': (user, b) => runHarnessPipeline({ db, kb, org, deliverables, lifecycle, ai, dir: db.one('mounts', x => x.kind === 'workspace')?.path ?? dir }, user, project(user, b.projectId), b),
    'nb.os.dispatch': (user, b) => dispatchAgentOs({ db, kb, org, deliverables, lifecycle, ai }, user, project(user, b.projectId), b),
    'nb.os.inline': (user, b) => inlineCoCreateRewrite({ db, kb, org, deliverables, lifecycle, ai }, user, project(user, b.projectId), b),
    'nb.os.autotask': (user, b) => toggleAutoTask(db, project(user, b.projectId), b.taskId),
    'nb.dify.run': (user, b) => runDifyWorkflow({ db, kb, org, deliverables, lifecycle, ai, dir: db.one('mounts', x => x.kind === 'workspace')?.path ?? dir }, user, project(user, b.projectId), b),
    'nb.tyc.query': (user, b) => runTianyanchaDueDiligence({ db, kb, org }, user, project(user, b.projectId), b),
    'nb.folder.open': (user, b) => {
      const p = project(user, b.projectId)
      const ws = db.one('mounts', x => x.kind === 'workspace')?.path ?? dir
      return listProjectArtifacts(db, ws, p).then(a => openProjectFolderOrFile(b.filePath || a.folderPath))
    },

    'project.create': (user, b) => projectView(user, engine.create(user, { name: b.name, companyId: b.companyId ?? createCompany(user, b), businessType: b.businessType ?? 'financial', fields: b.fields, tags: b.tags, desc: b.desc })),
    'project.update': (user, b) => {
      const p = project(user, b.id)
      org.assert(user, 'project.edit')
      const fields = { ...p.fields }
      for (const [k, v] of Object.entries(b.fields ?? {})) { if (!org.canField(user, 'project', k)) throw fail(`无权修改敏感字段 ${k}`, 403); fields[k] = String(v).slice(0, 300) }
      return projectView(user, db.put('projects', { ...p, ...(b.desc !== undefined ? { desc: String(b.desc).slice(0, 1000) } : {}), ...(b.tags ? { tags: b.tags.slice(0, 8) } : {}), fields }, meta(user, '编辑项目信息', 'update')))
    },
    'project.members': (user, b) => {
      const p = project(user, b.id)
      org.assert(user, 'project.member')
      const members = (b.members ?? p.members).filter(m => db.get('users', m.userId))
      const grants = (b.grants ?? p.grants ?? []).filter(g => db.get('users', g.userId)).map(g => ({ userId: g.userId, until: Number(g.until) || null, by: user.name }))
      return projectView(user, db.put('projects', { ...p, members, grants }, meta(user, '调整项目成员与授权', 'members')))
    },
    'project.gate': (user, b) => engine.requestGate(user, project(user, b.id)),
    'approval.vote': (user, b) => {
      const a0 = db.get('approvals', b.id)
      project(user, a0?.projectId)
      return engine.vote(user, b.id, b.decision, b.opinion, { recuse: !!b.recuse })
    },
    'project.control': (user, b) => projectView(user, engine.control(user, project(user, b.id), b.action, b.reason)),
    'project.sendback': (user, b) => projectView(user, engine.sendBack(user, project(user, b.id), b.stageId, b.reason)),
    'project.delete': (user, b) => {
      org.assert(user, 'project.delete')
      const p = project(user, b.id)
      if (b.confirm !== p.name) throw fail('确认文本与项目名称不一致')
      db.remove('projects', p.id, meta(user, '删除项目（历史保留，可回滚）', 'delete'))
      return { ok: true }
    },
    'work.update': (user, b) => {
      const p = project(user, b.projectId)
      org.assert(user, 'project.edit')
      const works = p.works.map(w => w.id === b.id ? { ...w, ...(b.assignee ? { assignee: b.assignee } : {}), ...(b.due ? { due: Number(b.due) } : {}), ...(b.status && ['todo', 'doing', 'done'].includes(b.status) && w.status !== 'done' ? { status: b.status } : {}) } : w)
      return db.put('projects', { ...p, works }, meta(user, '更新工作', 'work'))
    },
    'work.add': (user, b) => {
      const p = project(user, b.projectId)
      org.assert(user, 'project.edit')
      if (!WORK_TYPES[b.type]) throw fail('未知工作类型')
      const w = { id: `w_${randomBytes(4).toString('hex')}`, type: b.type, stageId: p.stageId, required: false, format: WORK_TYPES[b.type].format, assignee: b.assignee ?? user.id, status: 'todo', createdAt: Date.now() }
      return db.put('projects', { ...p, works: [...p.works, w] }, meta(user, `新增工作「${b.type}」`, 'work'))
    },
    'export': (user, b) => {
      if (b.scope === 'all') org.assert(user, 'export.all'); else org.assert(user, 'project.export')
      const list = b.scope === 'all' ? visibleProjects(user) : [project(user, b.id)]
      db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: b.scope === 'all' ? '导出全量数据' : '导出项目', target: list.map(p => p.name).join('、').slice(0, 200) })
      return { exportedAt: new Date().toISOString(), by: user.name, projects: list.map(p => ({ ...projectView(user, p), works: p.works, timeline: p.timeline, deliverables: db.find('deliverables', d => d.projectId === p.id).map(d => ({ type: d.type, status: d.status, versions: d.versions.map(v => ({ v: v.v, by: v.by, at: v.at, engine: v.engine, path: v.path })) })) })) }
    },

    'deliverable.ensure': (user, b) => { project(user, b.projectId); lifecycle.authorize(user, { projectId: b.projectId, type: b.type, status: 'draft', versions: [] }, 'edit'); return deliverables.ensure(b.projectId, b.type, { workId: b.workId }, user) },
    'deliverable.checkout': async (user, b) => { if (mode === 'saas' && !process.env.INVESTAI_LOCAL_OFFICE) throw fail('SaaS 模式请下载后编辑，再上传为新版本'); return deliverables.checkout(user, b.id) },
    'deliverable.checkin': (user, b) => deliverables.checkin(user, b.id, b.note),
    'deliverable.upload': (user, b) => deliverables.upload(user, b.id, String(b.name), Buffer.from(String(b.data ?? ''), 'base64'), b.note),
    'deliverable.save': (user, b) => deliverables.saveText(user, b.id, String(b.text ?? ''), b.note),
    'deliverable.submit': (user, b) => deliverables.submit(user, b.id),
    'deliverable.finalize': (user, b) => deliverables.finalize(user, b.id, b),
    'deliverable.reopen': (user, b) => deliverables.reopen(user, b.id, b.reason),
    'deliverable.reject': (user, b) => deliverables.reject(user, b.id, b.reason),
    'deliverable.restore': (user, b) => deliverables.restore(user, b.id, b.v),

    'kb.upload': async (user, b) => {
      org.assert(user, 'material.upload')
      const buf = Buffer.from(String(b.data ?? ''), 'base64')
      if (buf.length > 40 * 1024 * 1024) throw fail('单个文件不超过 40 MB', 413)
      let subdir = b.subdir
      if (b.projectId) { const p = project(user, b.projectId); const c = p.companyId && db.get('companies', p.companyId); subdir = `项目资料/${c?.short ?? p.name}` }
      const f = await kb.upload(b.mountId || (b.projectId ? 'm_nas' : 'm_up'), b.name, buf, { level: b.level !== undefined ? Number(b.level) : undefined, by: user.name, subdir })
      notify.emit('material.uploaded', { file: f, user })
      return f
    },
    'kb.fav': (user, b) => { const d = db.get('favs', user.id) ?? { id: user.id, list: [] }; const set = new Set(d.list); set.has(b.fileId) ? set.delete(b.fileId) : set.add(b.fileId); db.putQuiet('favs', { id: user.id, list: [...set] }); return { favs: [...set] } },
    'kb.level': async (user, b) => { org.assert(user, 'kb.mount'); const f = kb.file(b.id); if (!f) throw fail('文件不存在', 404); await kb.setLevel(b.id, Number(b.level)); db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: '调整资料密级', target: f.rel, detail: LEVELS[b.level] }); return { ok: true } },
    'mount.rescan': (user, b) => { org.assert(user, 'material.upload'); return kb.scan(b.id) },
    'mount.update': async (user, b) => {
      org.assert(user, 'kb.mount')
      let m = kb.mount(b.id) ?? { id: `m_${randomBytes(3).toString('hex')}`, name: String(b.name || '新挂载').slice(0, 30), kind: b.kind || 'local', path: '' }
      m = db.put('mounts', { ...m, ...(b.path ? { path: String(b.path) } : {}), ...(b.name ? { name: String(b.name).slice(0, 30) } : {}), ...(typeof b.offline === 'boolean' ? { simulateOffline: b.offline } : {}) }, meta(user, '修改挂载', 'mount'))
      if (!m.simulateOffline) await kb.scan(m.id)
      return m
    },

    'extract.run': async (user, b) => { const r = await extractor.run(user, { projectId: b.projectId, schema: b.schema, fileIds: b.fileIds }); return { ...db.get('extractions', r.id) } },
    'extract.confirm': (user, b) => extractor.confirm(user, b.id, b),
    'extract.export': async (user, b) => {
      const x = db.get('extractions', b.id)
      project(user, x?.projectId)
      const src = s => s ? `${s.path ?? ''}${s.page ? ` 第${s.page}页` : ''}` : ''
      let sheets
      if (x.schema === 'bp') sheets = [{ name: x.name, columns: [{ header: '字段', key: 'k', width: 18 }, { header: '值', key: 'v', width: 48 }, { header: '状态', key: 's', width: 10 }, { header: '来源', key: 'src', width: 50 }], rows: x.rows.map(r => ({ k: r.key, v: { value: r.value ?? '缺失', source: src(r.source), flag: r.status === 'conflict' ? 'conflict' : r.status === 'missing' ? 'missing' : undefined }, s: { found: '已提取', missing: '缺失', conflict: '冲突', hidden: '受限' }[r.status], src: src(r.source) })) }]
      else if (x.schema === 'financial') sheets = [{ name: '财务数据（亿元）', columns: [{ header: '指标', key: 'm', width: 18 }, ...x.fin.periods.map(p => ({ header: p, key: p, width: 14 }))], rows: x.fin.grid.map(g => ({ m: g.metric, ...Object.fromEntries(x.fin.periods.map(p => [p, g.cells[p] ? { value: Number(g.cells[p].yi.toFixed(4)), source: src(g.cells[p].source), flag: g.cells[p].conflict ? 'conflict' : undefined } : '—'])) })) }, { name: '衍生指标', columns: [{ header: '指标', key: 'metric' }, { header: '期间', key: 'period' }, { header: '数值', key: 'value' }], rows: x.fin.derived }]
      else sheets = [{ name: '尽调问题清单', columns: [{ header: '类别', key: 'category', width: 12 }, { header: '发现', key: 'finding', width: 60 }, { header: '严重度', key: 'severity', width: 8 }, { header: '状态', key: 'status', width: 10 }, { header: '来源', key: 'src', width: 40 }], rows: x.dd.map(r => ({ ...r, src: src(r.source) })) }]
      const buf = await renderXlsx({ title: `${db.get('projects', x.projectId).name} · ${x.name}`, sheets: sheets.map(s => ({ ...s, notes: ['标黄 = 缺失，标红 = 多源冲突；单元格批注为数据来源。所有数据须人工确认。'] })) })
      return { name: `${x.name}.xlsx`, mime: MIME['.xlsx'], data: buf.toString('base64') }
    },

    'meeting.create': (user, b) => meetings.create(user, b),
    'meeting.upload': (user, b) => meetings.upload(user, b.id, String(b.name), Buffer.from(String(b.data ?? ''), 'base64')),
    'meeting.transcribe': (user, b) => ai.poll(meetings.transcribe(user, b.id, b.fileId).id),
    'meeting.update': (user, b) => meetings.update(user, b.id, b),
    'meeting.transcript': (user, b) => meetings.transcript(user, b.id, b.text),
    'meeting.confirm': (user, b) => meetings.confirm(user, b.id),

    'fill.create': (user, b) => fill.create(user, b),
    'fill.revoke': (user, b) => fill.revoke(user, b.id),

    'task.add': (user, b) => { if (b.projectId) project(user, b.projectId); const t = String(b.title ?? '').trim().slice(0, 80); if (!t) throw fail('任务名称必填'); return db.put('tasks', { title: t, projectId: b.projectId ?? null, owner: b.owner ?? user.id, due: Number(b.due) || Date.now() + 3 * 864e5, done: false, by: user.name }, meta(user, '新建任务', 'create')) },
    'task.toggle': (user, b) => { const t = db.get('tasks', b.id); if (!t) throw fail('任务不存在', 404); if (t.owner !== user.id && !(t.projectId && org.seesProject(user, db.get('projects', t.projectId)))) throw fail('无权修改该任务', 403); return db.put('tasks', { ...t, done: !t.done }, meta(user, t.done ? '重新打开任务' : '完成任务', 'toggle')) },
    'comment.add': (user, b) => { const p = project(user, b.projectId); const text = String(b.text ?? '').trim().slice(0, 2000); if (!text) throw fail('内容不能为空'); const d = db.get('comments', p.id) ?? { id: p.id, list: [] }; return db.put('comments', { ...d, list: [...d.list, { by: user.name, byId: user.id, at: Date.now(), text }] }, meta(user, '发表讨论', 'comment')) },
    'notification.read': (user, b) => { for (const n of db.find('notifications', n => n.userId === user.id && !n.read && (!b.id || n.id === b.id))) db.putQuiet('notifications', { ...n, read: true }); return { ok: true } },
    'view.save': (user, b) => { org.assert(user, 'views.manage'); const old = b.id ? db.get('views', b.id) : null; return db.put('views', { ...(old ?? {}), id: b.id, scope: b.scope === 'company' ? 'company' : 'industry', target: String(b.target).slice(0, 40), stance: ['看多', '中性', '看空'].includes(b.stance) ? b.stance : '中性', thesis: String(b.thesis ?? '').slice(0, 1000), points: (b.points ?? []).slice(0, 10), by: user.name, version: (old?.version ?? 0) + 1 }, meta(user, '维护机构观点', 'view')) },
    'view.delete': (user, b) => { org.assert(user, 'views.manage'); db.remove('views', b.id, meta(user, '删除观点', 'delete')); return { ok: true } },

    'settings.update': async (user, b) => {
      const s = S()
      const sec = String(b.section)
      const perm = { desktop: 'org.manage', models: 'ai.policy', aiPolicy: 'ai.policy', sensitivity: 'settings.manage', materialRules: 'settings.manage', automation: 'settings.manage', push: 'integration.manage', schedules: 'settings.manage', watchlist: 'settings.manage', sso: 'integration.manage', toolknit: 'integration.manage', org: 'settings.manage', asr: 'settings.manage', market: 'integration.manage', security: 'org.manage', sync: 'sync.manage' }[sec]
      if (!perm) throw fail('未知设置项')
      org.assert(user, perm)
      let value = b.value
      if (sec === 'models' && value.local?.baseURL && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(value.local.baseURL)) throw fail('本地模型地址只允许本机回环地址（如 http://127.0.0.1:11434/v1）')
      if (sec === 'models' && value.external?.customBaseURL !== undefined) {
        value = { ...value, external: { ...value.external, customBaseURL: validateCustomBaseURL(value.external.customBaseURL) } }
      }
      if (sec === 'toolknit') {
        if (value.enabled && !value.licenseAck) throw fail('启用前请确认已取得 toolknit 的商业使用授权（PolyForm Noncommercial 许可）')
        // 只允许启动 toolknit 本身（命令名或以 /toolknit 结尾的绝对路径），不经 shell
        if (value.command && !TOOLKNIT_CMD.test(value.command)) throw fail('命令只能是 toolknit 或其绝对路径')
        value = { ...s.toolknit, ...value, allowTools: (value.allowTools ?? s.toolknit?.allowTools ?? []).map(String).slice(0, 40) }
      }
      if (sec === 'asr' && value.python && !PYTHON_EXE.test(value.python)) throw fail('Python 路径应指向 python 可执行文件')
      if (sec === 'security') {
        const n = (k, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(value[k] ?? SEC()[k]))))
        value = { idleMinutes: n('idleMinutes', 5, 1440), sessionHours: n('sessionHours', 1, 720), maxFailures: n('maxFailures', 3, 20), lockMinutes: n('lockMinutes', 1, 1440), minPassword: n('minPassword', 8, 64), forceChangeGenerated: value.forceChangeGenerated ?? SEC().forceChangeGenerated }
      }
      if (sec === 'sync') {
        if (value.role && !SYNC_ROLES[value.role]) throw fail('未知的同步角色')
        if (value.serverUrl && !/^https:\/\/[^\s/]+|^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/.test(value.serverUrl)) throw fail('云端服务器地址须为 https://（本机测试可用 http://127.0.0.1）')
        value = { ...DEFAULT_SYNC, ...s.sync, ...value, collections: (value.collections ?? s.sync?.collections ?? SYNC_COLLECTIONS).filter(c => SYNC_COLLECTIONS.includes(c)), intervalMinutes: Math.min(1440, Math.max(5, Number(value.intervalMinutes ?? s.sync?.intervalMinutes ?? 15))), conflict: 'server-wins' }
      }
      if (sec === 'push') value = { channels: (value.channels ?? []).map(c => ({ id: c.id ?? randomBytes(4).toString('hex'), name: String(c.name).slice(0, 30), type: c.type, enabled: !!c.enabled, kinds: c.kinds ?? [] })) }
      const nextSec = sec === 'models'
        ? { ...s.models, ...value, external: value.external ? { ...s.models?.external, ...value.external } : s.models?.external, local: value.local ? { ...s.models?.local, ...value.local } : s.models?.local }
        : value
      db.put('settings', { ...s, [sec]: nextSec }, meta(user, `修改设置：${sec}`, 'settings'))
      if (sec === 'models') ai.resetHealth()
      return settingsView(user)
    },
    'secret.set': async (user, b) => {
      const allowed = { wisburgApiKey: 'integration.manage', deepseekApiKey: 'ai.policy', customApiKey: 'ai.policy', 'sso.clientSecret': 'integration.manage', 'sync.deviceToken': 'sync.manage' }
      const key = String(b.key)
      const perm = allowed[key] ?? (/^push\.[a-z0-9]+\.(url|secret)$/.test(key) ? 'integration.manage' : null)
      if (!perm) throw fail('不允许的密钥项')
      org.assert(user, perm)
      const rawVal = String(b.value ?? '').trim()
      let cleanVal = rawVal
      if (['deepseekApiKey', 'customApiKey', 'wisburgApiKey'].includes(key) && rawVal) {
        const parsed = parseApiKeyInput(rawVal)
        if (!parsed) throw fail('API Key 格式不正确：请只粘贴纯英文数字密钥（如 sk-...），勿混入中文说明或网址')
        cleanVal = parsed
      }
      if (key === 'wisburgApiKey') await wisburg.setKey(cleanVal)
      else {
        await writeSecret(key, cleanVal)
        if (key === 'deepseekApiKey') {
          const customURL = String(S().models?.external?.customBaseURL ?? '').trim()
          if (!customURL || /deepseek\.com/i.test(customURL)) await writeSecret('customApiKey', cleanVal)
        }
      }
      // 管理员保存云端 API Key 且当前尚未配置本机离线模型时，若密级阈值仍停留在默认 2（机密），自动放宽至 4（允许处理项目底稿），避免“已连上模型却静默走离线摘编”
      if ((key === 'deepseekApiKey' || key === 'customApiKey') && cleanVal) {
        const s = S()
        if (s.models?.mode !== 'local' && !s.models?.local?.model && (s.models?.sensitiveLevel ?? 2) === 2) {
          db.put('settings', { ...s, models: { ...s.models, sensitiveLevel: 4 } }, meta(user, '配置外部模型密钥后允许处理项目底稿', 'settings'))
        }
      }
      // 换了 Key 后立即生效：清掉旧 Key 的失败记录（否则 5 分钟内仍显示「调用失败」并走离线引擎）
      if (key === 'deepseekApiKey' || key === 'customApiKey') ai.resetHealth()
      db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: '更新密钥', target: key, detail: '内容不记录' })
      return { ok: true }
    },
    'push.test': async (user, b) => { org.assert(user, 'integration.manage'); const ch = S().push.channels.find(c => c.id === b.id); if (!ch) throw fail('通道不存在', 404); return pushWebhook(ch, { title: 'InvestAI 推送测试', text: `来自 ${user.name} 的测试消息（${new Date().toLocaleString('zh-CN')}）` }, ctx.fetchImpl) },
    'schedule.run': (user, b) => { org.assert(user, 'settings.manage'); return scheduler.run(b.id, true) },
    'workflow.save': (user, b) => {
      org.assert(user, 'workflow.config')
      const def = validateDef(structuredClone(b.def))
      const existing = db.get('workflows', def.id)
      if (existing?.status === 'published') throw fail('已发布的流程版本不能修改；请「复制为新版本」后编辑', 409)
      return db.put('workflows', { ...def, status: 'draft' }, meta(user, `保存流程草稿 ${def.name}`, 'workflow'))
    },
    'workflow.clone': (user, b) => {
      org.assert(user, 'workflow.config')
      const src = db.get('workflows', b.id)
      if (!src) throw fail('流程不存在', 404)
      const bt = b.businessType ?? src.businessType
      const btDoc = db.get('businessTypes', bt)
      if (!btDoc) throw fail('业务类型不存在', 404)
      const version = Math.max(0, ...db.find('workflows', w => w.businessType === bt).map(w => w.version)) + 1
      const name = bt === src.businessType ? src.name : `${btDoc.name}流程`
      return db.put('workflows', { ...structuredClone(src), id: `${bt}@v${version}`, businessType: bt, name, version, status: 'draft', rev: undefined, createdAt: undefined, publishedBy: undefined, publishedAt: undefined }, meta(user, bt === src.businessType ? `复制为 v${version}` : `以「${src.name}」为基础新建「${btDoc.name}」流程`, 'workflow'))
    },
    'workflow.publish': (user, b) => {
      org.assert(user, 'workflow.config')
      const w = db.get('workflows', b.id)
      validateDef(w)
      return db.put('workflows', { ...w, status: 'published', publishedBy: user.name, publishedAt: Date.now() }, meta(user, `发布流程 v${w.version}（在途项目不受影响）`, 'publish'))
    },
    'businessType.save': (user, b) => { org.assert(user, 'workflow.config'); return db.put('businessTypes', { id: String(b.id).replace(/[^a-z0-9_]/gi, '').slice(0, 20) || `bt_${randomBytes(3).toString('hex')}`, name: String(b.name).slice(0, 30) }, meta(user, '维护业务类型', 'bt')) },
    'role.save': (user, b) => {
      org.assert(user, 'org.manage')
      const r = db.get('roles', b.id) ?? { id: String(b.id).replace(/[^a-z0-9_]/gi, '').slice(0, 20) }
      const functions = (b.functions ?? r.functions ?? []).filter(f => FUNCTIONS[f])
      const ops = (b.ops ?? r.ops ?? []).filter(o => OPS[o])
      if (!SCOPES[b.scope ?? r.scope]) throw fail('数据范围无效')
      return db.put('roles', { ...r, name: String(b.name ?? r.name).slice(0, 30), functions, ops, scope: b.scope ?? r.scope, clearance: Math.min(3, Math.max(0, Number(b.clearance ?? r.clearance))), categories: (b.categories ?? r.categories ?? []).filter(c => FIELD_CATEGORIES[c]), ai: Math.min(3, Math.max(0, Number(b.ai ?? r.ai))) }, meta(user, `调整岗位权限「${b.name ?? r.name}」`, 'role'))
    },
    'user.save': (user, b) => {
      org.assert(user, 'org.manage')
      const u = db.get('users', b.id) ?? { id: `u_${randomBytes(4).toString('hex')}` }
      const roles = (b.roles ?? u.roles ?? []).filter(r => db.get('roles', r))
      if (u.id === user.id && !roles.some(r => db.get('roles', r).functions.includes('org.manage'))) throw fail('不能移除自己的人员管理权限')
      const username = String(b.username ?? u.username ?? '').trim().slice(0, 30)
      if (!username) throw fail('账号必填')
      if (db.one('users', x => x.username === username && x.id !== u.id)) throw fail(`账号「${username}」已被使用`, 409)
      const next = { ...u, name: String(b.name ?? u.name).slice(0, 30), username, email: b.email ?? u.email, title: String(b.title ?? u.title ?? '').slice(0, 30), deptId: b.deptId ?? u.deptId, roles, disabled: !!b.disabled }
      if (b.password && mode === 'saas') {
        if (String(b.password).length < SEC().minPassword) throw fail(`密码至少 ${SEC().minPassword} 位`)
        next.pw = hashPassword(String(b.password))
        // 管理员设置的密码：对方首次登录须改成自己的密码（可在「云端与安全」关闭）
        next.mustChange = u.id !== user.id && SEC().forceChangeGenerated
      }
      if (b.disabled || b.password) sessions.revokeUser(u.id)
      const { pw, ...safe } = db.put('users', next, meta(user, `维护人员「${next.name}」${b.disabled ? '（停用）' : ''}`, 'user'))
      return safe
    },
    // 本人修改密码（多人登录模式）：校验原密码，至少 8 位，退出该账号的其他会话
    'me.password': (user, b, request) => {
      if (mode !== 'saas') throw fail('本机模式没有登录密码', 409)
      const u = db.get('users', user.id)
      if (!checkPassword(String(b.old ?? ''), u.pw)) throw fail('原密码不正确', 403)
      const pw = String(b.password ?? '')
      if (pw.length < SEC().minPassword) throw fail(`新密码至少 ${SEC().minPassword} 位`)
      if (pw === String(b.old)) throw fail('新密码不能与原密码相同')
      db.put('users', { ...u, pw: hashPassword(pw), mustChange: false }, meta(user, '修改本人登录密码', 'user'))
      sessions.revokeUser(u.id, sidOf(request))
      return { ok: true }
    },
    // 云端与安全：在线会话、设备令牌、同步配置
    'security.revoke': (user, b) => {
      org.assert(user, 'org.manage')
      if (b.userId) sessions.revokeUser(String(b.userId)); else sessions.revokeId(String(b.id))
      db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: '强制退出', target: b.userId ? db.get('users', b.userId)?.name ?? b.userId : '会话' })
      return { ok: true }
    },
    'device.issue': (user, b) => sync.issue(user, b),
    'device.revoke': (user, b) => sync.revoke(user, b.id),
    'sync.push': () => { throw fail('推送同步为预留接口，尚未启用：当前版本只支持从云端服务器拉取（sync.pull）', 501) },
    'sync.test': async (user, b) => sync.testRemote(user, { serverUrl: b.serverUrl, token: (await readSecrets())['sync.deviceToken'] }),
    'dept.save': (user, b) => { org.assert(user, 'org.manage'); return db.put('depts', { id: b.id ?? `d_${randomBytes(3).toString('hex')}`, name: String(b.name).slice(0, 30), parentId: b.parentId ?? null }, meta(user, '维护部门', 'dept')) },
    'history.rollback': (user, b) => {
      org.assert(user, 'history.rollback')
      if (!['projects', 'companies', 'workflows', 'views', 'tasks', 'settings', 'roles', 'meetings', 'deliverables'].includes(b.coll)) throw fail('该类数据不支持回滚')
      // 项目按快照内容判断数据范围，因此已删除的项目也能恢复
      if (b.coll === 'projects') { const snap = db.get('projects', b.id) ?? db.snapshot('projects', b.id, Number(b.rev)); if (!snap) throw fail('历史版本不存在', 404); org.assertProject(user, snap) }
      return db.rollback(b.coll, b.id, Number(b.rev), meta(user, b.reason ?? '', 'rollback'))
    },
    'toolknit.test': async user => {
      org.assert(user, 'integration.manage')
      const t = S().toolknit
      if (!t.enabled || !t.licenseAck) throw fail('toolknit 连接器未启用（需确认授权后启用）', 409)
      const c = await connectMcp(t.command || 'toolknit', ['mcp', 'serve'])
      try { return { server: c.server, tools: c.tools.map(x => ({ name: x.name, description: String(x.description ?? '').slice(0, 120) })) } } finally { c.close() }
    },
    'wisburg.save': async (user, b) => {
      org.assert(user, 'material.upload')
      const x = await wisburg.detail(String(b.resource), String(b.id))
      const name = `${String(x.datetime ?? '').slice(0, 10)}-${String(x.title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.md`
      const f = await kb.upload('m_up', name, Buffer.from(`# ${x.title}\n\n> 来源：${x.source} · ${String(x.datetime ?? '').slice(0, 10)}\n\n${x.text}\n`), { level: 0, by: user.name, subdir: '智堡/手动收藏' })
      return f
    },
    'market.import': (user, b) => market.importCsv(user, Buffer.from(String(b.data ?? ''), 'base64').toString('utf8'), String(b.source ?? 'CSV 导入').slice(0, 40)),
    persona: (user, b) => {
      if (mode === 'saas') throw fail('SaaS 模式请使用账号登录切换身份', 403)
      if (S().desktop?.personaSwitch === false && !org.can(user, 'org.manage')) throw fail('管理员已锁定本机身份；如需切换请联系管理员', 403)
      if (!db.get('users', b.userId)) throw fail('人员不存在', 404)
      db.put('kvstate', { id: 'persona', userId: b.userId }, meta(user, `切换演示身份为 ${db.get('users', b.userId).name}`, 'persona'))
      return { ok: true }
    },
    logout: (user, b, request) => { sessions.revoke(sidOf(request)); return json({ ok: true }, 200, { 'set-cookie': `investai_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure(request)}` }) },
  }

  function createCompany(user, b) {
    if (!b.companyName) return null
    org.assert(user, 'company.edit')
    const existing = db.one('companies', c => c.name === b.companyName || c.short === b.companyName)
    if (existing) return existing.id
    return db.put('companies', { name: String(b.companyName).slice(0, 60), short: String(b.companyShort || b.companyName).slice(0, 20), industry: String(b.industry ?? '未分类').slice(0, 30), region: String(b.region ?? '').slice(0, 30), fields: { 企业名称: { value: b.companyName, by: user.name, status: 'confirmed' } } }, meta(user, '新建公司', 'create')).id
  }

  const GET = {
    rev: () => ({ rev: db.rev }),
    state: user => state(user),
    'security.policy': () => ({ minPassword: SEC().minPassword }),
    'security.sessions': user => { org.assert(user, 'org.manage'); return sessions.list().map(x => ({ ...x, userName: db.get('users', x.userId)?.name ?? x.userId })) },
    devices: user => sync.list(user),
    'sync.status': user => sync.status(user),
    'sync.pull': (user, q) => sync.pull(user, { since: q.get('since'), limit: q.get('limit') }),
    project: (user, q) => projectDetail(user, q.get('id')),
    deliverable: (user, q) => deliverable(user, q.get('id')),
    'version.text': async (user, q) => { const d = deliverable(user, q.get('id')); return { text: org.redact(user, await deliverables.versionText(d, q.get('v'))) } },
    'chat.history': (user, q) => {
      const pid = q.get('projectId') || null
      if (pid) project(user, pid)
      return (db.get('chats', ai.chatKey(user.id, pid))?.messages ?? []).slice(-80).map(m => m.jobId ? { ...m, job: (() => { try { return ai.poll(m.jobId) } catch { return null } })() } : m)
    },
    job: (user, q) => { const j = ai.poll(q.get('id')); if (j.userId !== user.id) { if (!j.projectId) throw fail('无权查看他人的对话', 403); project(user, j.projectId) } return j },
    files: (user, q) => kb.list(user, { mountId: q.get('mount') || undefined, q: q.get('q') || undefined, companyId: q.get('company') || undefined }).filter(f => !f.rel.includes('/.versions/')).map(f => ({ ...f, mount: kb.mount(f.mountId)?.name, company: kb.companyFor(f)?.short })),
    file: async (user, q) => { const r = await kb.read(q.get('id'), user); return { ...r, text: org.redact(user, r.text), level: LEVELS[r.file.level ?? 1] } },
    search: async (user, q) => {
      const term = (q.get('q') ?? '').trim()
      if (!term) return { projects: [], files: [], companies: [] }
      return {
        projects: visibleProjects(user).filter(p => [p.name, ...(p.tags ?? [])].some(x => String(x).includes(term))).slice(0, 8).map(p => ({ id: p.id, name: p.name, stage: projectView(user, p).stage })),
        files: (await kb.search(term, { user, limit: 8 })).map(r => ({ id: r.file.id, name: r.file.name, mount: kb.mount(r.file.mountId)?.name, snippet: org.redact(user, r.snippet) })),
        companies: db.all('companies').filter(c => [c.name, c.short, c.industry].some(x => String(x).includes(term))).slice(0, 6).map(c => ({ id: c.id, name: c.name })),
      }
    },
    /** 工作台「轮到你」：所有可见进行中项目里，下一步需要当前用户处理的事项。 */
    mynext: user => visibleProjects(user).filter(p => p.status === 'active').flatMap(p => guide(user, p, engine.readiness(p)).filter(g => g.mine).map(g => ({ ...g, projectId: p.id, project: p.name }))),
    tasks: user => db.find('tasks', t => t.owner === user.id || (t.projectId && org.seesProject(user, db.get('projects', t.projectId)))).sort((a, b) => a.due - b.due),
    notifications: user => db.find('notifications', n => n.userId === user.id).sort((a, b) => b.at - a.at).slice(0, 80),
    approvals: user => db.find('approvals', a => a.status === 'pending' && a.voters.includes(user.id)).map(a => ({ ...a, project: db.get('projects', a.projectId)?.name })),
    company: (user, q) => { org.assert(user, 'company.view'); const c = db.get('companies', q.get('id')); if (!c) throw fail('公司不存在', 404); return { ...projection.company(viewer.human(user), c), metrics: db.find('metrics', m => m.companyId === c.id), projects: visibleProjects(user).filter(p => p.companyId === c.id).map(p => projectView(user, p)) } },
    metrics: user => { org.assert(user, 'company.view'); return db.all('metrics') },
    extraction: (user, q) => { const x = db.get('extractions', q.get('id')); project(user, x?.projectId); return { ...x, markdown: org.redact(user, extractor.toMarkdown(x)) } },
    meeting: (user, q) => meetings.get(user, q.get('id')),
    meetings: user => db.find('meetings', m => org.seesProject(user, db.get('projects', m.projectId))).sort((a, b) => b.at - a.at).map(m => ({ ...m, asr: m.asr ? { ...m.asr, segments: m.asr.segments?.length } : null })),
    extractions: user => db.find('extractions', x => org.seesProject(user, db.get('projects', x.projectId))).sort((a, b) => b.createdAt - a.createdAt).map(x => ({ id: x.id, projectId: x.projectId, name: x.name, schema: x.schema, status: x.status, origin: x.origin, missing: x.missing, conflicts: x.conflicts, createdAt: x.createdAt, by: x.by, engine: x.engine })),
    views: () => db.all('views'),
    history: (user, q) => { org.assert(user, 'audit.read'); return db.history(q.get('coll'), q.get('id')) },
    snapshot: (user, q) => {
      org.assert(user, 'audit.read')
      const coll = q.get('coll')
      if (!['projects', 'companies', 'workflows', 'views', 'tasks', 'settings', 'roles', 'meetings', 'deliverables', 'users', 'approvals'].includes(coll)) throw fail('该类数据不提供快照', 403)
      const snap = db.snapshot(coll, q.get('id'), Number(q.get('rev')))
      if (coll === 'projects' && snap) org.assertProject(user, snap)
      return projection.snapshot(viewer.human(user), coll, snap)
    },
    audit: user => { org.assert(user, 'audit.read'); return { changes: db.recent(120), events: db.all('audit').sort((a, b) => b.at - a.at).slice(0, 60) } },
    workflows: user => db.all('workflows'),
    roles: user => ({ roles: db.all('roles'), functions: FUNCTIONS, ops: OPS, categories: FIELD_CATEGORIES, levels: LEVELS, aiLevels: AI_LEVELS, scopes: SCOPES }),
    users: user => { org.assert(user, 'org.manage'); return db.all('users').map(({ pw, ...u }) => u) },
    meta: () => ({ vocab: VOCAB, roles: db.all('roles').map(r => ({ id: r.id, name: r.name })), workTypes: WORK_TYPES, businessTypes: BUSINESS_TYPES, schemas: Object.fromEntries(Object.entries(SCHEMAS).map(([k, v]) => [k, { name: v.name, desc: v.desc }])), fillFields: FILL_FIELDS, ssoPresets: SSO_PRESETS, audio: AUDIO, wisburg: Object.fromEntries(Object.entries(RESOURCES).map(([k, v]) => [k, v.label])) }),
    logs: user => { org.assert(user, 'settings.manage'); return { sched: db.all('schedlog').sort((a, b) => b.at - a.at).slice(0, 40), push: db.all('pushlog').sort((a, b) => b.at - a.at).slice(0, 40), last: Object.fromEntries((S().schedules ?? []).map(s => [s.id, scheduler.last(s.id)])) } },
    secrets: async user => { org.assert(user, 'integration.manage'); return Object.fromEntries(Object.keys(await readSecrets()).map(k => [k, true])) },
    models: user => { if (mode === 'saas') org.assert(user, 'ai.policy'); return ai.cloud.models() },
    'nb.local.probe': (user, q) => probeLocalModels(q.get('url') || ''),
    'nb.notes': (user, q) => listNotes(db, project(user, q.get('projectId')).id),
    'nb.flow.board': (user, q) => buildFlowBoardState({ db, org, engine, lifecycle, dir }, user, project(user, q.get('projectId'))),
    'nb.os.state': (user, q) => getOsState(db, project(user, q.get('projectId'))),
    'nb.harness.status': (user, q) => getHarnessStatus({ db }, q.get('projectId') ? project(user, q.get('projectId')) : null),
    'nb.tyc.meta': async () => ({ dimensions: TYC_DIMENSIONS, configured: await tianyanchaConfigured() }),
    'nb.artifact.preview': async (user, q) => {
      const p = project(user, q.get('projectId'))
      // 只预览本项目登记过的成品：按登记记录里的路径读，不读请求里给的任意路径
      const fp = String(q.get('fp') || '')
      const art = (db.get('kvstate', `artifacts_${p.id}`)?.list ?? []).find(a => a.fullPath === fp || a.name === q.get('name'))
      if (!art) throw fail('只能预览本项目文件夹里的成品', 403)
      const parsed = await previewAnyArtifact(art.fullPath)
      return { ...parsed, artifact: { name: art.name, kind: art.kind, summary: art.summary, engine: art.engine, engineNote: art.engineNote, check: art.check ?? null, workType: art.workType ?? null } }
    },
    'nb.arch.status': async (user, q) => {
      const pid = q.get('projectId')
      const p = pid ? project(user, pid) : visibleProjects(user)[0]
      const mStat = await ai.status().catch(e => ({ ok: false, note: e.message }))
      const s = db.get('settings', 'main')?.models ?? {}
      const gov = getEnterpriseGovState(db, user, org)
      const mesh = p ? db.get('kvstate', `mesh_${p.id}`) ?? null : null
      const runs = p ? db.get('kvstate', `harness_runs_${p.id}`)?.runs ?? [] : []
      const lastRun = runs.find(r => r.status === 'completed') ?? null
      const arts = p ? db.get('kvstate', `artifacts_${p.id}`)?.list ?? [] : []
      const files = p ? kb.list(user, { companyId: p.companyId }).filter(f => f.mountId !== 'm_ws' && !f.rel.includes('/.versions/') && !f.rel.includes('/Studio成品/')) : []
      const mounts = db.all('mounts')
      const recentChanges = db.recent(12)
      const LV = ['公开', '内部', '机密', '绝密']
      // 每一层只报能查到的实际状态
      return {
        layers: [
          { layer: '界面', tech: ({ desktop: '桌面版', saas: '网页版（多人登录）', dsh: 'DSH 插件' })[mode] ?? mode, desc: `当前登录：${user.name}（${user.title ?? ''}）`, ok: true },
          { layer: '底稿与文件', tech: `${mounts.length} 个存储位置`, desc: p ? `「${p.name}」有 ${files.length} 份底稿、${arts.length} 份成品` : '还没有项目', ok: mounts.length > 0 },
          { layer: '成果编制', tech: '底稿整理、模型撰稿、数字核对', desc: lastRun ? `最近一次成套制作：${new Date(lastRun.completedAt).toLocaleString('zh-CN')}，${lastRun.qualityGate?.filter(x => x.passed).length ?? 0}/${lastRun.qualityGate?.length ?? 0} 份通过质检` : '这个项目还没有做过成套制作', ok: true },
          { layer: '流程与留痕', tech: '阶段门禁、版本、变更记录', desc: recentChanges.length ? `最近一条变更：${recentChanges[0]?.reason ?? recentChanges[0]?.action ?? ''}` : '还没有变更记录', ok: true },
          { layer: '模型', tech: mStat.ok ? mStat.label : '未连接', desc: mStat.ok ? `${({ local: '只用本机模型', hybrid: '混合：按密级决定', external: '外部模型' })[s.mode] ?? s.mode ?? ''}；${LV[s.sensitiveLevel ?? 2] ?? '机密'}及以上的底稿只在本机处理` : (mStat.note || '没有可用模型，成品按底稿原文摘编'), ok: !!mStat.ok },
        ],
        modelStatus: mStat,
        quota: gov.quota,
        caps: org.capabilities(user),
        mesh,
        lastRun: lastRun ? { id: lastRun.id, at: lastRun.completedAt, goal: lastRun.goal, engine: lastRun.engine, anchorRate: lastRun.anchorRate, qualityGate: lastRun.qualityGate } : null,
        recentChanges,
      }
    },
    'nb.dify.templates': (user, q) => {
      const p = q.get('projectId') ? project(user, q.get('projectId')) : null
      const gov = getEnterpriseGovState(db, user, org)
      return { ...gov, sampleYaml: exportDifyDslYaml(q.get('tplId') || gov.templates[0]?.id, p || {}) }
    },
    'nb.slides': async (user, q) => {
      const d = deliverable(user, q.get('id'))
      const latest = d.versions?.at(-1)
      const text = org.redact(user, await deliverables.versionText(d, q.get('v')))
      return { id: d.id, type: d.type, title: d.title, v: d.versions.length, checkout: d.checkout ?? null, richDeck: !!latest?.richDeck, lastEngine: latest?.engine ?? '', slides: slidesFromMd(text, d.title) }
    },
    'wisburg.list': (user, q) => { org.assert(user, 'research.view'); return wisburg.list(q.get('resource') || 'reports', { query: q.get('q') || undefined, after: q.get('after') || undefined, first: q.get('first') || 15, startTime: q.get('days') ? new Date(Date.now() - Number(q.get('days')) * 864e5).toISOString() : undefined }) },
    'wisburg.detail': (user, q) => { org.assert(user, 'research.view'); return wisburg.detail(q.get('resource'), q.get('id')) },
    metrics2: () => { const m = process.memoryUsage(); return { rss: m.rss, load: loadavg()[0], cpus: cpus().length, running: [...ai.live.values()].filter(j => j.status === 'running').length } },
    quotes: user => { org.assert(user, 'research.view'); return market.quotes() },
    announcements: (user, q) => market.announcements(user, q.get('company')),
    eval: async user => { org.assert(user, 'ai.policy'); return readFile(join(dir, 'eval-latest.json'), 'utf8').then(JSON.parse, () => null) },
  }

  /** 原始文件下载（Office 文件、录音回放）。权限同读取。 */
  async function raw(user, q) {
    const { file, buffer } = await kb.raw(q.get('id'), user)
    db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: '下载资料', target: file.rel, detail: LEVELS[file.level ?? 1] })
    return new Response(buffer, { headers: { 'content-type': MIME[file.ext] ?? 'application/octet-stream', 'content-disposition': `${q.get('inline') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' } })
  }

  async function asset(name, embedded) {
    if (!ASSET.test(name)) return new Response('not found', { status: 404 })
    const path = normalize(join(appDir, name))
    if (!path.startsWith(appDir)) return new Response('not found', { status: 404 })
    let body = await readFile(path, 'utf8').catch(() => null)
    if (body === null) return new Response('not found', { status: 404 })
    if (name === 'index.html') body = body.replace('data-mode=""', `data-mode="${mode}"${embedded ? ' data-embedded="1"' : ''}`)
    return new Response(body, { headers: { 'content-type': `${TYPE[name.split('.').pop()]}; charset=utf-8`, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', ...(name.endsWith('.html') ? { 'content-security-policy': CSP } : {}) } })
  }

  const PUBLIC = {
    'fill.public.get': (b, q) => fill.publicGet(q.get('token')),
    'fill.public.submit': b => fill.publicSubmit(b.token, b),
  }

  async function handle(request) {
    try {
      const url = new URL(request.url)
      const q = url.searchParams
      if (q.has('asset')) return asset(q.get('asset'), q.get('embedded') === '1')
      const op = q.get('op') ?? ''
      if (request.method === 'POST') {
        // 所有模式都校验：同源 + JSON（跨站「简单请求」无法带 application/json，必须先经预检）
        if (crossSite(request, url)) return json({ error: '跨站请求被拒绝' }, 403)
        if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return json({ error: '请求格式必须为 JSON' }, 415)
      }
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
      if (PUBLIC[op]) {
        if (mode === 'dsh') throw fail('外部填报需部署 SaaS 服务端后对外提供', 409)
        return json(await PUBLIC[op](body, q))
      }
      if (op === 'login' && mode === 'saas') {
        const name = String(body.username ?? '')
        const ip = clientIp(request)
        guard.check(name, ip)
        const u = db.one('users', x => x.username === name && !x.disabled)
        if (!u || !checkPassword(String(body.password ?? ''), u.pw)) {
          const left = guard.failed(name, ip)
          db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: name.slice(0, 30), action: '登录失败', target: ip || '未知地址' })
          await new Promise(r => setTimeout(r, 400))
          throw fail(left ? `账号或密码错误（再错 ${left} 次将暂时锁定）` : `账号或密码错误，已锁定 ${SEC().lockMinutes} 分钟`, left ? 401 : 429)
        }
        guard.passed(name, ip)
        db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: u.name, action: '登录', target: ip ? `密码登录（${ip}）` : '密码登录' })
        return json({ ok: true, mustChange: !!u.mustChange }, 200, { 'set-cookie': session(u, request) })
      }
      // 设备令牌（同步客户端）：只能调用同步接口，数据按签发给的那个人的权限过滤
      const token = mode === 'saas' && bearer(request)
      if (token) {
        const auth = sync.authenticate(token)
        if (!auth) return json({ error: '设备令牌无效、已过期或已吊销' }, 401)
        if (!(op in DEVICE_OPS)) return json({ error: '设备令牌只能调用同步接口' }, 403)
        if (DEVICE_OPS[op] && !auth.device.scopes.includes(DEVICE_OPS[op])) return json({ error: `该设备令牌没有「${DEVICE_SCOPES[DEVICE_OPS[op]]}」权限` }, 403)
        const fn = request.method === 'POST' ? POST[op] : GET[op]
        if (!fn) return json({ error: `未知接口 ${op}` }, 404)
        return json(await fn(auth.user, request.method === 'POST' ? body : q, request))
      }
      const user = currentUser(request)
      if (!user) return json({ error: '请先登录', login: true, sso: !!S().sso?.enabled }, 401)
      if (mode === 'saas' && user.mustChange && !MUST_CHANGE_OPS.has(op)) return json({ error: '请先修改初始密码', mustChange: true }, 403)
      if (op === 'file.raw') return await raw(user, q)
      const fn = request.method === 'POST' ? POST[op] : GET[op]
      if (!fn) return json({ error: `未知接口 ${op}` }, 404)
      const result = await fn(user, request.method === 'POST' ? body : q, request)
      return result instanceof Response ? result : json(result)
    } catch (e) {
      const status = e.status ?? 500
      if (status >= 500 && status !== 501) console.error('[investai]', e)  // 501：预留接口，不是故障
      return json({ error: e.message || '服务异常', action: e.action }, status)
    }
  }

  // SSO 回调由 server.mjs 调用
  handle.ssoSession = (user, request) => session(user, request)
  return handle
}
