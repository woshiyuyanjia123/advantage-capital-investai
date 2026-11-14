// 企业级多源底稿速采、带材料快速立项、OA 个人待办聚合 / 一键催办 / 项目交接简报、企业开箱就绪度与人员批量导入
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { randomBytes } from 'node:crypto'
import { saveNote } from './nb-flow.mjs'

const fail = (m, status = 400) => Object.assign(new Error(m), { status })

// ───────── 公网地址校验（防御内网探测与本地回环 SSRF） ─────────
function isPrivateIp(ip) {
  const v = isIP(ip)
  if (!v) return true
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || a >= 224
  }
  const low = ip.toLowerCase()
  if (low === '::1' || low === '::' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80:')) return true
  if (low.startsWith('::ffff:')) return isPrivateIp(low.slice(7))
  return false
}

export async function assertPublicHttpUrl(rawUrl, lookupFn = lookup) {
  let u
  try { u = new URL(String(rawUrl ?? '').trim()) } catch { throw fail('请输入完整的 http:// 或 https:// 网页链接') }
  if (!['http:', 'https:'].includes(u.protocol)) throw fail('仅支持抓取 http 或 https 公开网页')
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw fail('不允许抓取本机或内网私有地址', 403)
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw fail('不允许抓取内网或保留 IP 地址', 403)
    return u
  }
  const addrs = await lookupFn(host, { all: true }).catch(() => [])
  if (!addrs.length) throw fail(`无法解析域名 ${host}，请检查网络连接或链接拼写`, 502)
  if (addrs.some(a => isPrivateIp(a.address))) throw fail('目标域名指向内网或保留地址，已拦截抓取', 403)
  return u
}

export function htmlToCleanMarkdown(html, fallbackTitle = '网页采集底稿') {
  const raw = String(html ?? '')
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw) ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(raw)
  const decode = s => String(s ?? '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  const title = decode(titleMatch?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallbackTitle
  const body = decode(
    raw
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|iframe|canvas|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '\n')
      .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lv, t) => `\n\n${'#'.repeat(Number(lv) + 1)} ${t.replace(/<[^>]+>/g, '').trim()}\n\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<[^>]+>/g, '').trim()}`)
      .replace(/<(tr)[^>]*>/gi, '\n')
      .replace(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `${t.replace(/<[^>]+>/g, '').trim()} | `)
      .replace(/<(p|div|section|article|br|blockquote)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 60000)
  return { title, body }
}

function projectSubdir(db, p) {
  const c = p.companyId ? db.get('companies', p.companyId) : null
  return `项目资料/${c?.short ?? p.name}`
}

function cleanFileStem(s, fallback = '速记底稿') {
  return String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, '_').slice(0, 56) || fallback
}

