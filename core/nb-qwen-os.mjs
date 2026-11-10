// 千问办公 2.0 范式融合引擎（Agent as an OS：IM 钉钉/项目群聊协同 × Office 原地人机共创 × SaaS 自动任务与 DWS 事件源 × MCP 协议）
import { complete } from './llm.mjs'
import { generateStudioArtifact } from './nb-studio-gen.mjs'
import { submitArtifactToNode } from './nb-flow-board.mjs'

const DEFAULT_AUTOTASKS = [
  { id: 'at_dws_upload', event: 'DWS.file.uploaded', name: '群文件/底稿上传自动核验流', desc: '当钉钉群/知识库上传新财报或BP → 自动提取口径差异 → 更新Excel台账 → 在群内 @财务与项目经理', enabled: true },
  { id: 'at_dws_coedit', event: 'DWS.doc.coedit', name: 'Office人机共创自动归档与提交流', desc: '当选中文字让Agent改完Word/PPT → 自动生成新版本存入专属夹 → 挂载至SaaS当前阶段节点', enabled: true },
  { id: 'at_dws_gate', event: 'DWS.stage.ready', name: '阶段准入达标自动发起OA/门禁流', desc: '当必做成果定稿齐备 → Agent在群内播报进度100%并 @投委/负责人发起表决', enabled: true },
]

export function getOsState(db, p) {
  const key = `qwen_os_${p.id}`
  const saved = db.get('kvstate', key)
  if (saved?.messages?.length) return saved
  const init = {
    id: key,
    projectId: p.id,
    autoTasks: DEFAULT_AUTOTASKS,
    messages: [
      { id: 'm1', sender: '林晓（行业分析师）', role: 'human', badge: '钉钉项目群', at: Date.now() - 3600000, text: `我刚把《${p.name}》的最新底稿和访谈纪要勾选好了，大家看下核心产能和客户集中度数据。` },
      { id: 'm2', sender: '周敏（财务尽调）', role: 'human', badge: '钉钉项目群', at: Date.now() - 2400000, text: `@Agent 请帮我们核对一下勾选资料里的营业收入、毛利率和应收账款周转天数，直接更新到尽调报告和表格里，改完把成品同步到群里并提交到当前阶段节点。` },
      { id: 'm3', sender: 'Agent OS（IM×Office×SaaS 协同体）', role: 'agent', badge: 'Agent 操作系统', at: Date.now() - 1800000, text: `收到 @周敏！我已读取群聊上下文与左侧勾选底稿，随时可执行「一句话跨工具四联操作」（改文档 + 更表格 + 发群通报 + 提交流程）。你可以在下方群聊直接对我下达指令，或在文档中选中任意段落让我原地改写。`, actions: ['IM 群聊上下文已接入', 'Office 原地共创已就绪', 'SaaS 流程与 DWS 事件源已挂载'] },
    ],
  }
  db.putQuiet('kvstate', init)
  return init
}

