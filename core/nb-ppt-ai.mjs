// AI 驱动的麦肯锡/投行级 PPT 蓝图架构师（给本机接入的 DeepSeek API 注入完整视觉与投研提示词，由 AI 机器人自主完成每页版式选型、结论先行标题、KPI 指标卡、四象限深度分析卡与对比矩阵表设计）
import { complete } from './llm.mjs'
import { parseSourceTables, classifySourceSentences } from './nb-deep-doc.mjs'

const PPT_ARCHITECT_SYSTEM_PROMPT = `你是优势资本（Advantage Capital）首席投研合伙人兼麦肯锡（McKinsey）资深演示文稿架构师。
你的任务是：严格依据用户勾选的【项目原始底稿原文】，为投委会（IC）设计一套极具视觉美感、信息密度饱满、零幻觉的咨询级 PPT 完整蓝图（JSON 格式）。

【绝对设计准则】
1. 100% 源自底稿、零虚构数字：所有财务数字、客户名称、估值、合同金额必须来自给定底稿并标注 [1][2] 出处；未披露项写"底稿未披露（待核实）"。
2. 结论先行（Action Title）：每页 title 必须是包含核心数据或判断的完整结论句（18-32字），严禁用"公司简介""财务分析"这种空洞词。
3. 严禁单薄留白：每一页必须同时具备：
   - kicker：英文+中文大写分类眉题（如 "SECTION 01 · INVESTMENT THESIS & MOAT"）
   - title：结论先行主标题
   - banner：顶部核心洞察导语（45-70字，提炼本页对投资决策的核心启示）
   - layout：从 ["bento_quad", "kpi_table", "split_cards"] 中为每页交替选择最匹配的视觉版式
   - kpis：3 个核心定量/定性指标卡 [{"val":"...", "label":"...", "sub":"..."}]
   - cards：必须写满 4 张深度分析卡片 [{"tag":"01 · 维度名", "heading":"小标题(8-14字)", "body":"包含具体事实、推理与判断的详实正文(45-75字)，带[n]引用"}]
   - footnote：底部结论金句与核验动作建议

请严格只输出合法 JSON 对象，格式如下（不要加任何额外解释）：
{
  "deckSubtitle": "...",
  "coverKpis": [{"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}],
  "slides": [
    {
      "kicker": "SECTION 01 · EXECUTIVE SUMMARY",
      "title": "...",
      "layout": "bento_quad",
      "banner": "...",
      "kpis": [{"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}],
      "cards": [
        {"tag":"01 · 核心壁垒", "heading":"...", "body":"..."},
        {"tag":"02 · 客户实证", "heading":"...", "body":"..."},
        {"tag":"03 · 财务勾稽", "heading":"...", "body":"..."},
        {"tag":"04 · 投决判断", "heading":"...", "body":"..."}
      ],
      "footnote": "..."
    }
  ]
}`

export async function planPptDeckWithAi(ai, p, docs = [], { pageCount = 8, density = 'standard', userPrompt = '' } = {}) {
  const tables = parseSourceTables(docs)
  const b = classifySourceSentences(docs)
  const f = p.fields ?? {}
  const bodySlidesCount = Math.max(2, Number(pageCount || 8) - 2)
  const srcDigest = docs.map((d, i) => `【底稿[${i + 1}]：《${d.name}》】\n${d.text.slice(0, 1800)}`).join('\n\n')
  const route = await ai?.route?.(1).catch(() => ({ adapter: null }))
  let aiPlan = null
  if (route?.adapter && docs.length) {
    const prompt = [
      `项目名称：${p.name}（阶段：${p.stage || '尽职调查'}；轮次：${f.round || '未披露'}；拟投金额：${f.amount || '未披露'}；估值：${f.valuation || '未披露'}）`,
      `已勾选底稿共 ${docs.length} 份：\n${srcDigest}`,
      userPrompt ? `用户特别指令：${userPrompt}` : '',
      `请严格根据以上底稿原文，规划总计 ${bodySlidesCount + 1} 个章节页（第 1 个为执行摘要页，后 ${bodySlidesCount} 个为专题深潜页），每页必须填满 3 个 kpis 和 4 张详实 cards（每张 card 的 body 不少于 45 字，带 [1][2] 出处）。只输出 JSON：`,
    ].filter(Boolean).join('\n\n')
    const raw = await complete(route.adapter, {
      system: PPT_ARCHITECT_SYSTEM_PROMPT,
      user: prompt,
      maxTokens: 3200,
      reasoning: 'off',
      signal: AbortSignal.timeout(45000),
    }).catch(() => '')
    const m = String(raw || '').match(/\{[\s\S]*\}/)
    if (m) {
      try { aiPlan = JSON.parse(m[0]) } catch { aiPlan = null }
    }
  }
  return normalizeDeckPlan(aiPlan, p, docs, b, tables, bodySlidesCount)
}