// ───────── 1. 粘贴文本 / 沟通纪要一键入底稿 ─────────
export async function ingestTextSource({ db, kb, org, notify }, user, p, b = {}) {
  org.assert(user, 'material.upload')
  const text = String(b.text ?? '').trim()
  if (text.length < 4) throw fail('请粘贴至少 4 个字的底稿或沟通纪要内容')
  if (text.length > 200000) throw fail('单次粘贴文本不超过 20 万字', 413)
  const kind = String(b.sourceKind || '沟通纪要').slice(0, 20)
  const firstLine = text.split(/\r?\n/).map(s => s.replace(/^#+\s*/, '').trim()).find(Boolean) ?? ''
  const rawTitle = String(b.title ?? '').trim() || firstLine.slice(0, 32) || `${p.name}_${kind}`
  const dateStr = new Date().toISOString().slice(0, 10)
  const fileName = `${dateStr}_${cleanFileStem(rawTitle)}.md`
  const md = `# ${rawTitle}\n\n> 采集方式：${kind} · 录入人：${user.name} · 时间：${new Date().toLocaleString('zh-CN')}\n\n${text}\n`
  const file = await kb.upload('m_nas', fileName, Buffer.from(md, 'utf8'), {
    level: b.level !== undefined ? Number(b.level) : undefined,
    by: user.name,
    subdir: projectSubdir(db, p),
  })
  notify?.emit?.('material.uploaded', { file, user })
  return { file, title: rawTitle }
}

// ───────── 2. 网页链接安全抓取入底稿 ─────────
export async function ingestUrlSource({ db, kb, org, notify, fetchImpl = fetch, lookupFn = lookup }, user, p, b = {}) {
  org.assert(user, 'material.upload')
  const u = await assertPublicHttpUrl(b.url, lookupFn)
  let res
  try {
    res = await fetchImpl(u.href, {
      headers: { 'user-agent': 'AdvantageCapital-InvestAI/3.2 (+EnterpriseResearch)', accept: 'text/html,text/plain,application/xhtml+xml,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
  } catch (e) {
    throw fail(`网页请求失败：${e.message}`, 502)
  }
  if (!res.ok) throw fail(`目标网页返回 HTTP ${res.status}`, 502)
  // 若发生重定向，二次校验最终落点防止跳转到内网
  if (res.url && res.url !== u.href) await assertPublicHttpUrl(res.url, lookupFn)
  const ctype = String(res.headers.get('content-type') ?? '').toLowerCase()
  const rawBuf = Buffer.from(await res.arrayBuffer())
  if (rawBuf.length > 3 * 1024 * 1024) throw fail('网页体积超过 3MB 上限，请下载关键文件后直接上传', 413)
  const rawText = rawBuf.toString('utf8')
  const parsed = ctype.includes('html') || /<html|<body|<p\b/i.test(rawText)
    ? htmlToCleanMarkdown(rawText, u.hostname)
    : { title: String(b.title || u.pathname.split('/').filter(Boolean).pop() || u.hostname).slice(0, 60), body: rawText.slice(0, 60000) }
  if (!parsed.body || parsed.body.length < 10) throw fail('该网页正文需浏览器动态渲染或受登录保护，建议复制正文后用「粘贴文本入底稿」录入', 422)
  const finalTitle = String(b.title ?? '').trim() || parsed.title
  const dateStr = new Date().toISOString().slice(0, 10)
  const fileName = `${dateStr}_网页_${cleanFileStem(finalTitle)}.md`
  const md = `# ${finalTitle}\n\n> 来源链接：${res.url || u.href}\n> 采集时间：${new Date().toLocaleString('zh-CN')} · 采集人：${user.name} · 证据参考：公开信息（待与审计/合同交叉核验）\n\n${parsed.body}\n`
  const file = await kb.upload('m_nas', fileName, Buffer.from(md, 'utf8'), {
    level: b.level !== undefined ? Number(b.level) : 1,
    by: user.name,
    subdir: projectSubdir(db, p),
  })
  notify?.emit?.('material.uploaded', { file, user })
  return { file, title: finalTitle, url: res.url || u.href, chars: parsed.body.length }
}

// ───────── 3. 带底稿一键快速立项（从文件名/简介识别项目要素，一步完成建档+入库） ─────────
export function inferProjectMetaFromInputs({ name = '', files = [], pastedText = '' } = {}) {
  const sample = [name, ...files.map(f => String(f.name ?? '').replace(/\.[a-z0-9]+$/i, '')), pastedText.slice(0, 500)].join(' ')
  const roundMatch = /(种子轮|天使轮|Pre-[AB]\+?|Pre-IPO|[ABCD]\+?轮|战略融资|并购|定增)/i.exec(sample)
  const indMatch = /(储能|锂电|固态电池|光伏|氢能|半导体|芯片|人工智能|大模型|机器人|具身智能|生物医药|医疗器械|创新药|新材料|航空航天|低空经济|智能制造|新能源汽车|云计算|工业软件)/.exec(sample)
  let cleanCo = String(name || files[0]?.name || '').replace(/\.[a-z0-9]+$/i, '')
    .replace(/(商业计划书|BP|尽调报告|审计报告|财务报表|访谈纪要|立项报告|路演|材料|底稿|202\d|\d{6,8}|[-_—·()（）【】\[\]])/gi, ' ')
    .trim().split(/\s+/)[0] || ''
  if (cleanCo.length > 24) cleanCo = cleanCo.slice(0, 24)
  const round = roundMatch ? roundMatch[1] : ''
  const projName = String(name || '').trim() || (cleanCo ? `${cleanCo}${round ? ` ${round}` : '股权投资'}` : '新建投研项目')
  return {
    projectName: projName,
    companyName: cleanCo || projName.split(/\s+/)[0],
    industry: indMatch ? indMatch[1] : '综合科技',
    round,
  }
}

export async function quickCreateProjectWithSources({ db, kb, org, engine, notify }, user, b = {}) {
  org.assert(user, 'project.create')
  const inFiles = Array.isArray(b.files) ? b.files.slice(0, 20) : []
  const pasted = String(b.pastedText ?? '').trim()
  if (inFiles.length || pasted) org.assert(user, 'material.upload')
  const inferred = inferProjectMetaFromInputs({ name: b.name, files: inFiles, pastedText: pasted })
  const projName = String(b.name ?? '').trim() || inferred.projectName
  const compName = String(b.companyName ?? '').trim() || inferred.companyName
  const industry = String(b.industry ?? '').trim() || inferred.industry
  const round = String(b.round ?? '').trim() || inferred.round

  let companyId = b.companyId || null
  if (!companyId && compName) {
    const existing = db.one('companies', c => c.name === compName || c.short === compName)
    if (existing) companyId = existing.id
    else if (org.can(user, 'company.edit')) {
      companyId = db.put('companies', {
        name: compName.slice(0, 60),
        short: compName.replace(/(股份有限公司|有限责任公司|有限公司|集团)$/g, '').slice(0, 20) || compName.slice(0, 20),
        industry: industry.slice(0, 30),
        region: String(b.region ?? '').slice(0, 30),
        fields: { 企业名称: { value: compName, by: user.name, status: 'confirmed' } },
      }, { actor: user, reason: '快速立项同步建档公司', action: 'create' }).id
    }
  }

  const p = engine.create(user, {
    name: projName,
    companyId,
    businessType: b.businessType || 'financial',
    fields: round ? { round } : {},
    desc: String(b.desc ?? '').trim() || (pasted ? pasted.slice(0, 240) : ''),
  })

  const uploaded = []
  const subdir = projectSubdir(db, p)
  for (const f of inFiles) {
    const buf = Buffer.from(String(f.data ?? ''), 'base64')
    if (!buf.length || buf.length > 40 * 1024 * 1024) continue
    const rec = await kb.upload('m_nas', String(f.name || '底稿.md'), buf, { by: user.name, subdir })
    uploaded.push(rec)
    notify?.emit?.('material.uploaded', { file: rec, user })
  }
  if (pasted.length >= 4) {
    const { file } = await ingestTextSource({ db, kb, org, notify }, user, p, { title: `${projName}_立项速记`, text: pasted, sourceKind: '立项速记' })
    uploaded.push(file)
  }
  return { projectId: p.id, projectName: p.name, fileIds: uploaded.map(f => f.id), uploadedCount: uploaded.length }
}

// ───────── 4. 企业 OA 个人待办聚合、一键催办与项目交接简报 ─────────
export function buildOaInbox({ db, org, engine, guideFn }, user) {
  const ps = db.all('projects').filter(p => org.seesProject(user, p) && p.status === 'active')
  const approvals = db.find('approvals', a => a.status === 'pending' && a.voters.includes(user.id) && !a.votes.some(v => v.userId === user.id) && !a.recused.includes(user.id))
    .map(a => ({ id: a.id, projectId: a.projectId, projectName: db.get('projects', a.projectId)?.name ?? '', gateName: a.gate.name, requestedAt: a.requestedAt, votesDone: a.votes.length, votesTotal: a.voters.length - a.recused.length }))
  const canFinalize = org.canOp(user, 'op.material.finalize')
  const reviews = canFinalize
    ? ps.flatMap(p => db.find('deliverables', d => d.projectId === p.id && d.status === 'review').map(d => ({ id: d.id, projectId: p.id, projectName: p.name, type: d.type, v: d.versions.length })))
    : []
  const mySteps = ps.flatMap(p => (guideFn(user, p, engine.readiness(p)) ?? []).filter(g => g.mine && !g.tab).map(g => ({ projectId: p.id, projectName: p.name, stage: db.get('workflows', p.workflowId)?.stages.find(s => s.id === p.stageId)?.name ?? '', text: g.text, workId: g.workId, deliverableId: g.deliverableId, gate: !!g.gate })))
  const tasks = db.find('tasks', t => !t.done && t.owner === user.id).sort((a, b) => (a.due || 9e15) - (b.due || 9e15)).slice(0, 12)
    .map(t => ({ id: t.id, title: t.title, projectId: t.projectId, projectName: t.projectId ? db.get('projects', t.projectId)?.name ?? '' : '', due: t.due }))
  return {
    total: approvals.length + reviews.length + mySteps.length + tasks.length,
    approvals,
    reviews,
    mySteps: mySteps.slice(0, 12),
    tasks,
  }
}

export async function nudgeProjectAction({ db, org, lifecycle, notify }, user, p, b = {}) {
  org.assertProject(user, p)
  const targetIds = []
  let subject = ''
  if (b.approvalId) {
    const a = db.get('approvals', b.approvalId)
    if (!a || a.projectId !== p.id || a.status !== 'pending') throw fail('该决策表决已结束或不存在', 404)
    for (const uid of a.voters) {
      if (!a.votes.some(v => v.userId === uid) && !a.recused.includes(uid)) targetIds.push(uid)
    }
    subject = `「${p.name} · ${a.gate.name}」待您表决`
  } else if (b.workId) {
    const w = (p.works ?? []).find(x => x.id === b.workId)
    if (!w) throw fail('工作项不存在', 404)
    const d = w.deliverableId ? db.get('deliverables', w.deliverableId) : null
    if (d?.status === 'review') {
      const holders = db.all('users').filter(u => !u.disabled && !lifecycle.check(u, d, 'finalize')).map(u => u.id)
      targetIds.push(...holders)
      subject = `「${p.name} · ${w.type}」v${d.versions.length} 待您复核定稿`
    } else if (w.assignee) {
      targetIds.push(w.assignee)
      subject = `「${p.name} · ${w.type}」阶段必做事项请尽快推进`
    }
  }
  const uniq = [...new Set(targetIds.filter(Boolean))]
  if (!uniq.length) throw fail('当前事项暂无需要催办的待处理责任人')
  const cooldownKey = `nudge_${p.id}_${b.approvalId || b.workId}`
  const lastAt = Number(db.kv(cooldownKey) ?? 0)
  if (Date.now() - lastAt < 30000) throw fail('刚刚已发送过催办提醒，请稍后再试', 429)
  db.kv(cooldownKey, Date.now())
  const note = String(b.note ?? '').trim().slice(0, 160)
  await notify.notify(uniq, {
    kind: b.approvalId ? 'approval' : 'review',
    title: `催办提醒：${subject}`,
    text: `发起人：${user.name}${note ? ` · 附言：${note}` : ''}`,
    projectId: p.id,
    push: true,
  })
  const names = uniq.map(id => db.get('users', id)?.name).filter(Boolean)
  db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: 'OA催办', target: subject, detail: names.join('、') })
  return { ok: true, notified: names, subject }
}

export function buildProjectHandover({ db, kb, org, engine }, user, p, { saveAsNote = true } = {}) {
  org.assertProject(user, p)
  const wf = engine.def(p)
  const st = wf.stages.find(s => s.id === p.stageId)
  const rd = engine.readiness(p)
  const c = p.companyId ? db.get('companies', p.companyId) : null
  const files = p.companyId
    ? kb.list(user, { companyId: p.companyId }).filter(f => f.mountId !== 'm_ws' && !f.rel.includes('/.versions/') && !f.rel.includes('/Studio成品/'))
    : kb.list(user).filter(f => f.rel.includes(`项目资料/${p.name}/`))
  const dls = db.find('deliverables', d => d.projectId === p.id)
  const approvals = db.find('approvals', a => a.projectId === p.id).sort((a, b) => b.createdAt - a.createdAt)
  const tasks = db.find('tasks', t => t.projectId === p.id && !t.done)
  const mesh = db.get('kvstate', `mesh_${p.id}`)
  const lines = [
    `# ${p.name} · 项目交接与上会简报`,
    `> 生成时间：${new Date().toLocaleString('zh-CN')} · 生成人：${user.name} · 当前阶段：${st?.name ?? p.stageId}（全周期进度 ${p.progress ?? 0}%）`,
    '',
    '## 一、项目基本盘',
    `- **拟投主体**：${c?.name ?? '未关联公司档案'}（行业：${c?.industry ?? '未标注'}）`,
    `- **项目负责人**：${db.get('users', p.owner)?.name ?? p.owner} · **项目组成员**：${(p.members ?? []).map(m => `${db.get('users', m.userId)?.name ?? m.userId}(${m.role})`).join('、') || '无'}`,
    p.desc ? `- **项目简介**：${p.desc}` : null,
    '',
    `## 二、当前阶段准入与成果台账（${rd.ok ? '已满足准入条件' : '尚有必做项未定稿'}）`,
    ...(rd.items ?? []).map(i => `- [${i.ok ? 'x' : ' '}] **${i.work}**：${i.status}${i.why ? `（${i.why}）` : ''}`),
    ...(dls.length ? ['', '### 已登记成果版本', ...dls.map(d => `- **${d.type}**（${d.format.toUpperCase()}）：${{ draft: '草稿', review: '待复核', final: '已定稿' }[d.status] ?? d.status} · 共 ${d.versions.length} 个版本`)] : []),
    '',
    `## 三、原始底稿清单（共 ${files.length} 份）`,
    ...(files.length ? files.slice(0, 25).map(f => `- 《${f.name}》（${(f.size / 1024).toFixed(0)} KB · 密级：${['公开', '内部', '机密', '绝密'][f.level ?? 1]}）`) : ['- 暂无原始底稿，请尽快上传审计报告、合同及商业计划书']),
    '',
    '## 四、关键风险提示与历史决策意见',
    ...(mesh?.redFlags?.length ? mesh.redFlags.map(r => `- ⚠️ ${r}`) : ['- 尚未发现自动标记的红旗事项，建议在工作台运行成套深度交叉核对。']),
    ...(approvals.length ? approvals.slice(0, 5).map(a => `- **${a.gate.name}**（${a.status === 'pending' ? '表决进行中' : `结果：${a.result}`}）：${a.votes.map(v => `${db.get('users', v.userId)?.name ?? v.userId}[${v.decision}] ${v.opinion || ''}`).join('；') || '暂无投票记录'}`) : []),
    '',
    `## 五、未结待办事项（${tasks.length} 项）`,
    ...(tasks.length ? tasks.map(t => `- [ ] ${t.title}（责任人：${db.get('users', t.owner)?.name ?? '待定'}）`) : ['- 当前无未完成待办任务']),
  ].filter(x => x !== null).join('\n')

  let savedNote = null
  if (saveAsNote) {
    const notes = saveNote(db, user, p.id, { title: `交接与上会简报 ${new Date().toISOString().slice(0, 10)}`, content: lines, tag: '交接简报', board: 'gates' })
    savedNote = notes[0] ?? null
  }
  return { title: `${p.name} · 项目交接与上会简报`, markdown: lines, noteId: savedNote?.id ?? null }
}

// ───────── 5. 企业开箱落地就绪度诊断与人员批量导入 ─────────
const ROLE_ALIAS = {
  partner: 'partner', 合伙人: 'partner', 管理合伙人: 'partner', 投委: 'partner',
  head: 'head', 部门负责人: 'head', 总监: 'head', 董事总经理: 'head', md: 'head',
  pm: 'pm', 项目经理: 'pm', 投资经理: 'pm', 投资总监: 'pm', vp: 'pm',
  analyst: 'analyst', 分析师: 'analyst', 研究员: 'analyst', 投资助理: 'analyst',
  risk: 'risk', 风控: 'risk', 风控总监: 'risk', 风控经理: 'risk',
  legal: 'legal', 法务: 'legal', 法务合规: 'legal', 合规: 'legal',
  finance: 'finance', 财务: 'finance', 财务尽调: 'finance', 基金财务: 'finance',
  postinv: 'postinv', 投后: 'postinv', 投后管理: 'postinv', 赋能: 'postinv',
  fund: 'fund', 基金募资: 'fund', 募资: 'fund', ir: 'fund',
  staff: 'staff', 综合协作: 'staff', 综合: 'staff',
  sysadmin: 'sysadmin', admin: 'sysadmin', 系统管理员: 'sysadmin', 管理员: 'sysadmin', it: 'sysadmin',
}

export async function getEnterpriseReadiness({ db, kb, ai, mode }) {
  const s = db.get('settings', 'main') ?? {}
  const mStat = await ai.status().catch(e => ({ ok: false, note: e.message }))
  const mounts = await kb.mountsView()
  const activeUsers = db.all('users').filter(u => !u.disabled)
  const depts = db.all('depts')
  const pushOn = (s.push?.channels ?? []).filter(c => c.enabled)
  const items = [
    { id: 'org', title: '机构品牌与部门架构', ok: Boolean(s.org?.name && depts.length >= 2), detail: `${s.org?.name || '未命名机构'} · ${depts.length} 个部门 · ${activeUsers.length} 名在职账号`, nav: 'settings:org' },
    { id: 'model', title: 'AI 大模型服务连通', ok: !!mStat.ok && !mStat.confidentialBlocked, detail: mStat.ok ? `${mStat.label}${mStat.confidentialBlocked ? '（受密级策略限制，机密底稿走离线）' : ''}` : (mStat.note || '尚未连接可用模型'), act: 'nb-api' },
    { id: 'storage', title: '底稿库与档案存储挂载', ok: mounts.some(m => m.online), detail: `${mounts.filter(m => m.online).length}/${mounts.length} 个存储目录在线 · 已索引 ${kb.files().length} 份文件`, nav: 'knowledge' },
    { id: 'workflow', title: '投研阶段门禁与制度流程', ok: db.find('workflows', w => w.status === 'published').length > 0, detail: `${db.find('workflows', w => w.status === 'published').length} 套已发布标准投研流程`, nav: 'settings:workflow' },
    { id: 'push', title: '企微 / 飞书 / 钉钉群通知', ok: pushOn.length > 0, detail: pushOn.length ? `已启用 ${pushOn.map(c => c.name).join('、')}` : '可选：配置群机器人后审批与催办自动推送到群', nav: 'settings:integrations' },
    { id: 'security', title: '访问鉴权与审计留痕', ok: mode === 'saas' ? (s.security?.minPassword >= 8) : true, detail: mode === 'saas' ? `多人登录模式 · 最短密码 ${s.security?.minPassword ?? 8} 位${s.sso?.enabled ? ' · 已开统一登录' : ''}` : `桌面/插件模式 · 身份切换${s.desktop?.personaSwitch === false ? '已锁定' : '开放演示'}`, nav: 'settings:cloud' },
  ]
  const readyCount = items.filter(i => i.ok).length
  return { mode, scorePct: Math.round((readyCount / items.length) * 100), readyCount, totalCount: items.length, items }
}

export function batchImportUsers({ db, org, sessions, hashPassword, minPassword = 8, forceChange = true, mode }, user, b = {}) {
  org.assert(user, 'org.manage')
  const raw = String(b.csvText ?? '').trim()
  if (!raw) throw fail('请粘贴人员名单（每行：姓名, 账号, 部门, 岗位, 职务, 邮箱）')
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const created = []
  const updated = []
  const errors = []
  const allRoles = new Set(db.all('roles').map(r => r.id))

  lines.forEach((line, idx) => {
    const cols = line.split(/\t|,|，|;/).map(s => s.trim())
    // 跳过表头行
    if (idx === 0 && /^(姓名|name)$/i.test(cols[0]) && /^(账号|用户名|username)/i.test(cols[1] || '')) return
    const [name, usernameRaw, deptName = '投资一部', roleRaw = 'analyst', title = '', email = ''] = cols
    const username = String(usernameRaw || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 30)
    if (!name || !username) {
      errors.push(`第 ${idx + 1} 行格式不完整（需至少提供姓名与英文数字账号）：${line.slice(0, 40)}`)
      return
    }
    let dept = db.one('depts', d => d.name === deptName || d.id === deptName)
    if (!dept) {
      dept = db.put('depts', { id: `d_${randomBytes(3).toString('hex')}`, name: deptName.slice(0, 30), parentId: null }, { actor: user, reason: `批量导入自动新建部门「${deptName}」`, action: 'dept' })
    }
    const parsedRoles = String(roleRaw).split(/[+/、|]/).map(r => r.trim().toLowerCase()).map(r => ROLE_ALIAS[r] ?? (allRoles.has(r) ? r : null)).filter(Boolean)
    const roles = parsedRoles.length ? [...new Set(parsedRoles)] : ['analyst']
    const existing = db.one('users', u => u.username === username)
    if (existing) {
      if (existing.id === user.id && !roles.some(r => db.get('roles', r)?.functions?.includes('org.manage'))) roles.push('sysadmin')
      db.put('users', { ...existing, name: name.slice(0, 30), deptId: dept.id, roles, title: (title || existing.title || '').slice(0, 30), email: email || existing.email || '', disabled: false }, { actor: user, reason: `批量更新人员「${name}」`, action: 'user' })
      updated.push({ name, username, dept: dept.name, roles })
    } else {
      const initPw = `Ac#${randomBytes(5).toString('base64url').slice(0, Math.max(6, minPassword - 3))}9`
      const next = {
        id: `u_${randomBytes(4).toString('hex')}`,
        name: name.slice(0, 30),
        username,
        deptId: dept.id,
        roles,
        title: (title || roles[0]).slice(0, 30),
        email,
        disabled: false,
        ...(mode === 'saas' ? { pw: hashPassword(initPw), mustChange: !!forceChange } : {}),
      }
      db.put('users', next, { actor: user, reason: `批量导入新增人员「${name}」`, action: 'user' })
      sessions?.revokeUser?.(next.id)
      created.push({ name, username, dept: dept.name, roles, ...(mode === 'saas' ? { initialPassword: initPw } : {}) })
    }
  })
  db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: '批量导入人员', target: `新增 ${created.length} 人，更新 ${updated.length} 人` })
  return { created, updated, errors }
}
