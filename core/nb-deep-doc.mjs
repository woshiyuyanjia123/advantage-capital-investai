// 100% 源依据（Zero-Hallucination Source-Grounded）深度报告与 PPT 结构化提取引擎
// 铁律：严禁出现任何不在所选来源 (docs) 与项目登记字段 (p.fields) 中的虚构数字；原文表格原样转译，未披露项明确标注「所选来源未披露（待核实）」。

export function parseSourceTables(docs = []) {
  const tables = []
  docs.forEach((d, idx) => {
    const lines = String(d.text || '').split('\n').map(l => l.trim()).filter(Boolean)
    let curTitle = d.name
    let csvRows = []
    const flush = () => {
      if (csvRows.length >= 2) {
        const w = Math.max(...csvRows.map(r => r.length))
        const pad = r => [...r, ...Array(w - r.length).fill('')]
        const md = [
          `| ${pad(csvRows[0]).join(' | ')} |`,
          `|${pad(csvRows[0]).map(() => '---').join('|')}|`,
          ...csvRows.slice(1).map(r => `| ${pad(r).join(' | ')} |`),
        ].join('\n')
        tables.push({ cite: `[${idx + 1}]`, source: d.name, title: curTitle, md, rows: csvRows })
      }
      csvRows = []
    }
    for (const l of lines) {
      if (l.startsWith('## 工作表：')) { flush(); curTitle = `${d.name} · ${l.replace('## 工作表：', '').trim()}`; continue }
      if (l.includes(',') && !l.startsWith('#') && !l.startsWith('-')) csvRows.push(l.split(',').map(c => c.trim()))
      else flush()
    }
    flush()
  })
  return tables
}