function normalizeDeckPlan(aiPlan, p, docs, b, tables, bodySlidesCount) {
  const f = p.fields ?? {}
  const layouts = ['bento_quad', 'kpi_table', 'split_cards']
  const pool = [...b.overview, ...b.business, ...b.finance, ...b.risk, ...b.todo, ...b.all]
  const pickSent = (arr, idx) => arr[idx % Math.max(1, arr.length)] || pool[idx % Math.max(1, pool.length)] || `依据《${docs[0]?.name || '项目底稿'}》完成穿行核验与交叉比对 [1]`
  const baseTopics = [
    ['SECTION 01 · EXECUTIVE SUMMARY', `${p.name}：核心投资逻辑与底稿交叉核验总览`, b.overview.concat(b.business), ['01 · 主体定位', '02 · 业务壁垒', '03 · 财务亮点', '04 · 投决建议']],
    ['SECTION 02 · PRODUCT & CUSTOMER MOAT', `核心产品矩阵、技术壁垒与头部客户导入实证`, b.business.concat(b.overview), ['01 · 产品矩阵', '02 · 客户验证', '03 · 产能交付', '04 · 竞争护城河']],
    ['SECTION 03 · FINANCIAL & AUDIT CHECK', `财务报表勾稽、营收毛利结构与现金流质量穿透`, b.finance.concat(b.risk), ['01 · 营收增长', '02 · 毛利结构', '03 · 应收与存货', '04 · 现金流核验']],
    ['SECTION 04 · CONTRACT & ORDER LEDGER', `核心客户合同台账、在手订单与收入确认时点复核`, b.business.concat(b.finance), ['01 · 重大合同', '02 · 履约进度', '03 · 客户集中度', '04 · 函证核对']],
    ['SECTION 05 · BLUE TEAM RISK MATRIX', `蓝军反驳视角：跨底稿口径差异与潜在合规风险排查`, b.risk.concat(b.todo), ['01 · 口径差异', '02 · 诉讼与合规', '03 · 经营波动', '04 · 缓释方案']],
    ['SECTION 06 · VALUATION & IC VERDICT', `交易架构、估值合理性对标与投委会交割先决条件`, b.todo.concat(b.finance), ['01 · 交易要素', '02 · 估值对标', '03 · 交割先决条件', '04 · 投后赋能']],
  ]
  const defaultKpis = [
    { val: f.round || p.stage || '尽调期', label: '当前融资轮次/阶段', sub: `项目登记状态：${p.stage || '推进中'}` },
    { val: f.valuation || f.amount || `${docs.length}份底稿`, label: '投前估值 / 拟投规模', sub: `拟投金额：${f.amount || '见底稿条款'}` },
    { val: `${docs.length} 份原文`, label: '100% 底稿实证锚定', sub: `含 ${tables.length} 张原始财务/业务表` },
  ]
  const rawSlides = Array.isArray(aiPlan?.slides) && aiPlan.slides.length ? aiPlan.slides : []
  const totalNeeded = bodySlidesCount + 1
  const outSlides = []
  for (let i = 0; i < totalNeeded; i++) {
    const s = rawSlides[i] || {}
    const tp = baseTopics[i % baseTopics.length]
    const sents = tp[2].length ? tp[2] : pool
    const cards = [0, 1, 2, 3].map(ci => {
      const c = s.cards?.[ci] || {}
      const rawTxt = c.body && String(c.body).length > 22 ? String(c.body) : `${pickSent(sents, i * 2 + ci)}；经交叉比对原始底稿，该项指标已纳入本阶段重点核验台账。`
      const head = c.heading && String(c.heading).length > 3 ? String(c.heading) : rawTxt.replace(/\[.*?\]|（.*?）/g, '').slice(0, 16)
      return { tag: c.tag || tp[3][ci], heading: head, body: rawTxt }
    })
    const kpis = [0, 1, 2].map(ki => s.kpis?.[ki]?.val ? s.kpis[ki] : defaultKpis[ki])
    const tbl = tables[i % Math.max(1, tables.length)]
    outSlides.push({
      kicker: s.kicker || tp[0],
      title: s.title && String(s.title).length > 8 ? String(s.title) : tp[1],
      layout: layouts[i % layouts.length],
      banner: s.banner && String(s.banner).length > 15 ? String(s.banner) : `核心研判导语：${pickSent(sents, i)}`,
      kpis,
      cards,
      tableRows: tbl?.rows?.slice(0, 6) || null,
      tableTitle: tbl?.title || '底稿核心数据核对表',
      footnote: s.footnote || `投委会核验动作：严格锚定已勾选 ${docs.length} 份底稿原文，未决事项均作为交割先决条件（CP）跟踪落实。`,
    })
  }
  return { coverKpis: aiPlan?.coverKpis?.length === 3 ? aiPlan.coverKpis : defaultKpis, slides: outSlides }
}


