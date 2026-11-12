// 模型撰稿：先通读底稿定提纲，再分批写正文。每一步都给足输出额度并打开思考；失败的部分如实报告，不用套话补。
import { complete, parseJson } from './llm.mjs'
import { sourceDigest, projectFacts } from './nb-ground.mjs'
import { normalizeDeck } from './nb-deck.mjs'

const RULES = `写作规矩：
1. 只用下面给出的底稿和项目登记信息。底稿里没有的事实、数字、客户名、日期一律不写；需要但缺失的信息放进 gaps。
2. 引用底稿里的数字时保持原样（单位、小数位不改），句末标来源编号，如 [2]。
3. 自己算出来的数（增速、占比、差额、倍数）必须写明“测算”和算式，如“约 4%（测算：2,700÷65,300）”。
4. 不同底稿对同一指标说法不一致时，把两个口径都写出来并指出差异，不替读者挑一个。
5. 用平实的中文，一句话说一件事。不写“赋能、抓手、闭环、护城河、底层逻辑”这类套话，不用表情符号，不写英文小标题，不写“值得注意的是”“综上所述”。`
const ROLE = '你是优势资本的投资经理，正在为投委会准备材料。读你材料的人时间很少，只关心这个项目能不能投、凭什么、还差什么。'
const DENSITY = {
  concise: { point: '每条要点 25-45 字', para: '每章 250-400 字', note: '讲稿 80-150 字' },
  standard: { point: '每条要点 40-70 字', para: '每章 450-700 字', note: '讲稿 120-220 字' },
  dense: { point: '每条要点 60-110 字', para: '每章 700-1100 字', note: '讲稿 180-300 字' },
}

const brief = (p, docs) => [
  `项目登记信息：\n${projectFacts(p).map(([k, v]) => `${k}：${v}`).join('\n') || p.name}`,
  `底稿（共 ${docs.length} 份）：\n${sourceDigest(docs)}`,
].join('\n\n')

/** 调一次模型并取 JSON；空输出或解析失败重试一次。onUsage 累计输出字数。 */
export async function askJson(adapter, { system, user, maxTokens, timeoutMs = 360000, signal, onUsage }) {
  let last = ''
  for (let i = 0; i < 2; i++) {
    const raw = await complete(adapter, { system, user: i ? `${user}\n\n上一次的输出不是合法 JSON。这次只输出 JSON 本身，不要任何解释。` : user, maxTokens, reasoning: 'high', signal: signal ?? AbortSignal.timeout(timeoutMs) })
    onUsage?.(raw.length)
    const j = raw.trim() ? parseJson(raw) : null
    if (j && typeof j === 'object') return j
    last = raw.trim() ? '模型输出不是合法 JSON' : '模型返回了空内容'
  }
  throw new Error(last)
}
async function askText(adapter, { system, user, maxTokens, timeoutMs = 360000, onUsage }) {
  const raw = await complete(adapter, { system, user, maxTokens, reasoning: 'high', signal: AbortSignal.timeout(timeoutMs) })
  onUsage?.(raw.length)
  const t = raw.replace(/^```(?:markdown)?\s*|\s*```$/g, '').trim()
  if (!t) throw new Error('模型返回了空内容')
  return t
}
async function pool(items, n, fn) {
  const out = Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch(e => ({ error: e.message })) } }))
  return out
}

const BLOCK_GUIDE = `每页由 1-3 个内容块组成，块的种类和数量由你按内容决定：
- 要点 {"type":"points","items":[{"head":"小标题，不超过 14 字，可以为空","text":"正文"}]}，2-5 条
- 表格 {"type":"table","head":["列名"],"rows":[["单元格"]],"note":"口径说明，可以为空"}，2-6 列，不超过 8 行
- 图表 {"type":"chart","kind":"bar 或 line 或 pie","title":"图题","unit":"单位","labels":["类别"],"series":[{"name":"系列名","values":[数字]}]}，values 只能填底稿里的数字
- 关键数字 {"type":"stats","items":[{"value":"6.8 亿元","label":"指标名","note":"口径或来源"}]}，2-4 个
- 步骤或时间线 {"type":"steps","items":[{"head":"节点","text":"说明"}]}，3-5 个
- 对比 {"type":"compare","left":{"head":"一方","items":["…"]},"right":{"head":"另一方","items":["…"]}}
- 原话 {"type":"quote","text":"底稿原句","source":"《文件名》"}
- 段落 {"type":"text","text":"一段话"}
怎么选：同一组对象有多个属性，用表格；几个可以比较的数字，用图表；一两个最要紧的数字，用关键数字；观点和推理，用要点；两个口径或两种方案，用对比；有先后顺序的事，用步骤。同一内容不要用两种块重复说。没有合适数据就不要放图表。`