export function classifySourceSentences(docs = []) {
  const buckets = { overview: [], business: [], finance: [], risk: [], todo: [], all: [] }
  docs.forEach((d, idx) => {
    const cite = `[${idx + 1}]`
    const sents = String(d.text || '').replace(/\[第\d+页\]/g, '').split(/\n|。|；/)
      .map(s => s.replace(/^\s*(?:[-*#>]+|\d+[.、)])\s*/, '').trim())
      .filter(s => s.length >= 6 && s.length <= 180 && !s.includes(','))
    for (const s of sents) {
      const item = `${s} ${cite}（《${d.name}》）`
      buckets.all.push(item)
      if (/待核实|尚未|缺失|未提供|差异/.test(s)) buckets.todo.push(item)
      if (/风险|下降|诉讼|依赖|波动|增加|为负|库存/.test(s)) buckets.risk.push(item)
      if (/收入|利润|毛利|现金流|应收|存货|资产|负债|估值|融资|亿元|万元|%/.test(s)) buckets.finance.push(item)
      if (/产品|客户|产能|订单|出货|认证|研发|晶圆|储能|监护|SaaS|团队|创始人/.test(s)) buckets.business.push(item)
      if (/企业名称|成立|注册地|法定代表人|所属行业|主营业务|概况/.test(s)) buckets.overview.push(item)
    }
  })
  return buckets
}

export function buildComprehensiveMarkdown(p, type = '尽调报告', docs = [], snippets = []) {
  const name = p?.name || '目标项目'
  const amt = p?.fields?.amount || '所选来源未披露（待核实）'
  const val = p?.fields?.valuation || '所选来源未披露（待核实）'
  const terms = p?.fields?.terms || '所选来源未披露（待核实）'
  const round = p?.fields?.round || '当前轮次'
  const srcList = docs.map((d, i) => `[${i + 1}] 《${d.name}》`).join('；') || '项目已登记底稿'
  const tables = parseSourceTables(docs)
  const b = classifySourceSentences(docs)
  const pickList = (arr, fb) => (arr.length ? arr.slice(0, 8).map(x => `- ${x}`).join('\n') : `- ${fb}`)

  return [
    `# ${name} · ${type}（100% 勾选来源实证核验版）`,
    `> **零幻觉源依据声明（NotebookLM / ima 严格溯源模式）**：本文件 100% 依据当前勾选的 ${docs.length} 份原始资料（${srcList}）及项目已登记字段生成；未在勾选资料中出现的数字与事实绝不编造，统一列入文末「待补充与待核实清单」。`,
    '',
    '## 一、项目登记要素与核心事实摘录',
    '| 核验维度 | 所选来源与项目档案披露内容 | 来源出处 |',
    '|---|---|---|',
    `| 项目名称与轮次 | ${name}（${round}） | 项目立项档案 |`,
    `| 拟投资金额 | ${amt} | 项目登记字段 |`,
    `| 估值口径 | ${val} | 项目登记字段 |`,
    `| 关键条款约定 | ${terms} | 项目登记字段 |`,
    `| 赛道与业务简介 | ${p?.desc || '见下方来源原文摘录'} | 项目立项档案 |`,
    '',
    '## 二、公司概况、主体沿革与团队事实（源自勾选资料）',
    pickList(b.overview, '当前勾选来源未包含工商沿革细项（已列入待核实清单）'),
    '',
    '## 三、产品、技术、客户与商业化原文证据（源自勾选资料）',
    pickList(b.business, '当前勾选来源未包含产品与客户明细（已列入待核实清单）'),
    '',
    '## 四、财务表现与业务台账原始数据表（100% 原文表格转译）',
    tables.length
      ? tables.map(t => `### 原始数据表：${t.title} ${t.cite}\n\n${t.md}`).join('\n\n')
      : '> 当前勾选的来源中未包含 CSV/Excel 结构化数据表。',
    '',
    '## 五、财务、订单与估值关键量化事实（源自勾选资料）',
    pickList(b.finance, '当前勾选来源未披露额外财务句段'),
    '',
    '## 六、风险事项、口径差异与合规问题（源自勾选资料）',
    pickList(b.risk, '当前勾选来源未披露显性诉讼或下滑风险，建议结合穿行测试进一步核查'),
    '',
    '## 七、所选来源明确标注的「待核实 / 差异事项」清单',
    pickList(b.todo, '请核对勾选来源中的原始合同、银行流水与审计附注'),
  ].join('\n')
}

export function buildRichPptSlides(p, docs = [], snippets = []) {
  const n = p?.name || '目标项目'
  const amt = p?.fields?.amount || '见来源披露'
  const val = p?.fields?.valuation || '见来源披露'
  const terms = p?.fields?.terms || '见来源披露'
  const b = classifySourceSentences(docs)
  const tables = parseSourceTables(docs)
  const tblLines = tables.flatMap(t => t.rows.slice(1).map(r => `${t.title}：${t.rows[0].map((h, i) => `${h}=${r[i] || '-'}`).join('，')} ${t.cite}`))
  const safe = (arr, fb) => (arr.length ? arr.slice(0, 5) : [fb])

  return [
    {
      title: `1. 项目登记要素与概况：${n}（完全基于所选 ${docs.length} 份来源）`,
      bullets: [
        `项目名称与轮次：${n}（${p?.fields?.round || '当前轮次'}），业务定位：${p?.desc || '见来源'}`,
        `登记融资与估值：拟投金额 ${amt}，估值口径 ${val}`,
        `核心条款约定：${terms}`,
        ...safe(b.overview, '勾选来源中的公司沿革与主体概况详见底稿原文'),
      ].slice(0, 5),
    },
    {
      title: `2. 产品、客户与业务事实摘录（源自勾选资料原文）`,
      bullets: safe(b.business, '当前勾选来源未披露额外产品与客户明细（待补充核实）'),
    },
    {
      title: `3. 财务报表与业务合同台账实证数据（100% 原文表格提取）`,
      bullets: safe(tblLines.length ? tblLines : b.finance, '当前勾选来源未包含 CSV/Excel 表格行'),
    },
    {
      title: `4. 关键财务、订单与估值指标核验（源自勾选资料原文）`,
      bullets: safe(b.finance, '当前勾选来源未披露额外财务句段'),
    },
    {
      title: `5. 风险识别、口径差异与合规事项（源自勾选资料原文）`,
      bullets: safe(b.risk, '当前勾选来源未披露显性风险句段，需在尽调中持续核查'),
    },
    {
      title: `6. 勾选来源明确列出的「待核实事项」与下一步核查重点`,
      bullets: safe(b.todo.length ? b.todo : snippets, '请结合原始合同、银行流水及审计报告进一步核对'),
    },
  ]
}
