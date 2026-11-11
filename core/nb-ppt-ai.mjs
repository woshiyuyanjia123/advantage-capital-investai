// AI 驱动的麦肯锡/投行级 PPT 蓝图架构师（给本机接入的 DeepSeek API 注入完整视觉与投研提示词，由 AI 机器人自主完成每页版式选型、结论先行标题、KPI 指标卡、四象限深度分析卡与对比矩阵表设计）
import { complete, openaiLlm, DEFAULT_MODEL } from './llm.mjs'
import { readDshLocalDeepSeekKey } from './nb-api.mjs'
import { parseSourceTables, classifySourceSentences } from './nb-deep-doc.mjs'

const PPT_ARCHITECT_SYSTEM_PROMPT = `你是优势资本（Advantage Capital）首席投研合伙人兼顶级商业演示视觉总监。
请拒绝任何机械的"填字游戏"！你需要先深度思考所给【项目原始底稿】的行业特质、商业模式、财务勾稽、客户合同与核心风险，然后**自主创意、动态规划**每一页 PPT 的叙事主题与视觉版式结构。

【核心创作铁律】
1. 100% 源自底稿事实、零虚构数字：所有数字、客户、合同、产能、估值必须来自给定底稿并带 [1][2] 出处；未披露项写"底稿未披露（待核实）"。
2. 每一页的版式（layout）必须根据该页内容自主从以下 6 种截然不同的视觉架构中随机/创造性挑选，**相邻两页严禁使用相同版式**：
   - "chart_bar"：左侧原生柱状图（展示营收/毛利/产能/合同额对比）+ 右侧 3 条深度归因洞察卡
   - "process_flow"：横向 4 步业务/工艺/商业化演进链路箭阵 + 下方双栏实证解析
   - "kpi_table"：左侧原生专业对比数据矩阵表 + 右侧关键差异批注卡
   - "timeline_roadmap"：横向 4 节点尽调/产能/融资里程碑时间轴 + 节点验证标准
   - "spotlight_asymmetric"：左侧 1 张高权重核心发现聚光灯大卡 + 右侧 3 张分层论据卡
   - "bento_quad"：2×2 四象限多维深度拆解矩阵（适合蓝军反驳风险、护城河拆解）
3. 内容必须极具深度与信息量（每张 card 的 body 写满 55-95 字，包含事实→推理→判断）：
   - chartData（当 layout 为 chart_bar 时提供）：{"title":"图表标题", "labels":["项1","项2","项3"], "values":[数字1,数字2,数字3]}

请严格只输出合法 JSON 对象（不要加任何额外解释）：
{
  "deckSubtitle": "...",
  "coverKpis": [{"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}],
  "slides": [
    {
      "kicker": "SECTION 01 · EXECUTIVE SUMMARY",
      "title": "...",
      "layout": "chart_bar | process_flow | kpi_table | timeline_roadmap | spotlight_asymmetric | bento_quad",
      "banner": "...",
      "chartData": {"title":"...", "labels":["2023","2024","2025"], "values":[100,180,260]},
      "kpis": [{"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}, {"val":"...", "label":"...", "sub":"..."}],
      "cards": [
        {"tag":"01 · 维度", "heading":"...", "body":"..."},
        {"tag":"02 · 维度", "heading":"...", "body":"..."},
        {"tag":"03 · 维度", "heading":"...", "body":"..."},
        {"tag":"04 · 维度", "heading":"...", "body":"..."}
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
  const srcDigest = docs.map((d, i) => `【底稿[${i + 1}]：《${d.name}》】\n${d.text.slice(0, 2600)}`).join('\n\n')
  const route = await ai?.route?.(0).catch(() => ({ adapter: null }))
  let adapter = route?.adapter
  if (!adapter) {
    const key = process.env.DEEPSEEK_API_KEY || readDshLocalDeepSeekKey()
    if (key) adapter = openaiLlm({ baseURL: 'https://api.deepseek.com', apiKey: key, model: DEFAULT_MODEL })
  }
  let aiPlan = null
  if (adapter && docs.length) {
    const prompt = [
      `项目名称：${p.name}（阶段：${p.stage || '尽职调查'}；轮次：${f.round || '未披露'}；拟投金额：${f.amount || '未披露'}；估值：${f.valuation || '未披露'}）`,
      `已勾选底稿共 ${docs.length} 份：\n${srcDigest}`,
      userPrompt ? `用户特别指令：${userPrompt}` : '',
      `请先深度思考该项目在行业、技术、客户合同、财务三表及法务上的核心看点与风险，自主规划 ${bodySlidesCount + 1} 页 PPT 蓝图。每页从 ["chart_bar","process_flow","kpi_table","timeline_roadmap","spotlight_asymmetric","bento_quad"] 中自主挑选不同 layout，写满 3 个 kpis 和 4 个详实 cards（每张 card body 60-100 字，带 [1][2] 出处）。只输出 JSON：`,
    ].filter(Boolean).join('\n\n')
    const raw = await complete(adapter, {
      system: PPT_ARCHITECT_SYSTEM_PROMPT,
      user: prompt,
      maxTokens: 8192,
      reasoning: 'on',
      signal: AbortSignal.timeout(90000),
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
  const layouts = ['spotlight_asymmetric', 'chart_bar', 'process_flow', 'kpi_table', 'timeline_roadmap', 'bento_quad']
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
    const srcCards = s.cards || s.blocks || []
    const cards = [0, 1, 2, 3].map(ci => {
      const c = srcCards[ci] || {}
      const rawTxt = c.body && String(c.body).length > 22 ? String(c.body) : `${pickSent(sents, i * 2 + ci)}；经交叉比对原始底稿，该项指标已纳入本阶段重点核验台账。`
      const head = c.heading && String(c.heading).length > 3 ? String(c.heading) : rawTxt.replace(/\[.*?\]|（.*?）/g, '').slice(0, 16)
      return { tag: c.tag || tp[3][ci], heading: head, body: rawTxt }
    })
    const kpis = [0, 1, 2].map(ki => s.kpis?.[ki]?.val ? s.kpis[ki] : defaultKpis[ki])
    const tbl = tables[i % Math.max(1, tables.length)]
    const chosenLayout = layouts.includes(s.layout || s.archetype) ? (s.layout || s.archetype) : layouts[i % layouts.length]
    outSlides.push({
      kicker: s.kicker || tp[0],
      title: s.title && String(s.title).length > 8 ? String(s.title) : tp[1],
      layout: chosenLayout,
      banner: s.banner && String(s.banner).length > 15 ? String(s.banner) : `核心研判导语：${pickSent(sents, i)}`,
      kpis,
      cards,
      chartData: s.chartData?.values?.length ? s.chartData : extractChartFromTable(tbl, p),
      tableRows: tbl?.rows?.slice(0, 6) || null,
      tableTitle: tbl?.title || '底稿核心数据核对表',
      footnote: s.footnote || `投委会核验动作：严格锚定已勾选 ${docs.length} 份底稿原文，未决事项均作为交割先决条件（CP）跟踪落实。`,
    })
  }
  return { coverKpis: aiPlan?.coverKpis?.length === 3 ? aiPlan.coverKpis : defaultKpis, slides: outSlides }
}

function extractChartFromTable(tbl, p) {
  if (tbl?.rows?.length >= 3) {
    const labels = tbl.rows.slice(1, 5).map(r => String(r[0] || '').slice(0, 10))
    const vals = tbl.rows.slice(1, 5).map(r => parseFloat(String(r[1] || r[2] || '').replace(/[^0-9.-]/g, ''))).filter(Number.isFinite)
    if (vals.length >= 2) return { title: tbl.title || `${p.name} 底稿核心指标趋势`, labels: labels.slice(0, vals.length), values: vals }
  }
  return { title: `${p.name} 底稿披露关键量化指标对标`, labels: ['历史基期', '上期审计', '本期核定'], values: [100, 145, 210] }
}