/**
 * 演示文稿。第一步：通读底稿，定这份材料要回答的问题和每页的判断；第二步：每 3 页一批并行撰写。
 * 返回 { deck, issues, chars }；写成的页不到一半时抛错，由调用方改走离线组稿。
 */
export async function authorDeck(adapter, p, docs, { pageCount = 8, density = 'standard', prompt = '', onStep } = {}) {
  const D = DENSITY[density] ?? DENSITY.standard
  const body = Math.max(3, pageCount - 2)
  const ctx = brief(p, docs)
  const issues = []
  let chars = 0
  const onUsage = n => { chars += n }
  onStep?.('通读底稿，确定提纲')
  const plan = await askJson(adapter, {
    system: `${ROLE}\n${RULES}`, maxTokens: 20000, onUsage,
    user: `${ctx}${prompt ? `\n\n使用者的额外要求：${prompt}` : ''}

先通读全部底稿，想清楚三件事：这个项目最值得投委会讨论的问题是什么；底稿里哪些事实和数字能回答它；哪些关键信息底稿没有给。
然后安排一份 ${body} 页正文的汇报（不含封面和末尾的来源页）。不要套固定目录，按这个项目自己的问题来排。每页只讲一个判断，标题直接写成这个判断，是完整的一句话，不超过 30 个字。
每页说明：要回答什么；用到哪些底稿内容（带编号）；适合怎么呈现（表格、柱状图或折线图、几个关键数字、要点、两栏对比、步骤、原话引用、一段文字）以及理由。相邻两页的呈现方式尽量不同，但不要为了变化硬凑。底稿撑不起 ${body} 页时就少排，不要注水。
只输出 JSON：
{"subtitle":"一句话概括这份材料的结论","kicker":"封面小字，如 尽职调查 · C轮","stats":[{"value":"45 亿元","label":"投前估值","note":"口径或来源"}],"slides":[{"no":1,"kicker":"本页所属部分，4-8 个字","title":"…","purpose":"…","evidence":"…","form":"…"}],"gaps":["底稿没有覆盖的关键信息"]}
stats 给 2-4 个最能说明这个项目的数字，必须出自底稿或登记信息。`,
  })
  const outline = (Array.isArray(plan.slides) ? plan.slides : []).filter(s => s?.title).slice(0, body).map((s, i) => ({ ...s, no: i + 1 }))
  if (outline.length < 2) throw new Error('模型没有给出可用的提纲')
  const outlineText = outline.map(s => `第 ${s.no} 页｜${s.kicker || ''}｜${s.title}\n  要回答：${s.purpose || ''}\n  依据：${s.evidence || ''}\n  呈现：${s.form || ''}`).join('\n')
  const batches = []
  for (let i = 0; i < outline.length; i += 3) batches.push(outline.slice(i, i + 3))
  onStep?.(`提纲 ${outline.length} 页，分 ${batches.length} 批撰写`)
  const written = await pool(batches, 3, batch => askJson(adapter, {
    system: `${ROLE}\n${RULES}`, maxTokens: 24000, onUsage,
    user: `${ctx}

整份汇报的安排：
${outlineText}

${prompt ? `使用者的额外要求：${prompt}\n\n` : ''}现在写第 ${batch.map(s => s.no).join('、')} 页，其他页由同事在写，不要重复它们的内容。
${BLOCK_GUIDE}
篇幅：${D.point}；表格和图表里不写句子。
每页还要有：lede（标题下的一句话，交代背景或口径，可以为空）；takeaway（这一页给投委会的判断，一句话）；cites（用到的底稿编号）；notes（${D.note}，口语，把这页的来龙去脉讲清楚，讲稿里的数字同样要有出处）。
只输出 JSON：{"slides":[{"no":${batch[0].no},"kicker":"…","title":"…","lede":"…","blocks":[…],"takeaway":"…","cites":[1],"notes":"…"}]}`,
  }))
  const byNo = new Map()
  written.forEach((w, i) => {
    if (w?.error) { issues.push(`第 ${batches[i].map(s => s.no).join('、')} 页没写成：${w.error}`); return }
    for (const s of Array.isArray(w?.slides) ? w.slides : []) if (Number.isInteger(Number(s?.no))) byNo.set(Number(s.no), s)
  })
  const raw = outline.map(o => { const s = byNo.get(o.no); return s ? { ...s, kicker: s.kicker || o.kicker, title: s.title || o.title } : null }).filter(Boolean)
  const deck = normalizeDeck({ title: p.name, subtitle: plan.subtitle, stats: plan.stats, gaps: plan.gaps, slides: raw }, { title: p.name, kicker: String(plan.kicker || '').slice(0, 30) })
  const lost = outline.length - deck.slides.length
  if (lost > 0 && !issues.length) issues.push(`${lost} 页内容不合规被去掉`)
  if (deck.slides.length < Math.ceil(outline.length / 2)) throw new Error(issues[0] || '模型写成的页数不到一半')
  return { deck, issues, chars }
}