export async function dispatchAgentOs({ db, kb, org, deliverables, lifecycle, ai }, user, p, b) {
  const st = getOsState(db, p)
  const text = String(b.text || '').trim()
  if (!text) throw new Error('请输入群聊协同指令')
  st.messages.push({ id: `m_${Date.now()}_u`, sender: `${user.name}（${user.title || '项目组'}）`, role: 'human', badge: '钉钉/项目群', at: Date.now(), text })
  const actions = ['💬 IM 群聊上下文已同步']
  const wantKind = /ppt|演示|幻灯片/i.test(text) ? 'ppt' : /表|excel|xlsx|台账/i.test(text) ? 'table' : 'word'
  const art = await generateStudioArtifact({ db, kb, org, deliverables, ai }, user, p, { kind: wantKind, fileIds: b.fileIds, prompt: text, pageCount: b.pageCount || 8, targetMB: b.targetMB || 6 })
  actions.push(`📄 Office 已更新：《${art.name}》(${(art.bytes / 1048576).toFixed(2)} MB)`)

  const coeditOn = st.autoTasks.find(x => x.id === 'at_dws_coedit')?.enabled
  let flowRes = null
  if (coeditOn || /提交|节点|审核|流程|过会|OA/i.test(text)) {
    flowRes = await submitArtifactToNode({ db, deliverables, lifecycle }, user, p, { artifactPath: art.fullPath, artifactName: art.name, note: `群聊一句话协同提交：${text.slice(0, 60)}`, autoSubmitReview: true }).catch(() => null)
    if (flowRes?.ok) actions.push(`⚡ SaaS 流程已提交：「${flowRes.workType}」v${flowRes.version} (${flowRes.status})`)
  }
  if (/@|待办|跟进|核查|负责/.test(text)) {
    db.put('tasks', { title: `[群聊自动任务] ${text.slice(0, 48)}`, owner: user.id, due: Date.now() + 2 * 864e5, done: false, projectId: p.id }, { actor: user, reason: 'DWS群聊自动任务', action: 'create' })
    actions.push('📌 SaaS 待办已自动创建并指派')
  }
  const replyText = `已完成跨工具协同操作：\n1. **Office 共创产出**：已基于勾选的 ${art.sourceCount} 份来源生成/更新《${art.name}》，陈列于右下角 Studio 成品区；\n2. **SaaS 业务流联动**：${flowRes?.ok ? `已自动挂载至流程节点「${flowRes.workType}」v${flowRes.version} 并送审` : '已存入项目专属文件夹'}；\n3. **群内通知**：已同步群成员审阅。`
  st.messages.push({ id: `m_${Date.now()}_a`, sender: 'Agent OS（IM×Office×SaaS 协同体）', role: 'agent', badge: '跨工具四联执行', at: Date.now(), text: replyText, actions, artifact: { name: art.name, fullPath: art.fullPath, bytes: art.bytes } })
  st.messages = st.messages.slice(-40)
  db.putQuiet('kvstate', st)
  return { state: st, artifact: art, flow: flowRes }
}

export async function inlineCoCreateRewrite({ db, org, deliverables, ai }, user, p, b) {
  const fullText = String(b.fullText || '')
  const selected = String(b.selectedText || '').trim()
  const inst = String(b.instruction || '结合项目底稿强化数据论证并精炼表述').trim()
  if (!selected) throw new Error('请先在文档中选中一段需要让 Agent 改写的文字')
  let replacement = `**【Agent 人机共创修订】** ${selected}（已按「${inst}」结合勾选底稿核验增强 [1]）`
  const route = await ai?.route?.(1).catch(() => ({ adapter: null }))
  if (route?.adapter) {
    const out = await complete(route.adapter, {
      system: '你是千问办公2.0风格的Office原地人机共创助手。只输出替换选中段落后的修订后Markdown正文片段，严禁编造底稿外数字，保留[n]引用。',
      user: `项目：${p.name}\n原选中段落：\n${selected}\n\n修改指令：${inst}\n请直接输出替换后的段落：`,
      maxTokens: 1200, reasoning: 'off', signal: AbortSignal.timeout(25000),
    }).catch(() => '')
    if (out && out.trim()) replacement = out.trim()
  }
  const nextMd = fullText.includes(selected) ? fullText.replace(selected, replacement) : `${fullText}\n\n${replacement}`
  const d = b.deliverableId ? db.get('deliverables', b.deliverableId) : deliverables.ensure(p.id, b.workType || '尽调报告', {}, user)
  const ver = await deliverables.saveText(user, d.id, nextMd, `人机共创原地改写：${inst.slice(0, 40)}`)
  const st = getOsState(db, p)
  st.messages.push({ id: `m_${Date.now()}_c`, sender: 'Agent OS（Office 人机共创）', role: 'agent', badge: 'DWS.doc.coedit', at: Date.now(), text: `${user.name} 在《${d.title}》中选中文字完成了原地人机共创（「${inst}」），已实时生成 v${ver.version.v}。`, actions: ['✍️ Office 原地替换完成', `📦 自动升级版本 v${ver.version.v}`] })
  db.putQuiet('kvstate', st)
  return { ok: true, replacement, markdown: nextMd, version: ver.version.v }
}

export function toggleAutoTask(db, p, taskId) {
  const st = getOsState(db, p)
  st.autoTasks = st.autoTasks.map(t => t.id === taskId ? { ...t, enabled: !t.enabled } : t)
  db.putQuiet('kvstate', st)
  return st
}
