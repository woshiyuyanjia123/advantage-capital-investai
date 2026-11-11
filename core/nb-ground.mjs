// 底稿整理与数字核对：成品里的事实只能来自勾选的底稿和项目登记字段。
// prepareSources 把底稿拆成带编号的句子、表格和「名称：数值」条目；checkNumbers 核对成品里的数字是否在底稿里出现过。

/** 文字的视觉宽度：汉字和全角算 1，英文数字算 0.55。排版估算用。 */
export function visualLen(s) {
  let n = 0
  for (const ch of String(s ?? '')) n += /[⺀-鿿豈-﫿＀-￯　-〿]/.test(ch) ? 1 : 0.55
  return n
}

const clean = s => String(s ?? '').replace(/\[第\d+页\]/g, '').replace(/^\s*(?:[-*#>]+|\d+[.、)])\s*/, '').replace(/\s+/g, ' ').trim()
const isPageNo = s => /^\d{1,3}$/.test(s)
const num = s => { const v = parseFloat(String(s).replace(/[,，\s]/g, '')); return Number.isFinite(v) ? v : null }
const numericCell = s => /^[-+]?[\d,，.]+\s*(%|％|万元|亿元|元|万|亿|倍|天|家|人|GWh|MWh|MW|GW)?$/.test(String(s).trim())

/** 一份底稿里的表格：CSV 行（表格类文件解析结果）和连续的「名称：数值」行。 */
function tablesOf(doc, n) {
  const out = []
  const lines = String(doc.text || '').split('\n').map(l => l.trim())
  let title = ''
  let csv = []
  let kv = []
  let kvTitle = ''
  let last = ''
  let inSheet = false
  const taken = new Set()
  const flushCsv = () => {
    if (csv.length >= 2) {
      const w = Math.max(...csv.map(r => r.length))
      out.push({ n, source: doc.name, title: title || doc.name.replace(/\.[^.]+$/, ''), head: csv[0].concat(Array(w - csv[0].length).fill('')), rows: csv.slice(1).map(r => r.concat(Array(w - r.length).fill(''))) })
    }
    csv = []
  }
  const flushKv = () => {
    if (kv.length >= 3) out.push({ n, source: doc.name, title: kvTitle || doc.name.replace(/\.[^.]+$/, ''), head: ['项目', '数值'], rows: kv, keyValue: true })
    kv = []
  }
  for (const raw of lines) {
    const l = raw.replace(/\[第\d+页\]/g, '').trim()
    if (!l) { flushCsv(); continue }
    if (l.startsWith('## 工作表：')) { flushCsv(); flushKv(); title = l.replace('## 工作表：', '').trim(); inSheet = true; taken.add(l); continue }
    if (l.startsWith('#')) inSheet = false
    // 先认「名称：数值」：数值里可能带千分位逗号（营业收入：65,300），不能当成逗号分隔的表格行
    const m = l.replace(/^[-*]\s*/, '').match(/^([^：:,，]{2,16})[：:]\s*(.{1,40})$/)
    if (m && /\d/.test(m[2]) && !/[。；]/.test(m[2])) { flushCsv(); if (!kv.length) kvTitle = /单位|数据|指标|情况|概况|计划/.test(last) ? last : ''; kv.push([m[1].trim(), m[2].trim()]); continue }
    const cells = l.split(',').map(c => c.trim())
    if ((inSheet ? cells.length >= 2 : cells.length >= 3) && !/^[#\-*>]/.test(l) && !/[。；：]/.test(l) && cells.every(c => c.length <= 40)) { flushKv(); csv.push(cells); taken.add(l); continue }
    flushCsv(); flushKv()
    if (!isPageNo(l)) last = l.replace(/^#+\s*/, '')
  }
  flushCsv(); flushKv()
  return { tables: out, taken }
}

const TOPIC = [
  ['todo', /待核实|尚未|未提供|未披露|缺失|有待|需补充|未判决|未取得/],
  ['risk', /风险|下降|下滑|诉讼|仲裁|处罚|依赖|波动|为负|逾期|集中度|差异|低于|亏损|减值|对赌|回购/],
  ['finance', /收入|利润|毛利|现金流|应收|存货|资产|负债|估值|融资|亿元|万元|回款|订单|合同金额/],
  ['business', /产品|客户|产能|出货|认证|研发|技术|专利|渠道|市场|团队|创始人|海外|供应商/],
  ['overview', /企业名称|成立|注册|法定代表人|所属行业|主营业务|概况|总部/],
]

/**
 * 整理勾选的底稿。docs: [{ name, text }]。返回：
 *  sources  [{ n, name, chars }]
 *  passages [{ n, text, topics }]   去掉页码和标题后的句子
 *  tables   [{ n, source, title, head, rows, keyValue? }]
 *  corpus   全部底稿文字加项目登记字段（数字核对用）
 */
export function prepareSources(p, docs = []) {
  const sources = docs.map((d, i) => ({ n: i + 1, name: d.name, chars: String(d.text || '').length }))
  const passages = []
  const tables = []
  docs.forEach((d, i) => {
    const n = i + 1
    const t = tablesOf(d, n)
    tables.push(...t.tables)
    const seen = new Set()
    for (const line of String(d.text || '').split('\n')) {
      if (t.taken.has(line.replace(/\[第\d+页\]/g, '').trim())) continue // 表格行已进 tables
      for (const part of line.split(/。|；/)) {
        const s = clean(part)
        if (s.length < 8 || s.length > 200 || isPageNo(s) || seen.has(s) || /^第\d+页$/.test(s)) continue
        // 封面和标题行：很短又没有冒号，或者没有标点和数字
        if ((visualLen(s) < 12 && !/[：:]/.test(s)) || (s.length < 16 && !/[，,：:；、%\d]/.test(s))) continue
        seen.add(s)
        passages.push({ n, text: s, topics: TOPIC.filter(([, re]) => re.test(s)).map(([k]) => k) })
      }
    }
  })
  const f = p?.fields ?? {}
  // 表格单元格逐个加入，避免相邻的三位数单元格（100,200,300）被当成一个带千分位的数；文件名里的年份也算出处
  const corpus = [docs.map(d => d.text).join('\n'), tables.flatMap(t => [...t.head, ...t.rows.flat()]).join('\n'), docs.map(d => d.name).join('\n'), p?.name, p?.desc, ...Object.values(f).map(v => String(v ?? ''))].join('\n')
  return { sources, passages, tables, corpus }
}

/** 文本里的数字，统一成不带千分位的写法。忽略引用编号 [n]、序号和一位整数。 */
export function numbersIn(text) {
  const out = []
  // 引用编号和序号用等长空格盖掉，保证返回的位置 at 仍然对应原文
  const blank = m => ' '.repeat(m.length)
  const s = String(text ?? '').replace(/\[\d+(?:\s*[,，、]\s*\d+)*\]/g, blank).replace(/(?<![\d.])\d{1,2}[.、)]\s/g, blank)
  // 千分位必须三位一组，这样逗号分隔的表格单元格（12800,2025-11）不会连成一个数
  // 千分位写法前后不能再接数字，否则 900,2100 这样的相邻单元格会被连成一个数
  for (const m of s.matchAll(/(?<![\d.])\d{1,3}(?:,\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    const raw = m[0]
    const v = raw.replace(/,/g, '')
    if (/^\d$/.test(v) || /^0\d$/.test(v)) continue
    out.push({ raw, v, at: m.index })
  }
  return out
}

/**
 * 核对成品里的数字。底稿里出现过的算「有出处」；所在句子写明「测算」「合计」「折合」的算「测算」；其余列为「待核对」。
 * 返回 { total, matched, derived, unmatched: [{ value, context }] }。
 */
export function checkNumbers(text, corpus) {
  const have = new Set(numbersIn(corpus).map(x => x.v))
  // 亿元和万元互换的写法：6.8 亿元 ↔ 68000 万元
  for (const v of [...have]) {
    const x = Number(v)
    if (!Number.isFinite(x)) continue
    have.add(String(+(x * 10000).toFixed(4)))
    have.add(String(+(x / 10000).toFixed(4)))
  }
  const res = { total: 0, matched: 0, derived: 0, unmatched: [] }
  const src = String(text ?? '')
  const seen = new Set()
  for (const x of numbersIn(src)) {
    res.total++
    if (have.has(x.v) || have.has(String(Number(x.v)))) { res.matched++; continue }
    const from = Math.max(0, src.lastIndexOf('。', x.at) + 1, src.lastIndexOf('\n', x.at) + 1)
    const ends = [src.indexOf('。', x.at), src.indexOf('\n', x.at)].filter(i => i >= 0)
    const sentence = src.slice(from, ends.length ? Math.min(...ends) : src.length).trim()
    if (/测算|估算|推算|合计|折合|相当于/.test(sentence)) { res.derived++; continue }
    if (seen.has(x.v)) continue
    seen.add(x.v)
    res.unmatched.push({ value: x.raw, context: sentence.slice(0, 80) })
  }
  return res
}

export const checkLine = c => c.total
  ? `数字核对：共 ${c.total} 处，${c.matched} 处与底稿原文一致${c.derived ? `，${c.derived} 处为测算` : ''}${c.unmatched.length ? `，${c.unmatched.length} 处在底稿里没找到` : ''}`
  : '成品中没有出现数字'

/** 给模型看的底稿正文：每份带编号，总长度受 budget 限制，长文件按比例截取并说明。 */
export function sourceDigest(docs, budget = 60000) {
  const total = docs.reduce((a, d) => a + String(d.text || '').length, 0) || 1
  return docs.map((d, i) => {
    const t = String(d.text || '')
    const cap = total <= budget ? t.length : Math.max(1500, Math.floor(budget * t.length / total))
    return `【底稿 [${i + 1}]《${d.name}》】\n${t.slice(0, cap)}${t.length > cap ? `\n（本份底稿共 ${t.length} 字，此处给出前 ${cap} 字）` : ''}`
  }).join('\n\n')
}

/** 表格里可以画图的一列：返回 { labels, values, name, unit }；不满足条件返回 null。 */
export function chartable(t) {
  if (!t?.rows?.length || t.rows.length < 2 || t.rows.length > 8) return null
  for (let c = 1; c < t.head.length; c++) {
    const cells = t.rows.map(r => r[c])
    if (!cells.every(numericCell)) continue
    const values = cells.map(num)
    if (values.some(v => v === null)) continue
    const unit = (String(t.head[c]).match(/[（(]([^）)]+)[）)]/) || [])[1] || (String(cells[0]).match(/(%|万元|亿元|元|倍|天)$/) || [])[1] || ''
    return { labels: t.rows.map(r => String(r[0]).slice(0, 14)), values, name: String(t.head[c]).replace(/[（(][^）)]+[）)]/, '').trim() || '数值', unit }
  }
  return null
}

export const cite = n => `[${n}]`
export const projectFacts = p => {
  const f = p?.fields ?? {}
  return [['项目', p?.name], ['阶段', p?.stage], ['轮次', f.round], ['拟投金额', f.amount], ['估值', f.valuation], ['关键条款', f.terms], ['业务简介', p?.desc]].filter(([, v]) => v && String(v).trim() && v !== '待定').map(([k, v]) => [k, String(v)])
}