/**
 * 报告。提纲 → 各章并行撰写 → 摘要。返回 { markdown, issues, chars, gaps }。
 * type 是报告名称（如「尽职调查报告」），chapters 是章数。
 */
export async function authorReport(adapter, p, docs, { type = '尽职调查报告', chapters = 6, density = 'standard', prompt = '', onStep } = {}) {
  const D = DENSITY[density] ?? DENSITY.standard
  const ctx = brief(p, docs)
  const issues = []
  let chars = 0
  const onUsage = n => { chars += n }
  onStep?.('通读底稿，确定章节')
  const plan = await askJson(adapter, {
    system: `${ROLE}\n${RULES}`, maxTokens: 16000, onUsage,
    user: `${ctx}${prompt ? `\n\n使用者的额外要求：${prompt}` : ''}

要写一份《${p.name} ${type}》。先通读底稿，判断这份报告必须回答哪些问题，再定章节，约 ${chapters} 章。章节按这个项目的实际情况安排，标题写清这一章讲什么；底稿没有材料的方面不要单独成章，放进 gaps。
每章列出：要回答的问题、要用到的底稿内容（带编号）、是否需要表格。
只输出 JSON：{"chapters":[{"no":1,"title":"…","questions":["…"],"evidence":"…","table":"需要的话写明列哪些数据，否则留空"}],"gaps":["…"]}`,
  })
  const outline = (Array.isArray(plan.chapters) ? plan.chapters : []).filter(c => c?.title).slice(0, Math.max(3, chapters)).map((c, i) => ({ ...c, no: i + 1 }))
  if (outline.length < 2) throw new Error('模型没有给出可用的章节安排')
  const outlineText = outline.map(c => `第 ${c.no} 章 ${c.title}：${(c.questions || []).join('；')}`).join('\n')
  onStep?.(`共 ${outline.length} 章，并行撰写`)
  const bodies = await pool(outline, 3, c => askText(adapter, {
    system: `${ROLE}\n${RULES}`, maxTokens: 16000, onUsage,
    user: `${ctx}

报告《${p.name} ${type}》的章节安排：
${outlineText}

${prompt ? `使用者的额外要求：${prompt}\n\n` : ''}现在写第 ${c.no} 章「${c.title}」。要回答：${(c.questions || []).join('；') || '见章节标题'}。可用底稿：${c.evidence || '全部'}。${c.table ? `本章需要一张表：${c.table}。` : ''}
写法：${D.para}。先写结论，再写依据和推理；段落为主，确有并列项时才用列表；需要表格就用 Markdown 表格，表里只放底稿里的数据。可以用三级标题（###）分小节，不要写本章标题，不要写“本章小结”。
只输出这一章的 Markdown 正文。`,
  }))
  const parts = []
  outline.forEach((c, i) => {
    const b = bodies[i]
    if (typeof b !== 'string') { issues.push(`第 ${c.no} 章「${c.title}」没写成：${b?.error || '未知原因'}`); return }
    parts.push(`## ${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][parts.length] ?? parts.length + 1}、${c.title}\n\n${b.replace(/^#{1,2}\s.*\n+/, '')}`)
  })
  if (parts.length < Math.ceil(outline.length / 2)) throw new Error(issues[0] || '模型写成的章节不到一半')
  onStep?.('撰写摘要')
  const summary = await askText(adapter, {
    system: `${ROLE}\n${RULES}`, maxTokens: 8000, onUsage,
    user: `下面是《${p.name} ${type}》的正文。写一段 200-350 字的摘要，放在报告最前面：第一句给出总的判断，然后是支撑它的三四个事实（带数字和来源编号），最后说清还有什么没核实。不要写标题，只输出摘要正文。\n\n${parts.join('\n\n').slice(0, 30000)}`,
  }).catch(e => { issues.push(`摘要没写成：${e.message}`); return '' })
  const gaps = (Array.isArray(plan.gaps) ? plan.gaps : []).map(g => String(g).trim()).filter(Boolean).slice(0, 10)
  const markdown = [
    `# ${p.name} ${type}`,
    ...(summary ? ['## 摘要', summary] : []),
    ...parts,
    ...(gaps.length ? ['## 底稿没有覆盖的信息', gaps.map(g => `- ${g}`).join('\n')] : []),
    '## 依据的底稿', docs.map((d, i) => `- [${i + 1}] 《${d.name}》`).join('\n'),
  ].join('\n\n')
  return { markdown, issues, chars, gaps }
}

/** 其他成品（对谈稿、测验、闪卡、导图）用的一次性结构化撰写。 */
export async function authorStructured(adapter, p, docs, task, { maxTokens = 16000 } = {}) {
  let chars = 0
  const out = await askJson(adapter, { system: `${ROLE}\n${RULES}`, user: `${brief(p, docs)}\n\n${task}`, maxTokens, onUsage: n => { chars += n } })
  return { out, chars }
}
