// 演示文稿：页面由内容块自由组合（要点、表格、图表、数字、步骤、对比、引语、段落），版式按块的种类和数量排。
// normalizeDeck 清洗模型给的页面；buildOfflineDeck 在没有模型时只用底稿里的原文、表格和数字组稿；renderDeck 输出 pptx。
import { visualLen, chartable, projectFacts } from './nb-ground.mjs'

const W = 13.333, H = 7.5, MX = 0.7, CW = W - MX * 2
const MAC = process.platform === 'darwin'
const F = { serif: MAC ? 'Songti SC' : 'SimSun', sans: MAC ? 'PingFang SC' : 'DengXian', num: 'Georgia' }
export const DECK_THEMES = {
  mck: { name: '松绿', ink: '1B1A17', sub: '5F5B52', line: 'D8D4C8', soft: 'F1EEE6', bg: 'FCFBF8', acc: '2D5A4A', acc2: '9A6B1E', mute: '9C978A' },
  swiss: { name: '藏青', ink: '17191D', sub: '5A5F68', line: 'D5D8DD', soft: 'EEF0F2', bg: 'FBFBFA', acc: '27405E', acc2: '8A5A2B', mute: '9AA0A8' },
  emerald: { name: '赭石', ink: '1E1A17', sub: '625A52', line: 'DAD3C9', soft: 'F3EEE7', bg: 'FCFAF7', acc: '7A4A2A', acc2: '2F5D62', mute: '9E958A' },
}
const BLOCKS = ['points', 'table', 'chart', 'stats', 'steps', 'compare', 'quote', 'text']

const str = (v, max = 400) => String(v ?? '').replace(/\p{Extended_Pictographic}|️/gu, '').replace(/\*\*/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max)
const arr = v => Array.isArray(v) ? v : []
const toNum = v => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[,，\s]/g, '')); return Number.isFinite(x) ? x : null }

function normBlock(b) {
  if (!b || typeof b !== 'object') return null
  const type = BLOCKS.includes(b.type) ? b.type : null
  if (type === 'points' || type === 'steps') {
    const items = arr(b.items).map(it => typeof it === 'string' ? { head: '', text: str(it, 260) } : { head: str(it?.head, 40), text: str(it?.text ?? it?.body, 260) }).filter(it => it.head || it.text).slice(0, type === 'steps' ? 5 : 6)
    return items.length >= (type === 'steps' ? 2 : 1) ? { type, items } : null
  }
  if (type === 'table') {
    const head = arr(b.head).map(h => str(h, 30)).slice(0, 7)
    const rows = arr(b.rows).map(r => arr(r).map(c => str(c, 60)).slice(0, head.length)).filter(r => r.some(Boolean)).slice(0, 12)
    return head.length >= 2 && rows.length ? { type, head, rows: rows.map(r => r.concat(Array(head.length - r.length).fill(''))), note: str(b.note, 120) } : null
  }
  if (type === 'chart') {
    const labels = arr(b.labels).map(l => str(l, 16))
    const series = (arr(b.series).length ? arr(b.series) : [{ name: b.name, values: b.values }])
      .map(s => ({ name: str(s?.name, 24) || '数值', values: arr(s?.values).map(toNum) }))
      .filter(s => s.values.length === labels.length && s.values.every(v => v !== null)).slice(0, 4)
    const kind = ['bar', 'line', 'pie'].includes(b.kind) ? b.kind : 'bar'
    return labels.length >= 2 && labels.length <= 12 && series.length ? { type, kind: kind === 'pie' && series[0].values.some(v => v < 0) ? 'bar' : kind, title: str(b.title, 50), unit: str(b.unit, 16), labels, series: kind === 'pie' ? series.slice(0, 1) : series } : null
  }
  if (type === 'stats') {
    const items = arr(b.items).map(it => ({ value: str(it?.value ?? it?.val, 18), label: str(it?.label, 30), note: str(it?.note ?? it?.sub, 70) })).filter(it => it.value && it.label).slice(0, 4)
    return items.length >= 2 ? { type, items } : null
  }
  if (type === 'compare') {
    const side = s => ({ head: str(s?.head, 30), items: arr(s?.items).map(x => str(typeof x === 'string' ? x : x?.text, 160)).filter(Boolean).slice(0, 5) })
    const left = side(b.left), right = side(b.right)
    return left.items.length && right.items.length ? { type, left, right } : null
  }
  if (type === 'quote') { const text = str(b.text, 220); return text ? { type, text, source: str(b.source, 60) } : null }
  if (type === 'text') { const text = str(b.text, 700); return text ? { type, text } : null }
  return null
}

/** 清洗模型给的页面：去掉不合规的块和空页，截断超长文字。 */
export function normalizeDeck(raw, base = {}) {
  const slides = arr(raw?.slides).map(s => {
    const blocks = arr(s?.blocks).map(normBlock).filter(Boolean).slice(0, 3)
    const title = str(s?.title, 70)
    if (!title || !blocks.length) return null
    return { kicker: str(s?.kicker ?? s?.section, 28), title, lede: str(s?.lede, 150), blocks, takeaway: str(s?.takeaway, 110), cites: arr(s?.cites).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 6), notes: str(s?.notes, 900) }
  }).filter(Boolean)
  return {
    ...base,
    title: str(raw?.title, 60) || base.title,
    subtitle: str(raw?.subtitle, 90) || base.subtitle || '',
    stats: arr(raw?.stats).map(it => ({ value: str(it?.value, 18), label: str(it?.label, 30), note: str(it?.note, 60) })).filter(it => it.value && it.label).slice(0, 4),
    gaps: arr(raw?.gaps).map(g => str(g, 120)).filter(Boolean).slice(0, 8),
    slides,
  }
}

/** 成品里的全部文字（数字核对用）。 */
export function deckText(deck) {
  const parts = [deck.title, deck.subtitle, ...arr(deck.stats).flatMap(s => [s.value, s.label, s.note])]
  for (const s of arr(deck.slides)) {
    parts.push(s.title, s.lede, s.takeaway)
    for (const b of s.blocks) {
      if (b.type === 'points' || b.type === 'steps') parts.push(...b.items.flatMap(i => [i.head, i.text]))
      else if (b.type === 'table') parts.push(b.head.join(' '), ...b.rows.map(r => r.join(' ')), b.note)
      else if (b.type === 'chart') parts.push(b.title, b.labels.join(' '), ...b.series.map(x => x.values.join(' ')))
      else if (b.type === 'stats') parts.push(...b.items.flatMap(i => [i.value, i.label, i.note]))
      else if (b.type === 'compare') parts.push(b.left.head, ...b.left.items, b.right.head, ...b.right.items)
      else parts.push(b.text)
    }
  }
  return parts.filter(Boolean).join('\n')
}

/** 人工编辑用的大纲：每页一个二级标题，块转成列表或表格。 */
export function deckToMarkdown(deck) {
  const out = [`# ${deck.title}`, deck.subtitle || '']
  for (const s of arr(deck.slides)) {
    out.push('', `## ${s.title}`)
    if (s.lede) out.push(s.lede)
    for (const b of s.blocks) {
      if (b.type === 'points' || b.type === 'steps') out.push(...b.items.map(i => `- ${i.head ? `**${i.head}**：` : ''}${i.text}`))
      else if (b.type === 'table') out.push('', `| ${b.head.join(' | ')} |`, `|${b.head.map(() => '---').join('|')}|`, ...b.rows.map(r => `| ${r.join(' | ')} |`), '')
      else if (b.type === 'chart') out.push('', `| ${['', ...b.labels].join(' | ')} |`, `|${['', ...b.labels].map(() => '---').join('|')}|`, ...b.series.map(x => `| ${[x.name, ...x.values].join(' | ')} |`), '')
      else if (b.type === 'stats') out.push(...b.items.map(i => `- **${i.value}** ${i.label}${i.note ? `（${i.note}）` : ''}`))
      else if (b.type === 'compare') out.push(`- **${b.left.head}**：${b.left.items.join('；')}`, `- **${b.right.head}**：${b.right.items.join('；')}`)
      else if (b.type === 'quote') out.push(`> ${b.text}${b.source ? `（${b.source}）` : ''}`)
      else out.push(b.text)
    }
    if (s.takeaway) out.push('', `判断：${s.takeaway}`)
  }
  return out.join('\n')
}

/** 页面编辑器和 Markdown 成果转成演示文稿：每页一组要点。 */
export function deckFromOutline({ title, subtitle, slides = [], sources = [] }) {
  return {
    title: str(title, 60) || '演示文稿', subtitle: str(subtitle, 90), stats: [], gaps: [],
    sources: sources.map((s, i) => ({ n: i + 1, name: s.name || String(s) })),
    slides: slides.map(s => {
      const items = arr(s.bullets ?? s.items).map(x => str(typeof x === 'string' ? x : x?.text, 260)).filter(Boolean)
      return { kicker: '', title: str(s.title, 70) || '未命名页', lede: '', blocks: items.length ? [{ type: 'points', items: items.slice(0, 6).map(text => ({ head: '', text })) }] : [], takeaway: '', cites: [], notes: str(s.notes, 900) }
    }).filter(s => s.title),
  }
}

/**
 * 没有模型时的组稿：只排底稿里已有的东西（登记要素、原文表格、按主题归类的原文句子、待核实事项），
 * 不补套话、不造数字；材料不够时页数少于要求的页数。
 */
export function buildOfflineDeck(p, G, { pageCount = 8 } = {}) {
  const name = p.name
  const slides = []
  const withCite = x => `${x.text} [${x.n}]`
  const pick = (topic, used, max = 5) => {
    const out = []
    for (const x of G.passages) {
      if (out.length >= max) break
      if (!x.topics.includes(topic) || used.has(x.text)) continue
      used.add(x.text); out.push(x)
    }
    return out
  }
  const used = new Set()
  const cites = list => [...new Set(list.map(x => x.n))]
  const facts = projectFacts(p)
  const overview = pick('overview', used, 4)
  if (facts.length || overview.length) {
    const blocks = []
    if (facts.length) blocks.push({ type: 'table', head: ['登记要素', '内容'], rows: facts.map(([k, v]) => [k, v]), note: '来自项目登记信息' })
    if (overview.length) blocks.push({ type: 'points', items: overview.map(x => ({ head: '', text: withCite(x) })) })
    slides.push({ kicker: '项目概况', title: `${name}：登记要素与主体情况`, lede: '', blocks, takeaway: '', cites: cites(overview), notes: '' })
  }
  for (const t of G.tables.slice(0, Math.max(2, pageCount - 5))) {
    const blocks = [{ type: 'table', head: t.head, rows: t.rows.slice(0, 10), note: t.rows.length > 10 ? `共 ${t.rows.length} 行，其余见底稿` : '' }]
    const c = chartable(t)
    if (c && !t.keyValue) blocks.push({ type: 'chart', kind: 'bar', title: c.name, unit: c.unit, labels: c.labels, series: [{ name: c.name, values: c.values }] })
    slides.push({ kicker: '底稿数据', title: `${t.title}（《${t.source.replace(/\.[^.]+$/, '')}》原表）`, lede: '', blocks, takeaway: '', cites: [t.n], notes: '' })
  }
  const thin = []
  const section = (topic, kicker, title) => {
    const list = pick(topic, used, 5)
    if (list.length >= 2) slides.push({ kicker, title, lede: '', blocks: [{ type: 'points', items: list.map(x => ({ head: '', text: withCite(x) })) }], takeaway: '', cites: cites(list), notes: '' })
    else thin.push(...list.map(x => ({ ...x, kicker })))
  }
  section('finance', '财务与订单', `${name}：底稿披露的财务与订单数据`)
  section('business', '业务与客户', `${name}：产品、客户与经营情况`)
  section('risk', '风险与差异', `${name}：底稿提到的风险和口径差异`)
  section('todo', '待核实', `${name}：底稿里标注的待核实事项`)
  if (thin.length) slides.push({ kicker: '其他要点', title: `${name}：底稿里的其他要点`, lede: '', blocks: [{ type: 'points', items: thin.slice(0, 5).map(x => ({ head: x.kicker, text: withCite(x) })) }], takeaway: '', cites: cites(thin), notes: '' })
  return {
    title: name, subtitle: `底稿摘编 · 依据 ${G.sources.length} 份底稿`,
    stats: facts.filter(([k]) => ['轮次', '拟投金额', '估值'].includes(k)).map(([k, v]) => ({ value: v.replace(/^投前\s*/, ''), label: k === '估值' && /投前/.test(v) ? '投前估值' : k, note: '' })).filter(s => visualLen(s.value) <= 9),
    gaps: [], slides: slides.slice(0, Math.max(2, pageCount - 2)), sources: G.sources,
  }
}

// ───────── 渲染 ─────────
function fitPt(text, w, h, max, min, lh = 1.32) {
  for (let pt = max; pt >= min; pt -= 0.5) {
    const per = Math.max(3, Math.floor(w * 72 / pt))
    const lines = String(text).split('\n').reduce((a, seg) => a + Math.max(1, Math.ceil(visualLen(seg) / per)), 0)
    if (lines * pt * lh / 72 <= h) return pt
  }
  return min
}
const linesAt = (text, w, pt) => String(text).split('\n').reduce((a, seg) => a + Math.max(1, Math.ceil(visualLen(seg) / Math.max(3, Math.floor(w * 72 / pt)))), 0)
const isNumCell = s => /^[-+]?[\d,，.]+\s*(%|％|万元|亿元|元|万|亿|倍|天|家|人|GWh|MWh|MW)?$/.test(String(s).trim())

function draw(pptx, sl, T, b, r) {
  const hair = (x, y, w, h = 0) => sl.addShape(pptx.ShapeType.line, { x, y, w, h, line: { color: T.line, width: 0.75 } })
  const txt = (text, o) => sl.addText(Array.isArray(text) ? text : String(text), { margin: 0, fontFace: F.sans, color: T.ink, valign: 'top', ...o })

  if (b.type === 'points' || b.type === 'compare-col') {
    // 按内容高度往下排：条目少、句子短时用大字，不把几行字拉满整页
    const items = b.items
    const numbered = b.type === 'points' && items.length > 1 && items.every(i => i.head)
    const tx = r.x + (numbered ? 0.62 : 0), tw = r.w - (numbered ? 0.62 : 0)
    let gap = 0.3
    const headH = pt => (pt + 1.5) * 1.3 / 72 + 0.05
    const textH = (it, pt) => linesAt(it.text, tw, pt) * pt * 1.34 / 72
    const need = pt => items.reduce((a, it) => a + (it.head ? headH(pt) : 0) + (it.text ? textH(it, pt) : 0), 0) + gap * (items.length - 1)
    let pt = items.length <= 4 && Math.max(...items.map(i => visualLen(i.text))) <= 70 ? 16 : 14
    if (need(pt) > r.h) gap = 0.2
    while (pt > 9.5 && need(pt) > r.h) pt -= 0.5
    let y = r.y
    items.forEach((it, i) => {
      if (i) { hair(r.x, y + gap / 2, r.w); y += gap }
      if (numbered) txt(String(i + 1).padStart(2, '0'), { x: r.x, y: y + 0.01, w: 0.5, h: 0.34, fontSize: pt + 2, color: T.acc, fontFace: F.num })
      if (it.head) { txt(it.head, { x: tx, y, w: tw, h: headH(pt), fontSize: pt + 1.5, bold: true }); y += headH(pt) }
      if (it.text) { const h = textH(it, pt); txt(it.text, { x: tx, y, w: tw, h: h + 0.04, fontSize: pt, color: it.head ? T.sub : T.ink, lineSpacingMultiple: 1.2 }); y += h }
    })
    return
  }
  if (b.type === 'steps') {
    const n = b.items.length, gap = 0.3, cw = (r.w - gap * (n - 1)) / n
    sl.addShape(pptx.ShapeType.line, { x: r.x, y: r.y + 0.52, w: r.w, h: 0, line: { color: T.ink, width: 0.75 } })
    const bodyH = r.h - 1.2
    const pt = Math.min(...b.items.map(i => fitPt(i.text, cw, bodyH, b.items.length <= 4 ? 15 : 13, 9.5)))
    b.items.forEach((it, i) => {
      const x = r.x + i * (cw + gap)
      txt(String(i + 1).padStart(2, '0'), { x, y: r.y, w: cw, h: 0.44, fontSize: 22, color: T.acc, fontFace: F.num })
      sl.addShape(pptx.ShapeType.rect, { x, y: r.y + 0.49, w: 0.42, h: 0.06, fill: { color: T.acc }, line: { color: T.acc, width: 0 } })
      txt(it.head, { x, y: r.y + 0.7, w: cw, h: 0.42, fontSize: fitPt(it.head, cw, 0.42, 14, 11), bold: true })
      txt(it.text, { x, y: r.y + 1.18, w: cw, h: bodyH, fontSize: pt, color: T.sub, lineSpacingMultiple: 1.18 })
    })
    return
  }
  if (b.type === 'stats') {
    const n = b.items.length, cw = r.w / n
    b.items.forEach((it, i) => {
      const x = r.x + i * cw + (i ? 0.28 : 0), w = cw - (i ? 0.28 : 0) - 0.1
      if (i) sl.addShape(pptx.ShapeType.line, { x: r.x + i * cw, y: r.y + 0.05, w: 0, h: Math.min(r.h, 1.5) - 0.1, line: { color: T.line, width: 0.75 } })
      const vpt = fitPt(it.value, w, 0.62, r.h > 2 ? 40 : 30, 16, 1.15)
      txt(it.value, { x, y: r.y, w, h: 0.66, fontSize: vpt, color: T.acc, fontFace: /^[\d\s.,%+\-~≈]+$/.test(it.value) ? F.num : F.serif, bold: !/^[\d\s.,%+\-~≈]+$/.test(it.value), valign: 'bottom' })
      txt(it.label, { x, y: r.y + 0.74, w, h: 0.3, fontSize: 12, bold: true })
      if (it.note) txt(it.note, { x, y: r.y + 1.06, w, h: Math.max(0.3, r.h - 1.06), fontSize: fitPt(it.note, w, Math.max(0.3, r.h - 1.06), 10.5, 9), color: T.sub })
    })
    return
  }
  if (b.type === 'table') {
    const cols = b.head.length
    const noteH = b.note ? 0.3 : 0
    const rowsN = b.rows.length + 1
    const rowH = Math.max(0.3, Math.min(0.52, (r.h - noteH) / rowsN))
    const weights = b.head.map((h, c) => Math.max(visualLen(h), ...b.rows.map(x => visualLen(x[c]))) + 2)
    const clamp = weights.map(w => Math.min(w, 34))
    const sum = clamp.reduce((a, x) => a + x, 0)
    const colW = clamp.map(w => +(r.w * w / sum).toFixed(3))
    const perIn = Math.max(...b.rows.map(row => Math.max(...row.map((c, i) => visualLen(c) / colW[i]))), ...b.head.map((h, i) => visualLen(h) / colW[i]))
    const pt = Math.max(9, Math.min(12.5, rowH > 0.4 ? 12.5 : 11, 72 / perIn * 1.9))
    const numCol = b.head.map((_, c) => b.rows.every(x => !x[c] || isNumCell(x[c])) && b.rows.some(x => x[c]))
    const none = { type: 'none' }
    const cell = (text, c, o) => ({ text: String(text ?? ''), options: { fontFace: F.sans, fontSize: pt, color: T.ink, align: numCol[c] && c ? 'right' : 'left', valign: 'middle', ...o } })
    const rows = [
      b.head.map((h, c) => cell(h, c, { bold: true, color: T.sub, fontSize: Math.max(9, pt - 1), border: [none, none, { type: 'solid', pt: 1, color: T.ink }, none] })),
      ...b.rows.map((row, ri) => row.map((v, c) => cell(v, c, { bold: c === 0 && cols > 2, border: [none, none, { type: 'solid', pt: 0.5, color: ri === b.rows.length - 1 ? T.ink : T.line }, none] }))),
    ]
    sl.addTable(rows, { x: r.x, y: r.y, w: r.w, colW, rowH, margin: [0.03, 0.1, 0.03, 0.04] })
    if (b.note) txt(b.note, { x: r.x, y: r.y + rowH * rowsN + 0.08, w: r.w, h: 0.26, fontSize: 9.5, color: T.sub })
    return
  }
  if (b.type === 'chart') {
    const headH = b.title ? 0.36 : 0
    if (b.title) txt([{ text: b.title, options: { bold: true, fontSize: 12, color: T.ink } }, ...(b.unit ? [{ text: `　单位：${b.unit}`, options: { fontSize: 9.5, color: T.sub } }] : [])], { x: r.x, y: r.y, w: r.w, h: 0.3, fontFace: F.sans })
    const data = b.series.map(s => ({ name: s.name, labels: b.labels, values: s.values }))
    const colors = [T.acc, T.acc2, T.mute, T.sub]
    const common = { x: r.x - 0.08, y: r.y + headH, w: r.w + 0.16, h: r.h - headH, chartColors: b.kind === 'pie' ? colors : colors.slice(0, data.length), showLegend: b.kind === 'pie' || data.length > 1, legendPos: 'b', legendFontSize: 10, legendFontFace: F.sans, legendColor: T.sub, showValue: true, dataLabelFontSize: 10, dataLabelFontFace: F.sans, dataLabelColor: T.ink, dataLabelFormatCode: '#,##0.##' }
    if (b.kind === 'pie') sl.addChart(pptx.ChartType.doughnut, data, { ...common, holeSize: 58, showPercent: true, showValue: false, dataLabelColor: 'FFFFFF', dataBorder: { pt: 1, color: T.bg } })
    else sl.addChart(b.kind === 'line' ? pptx.ChartType.line : pptx.ChartType.bar, data, {
      ...common, barDir: 'col', barGapWidthPct: 90, lineSize: 2, lineDataSymbolSize: 7, dataLabelPosition: b.kind === 'line' ? 't' : 'outEnd',
      catAxisLabelFontSize: 10.5, catAxisLabelFontFace: F.sans, catAxisLabelColor: T.sub, catAxisLineShow: true, catGridLine: { style: 'none' },
      valAxisLabelFontSize: 9, valAxisLabelFontFace: F.sans, valAxisLabelColor: T.mute, valAxisLineShow: false, valGridLine: { color: T.line, size: 0.5 }, valAxisLabelFormatCode: '#,##0.##',
    })
    return
  }
  if (b.type === 'compare') {
    const gap = 0.5, cw = (r.w - gap) / 2
    sl.addShape(pptx.ShapeType.line, { x: r.x + cw + gap / 2, y: r.y, w: 0, h: r.h, line: { color: T.line, width: 0.75 } })
    ;[b.left, b.right].forEach((side, i) => {
      const x = r.x + i * (cw + gap)
      txt(side.head, { x, y: r.y, w: cw, h: 0.36, fontSize: 14, bold: true, color: i ? T.acc2 : T.acc, fontFace: F.serif })
      sl.addShape(pptx.ShapeType.line, { x, y: r.y + 0.42, w: cw, h: 0, line: { color: T.ink, width: 0.75 } })
      draw(pptx, sl, T, { type: 'compare-col', items: side.items.map(text => ({ head: '', text })) }, { x, y: r.y + 0.58, w: cw, h: r.h - 0.58 })
    })
    return
  }
  if (b.type === 'quote') {
    const pt = fitPt(b.text, r.w - 0.4, r.h - 0.6, 22, 13, 1.4)
    sl.addShape(pptx.ShapeType.rect, { x: r.x, y: r.y + 0.06, w: 0.05, h: Math.min(r.h - 0.5, linesAt(b.text, r.w - 0.4, pt) * pt * 1.4 / 72), fill: { color: T.acc }, line: { color: T.acc, width: 0 } })
    txt(b.text, { x: r.x + 0.3, y: r.y, w: r.w - 0.4, h: r.h - 0.5, fontSize: pt, fontFace: F.serif, lineSpacingMultiple: 1.25 })
    if (b.source) txt(b.source, { x: r.x + 0.3, y: r.y + r.h - 0.4, w: r.w - 0.4, h: 0.3, fontSize: 10.5, color: T.sub })
    return
  }
  txt(b.text, { x: r.x, y: r.y, w: Math.min(r.w, 9.4), h: r.h, fontSize: fitPt(b.text, Math.min(r.w, 9.4), r.h, 15, 10.5, 1.45), lineSpacingMultiple: 1.3, paraSpaceAfter: 6 })
}

/** 块的摆法：数字条放上面，其余并排；三块时左边一块、右边两块。 */
function arrange(blocks, r) {
  if (!blocks.length) return []
  const gap = 0.5
  const weight = b => ({ table: 1.25, chart: 1.2, compare: 1.4, steps: 1.6, points: 1, quote: 0.9, text: 1, stats: 1 })[b.type] ?? 1
  const statsFirst = [...blocks].sort((a, b) => (b.type === 'stats') - (a.type === 'stats'))
  if (blocks.length === 1) {
    const b = blocks[0]
    const need = b.type === 'stats' ? 2.2 : b.type === 'table' ? Math.min(r.h, (b.rows.length + 1) * 0.5 + (b.note ? 0.4 : 0)) : b.type === 'points' ? Math.min(r.h, b.items.length * 1.25) : r.h
    const w = b.type === 'table' && b.head.length <= 3 ? Math.min(r.w, 8.6) : b.type === 'points' ? Math.min(r.w, 10.4) : r.w
    return [{ b, r: { x: r.x, y: r.y, w, h: need } }]
  }
  if (statsFirst[0].type === 'stats') {
    const sh = 1.4
    const rest = statsFirst.slice(1)
    return [{ b: statsFirst[0], r: { x: r.x, y: r.y, w: r.w, h: sh } }, ...row(rest, { x: r.x, y: r.y + sh + 0.2, w: r.w, h: r.h - sh - 0.2 })]
  }
  if (blocks.length === 2) return row(blocks, r)
  const lw = (r.w - gap) * 0.54
  const hh = (r.h - 0.35) / 2
  return [
    { b: blocks[0], r: { x: r.x, y: r.y, w: lw, h: r.h } },
    { b: blocks[1], r: { x: r.x + lw + gap, y: r.y, w: r.w - lw - gap, h: hh } },
    { b: blocks[2], r: { x: r.x + lw + gap, y: r.y + hh + 0.35, w: r.w - lw - gap, h: hh } },
  ]
  function row(list, rr) {
    if (list.length === 1) return arrange(list, rr)
    if (list.some(b => b.type === 'steps' || b.type === 'compare')) {
      const h0 = (rr.h - 0.35) * 0.56
      return [{ b: list[0], r: { x: rr.x, y: rr.y, w: rr.w, h: h0 } }, { b: list[1], r: { x: rr.x, y: rr.y + h0 + 0.35, w: rr.w, h: rr.h - h0 - 0.35 } }]
    }
    const total = list.reduce((a, b) => a + weight(b), 0)
    let x = rr.x
    return list.map(b => {
      const w = (rr.w - gap * (list.length - 1)) * weight(b) / total
      const out = { b, r: { x, y: rr.y, w, h: b.type === 'table' ? Math.min(rr.h, (b.rows.length + 1) * 0.5 + (b.note ? 0.4 : 0)) : rr.h } }
      x += w + gap
      return out
    })
  }
}

export async function renderDeck(deck, { theme = 'mck', org = '优势资本', date = new Date().toISOString().slice(0, 10) } = {}) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const T = DECK_THEMES[theme] ?? DECK_THEMES.mck
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deck.title
  pptx.company = org
  const sources = arr(deck.sources)
  const total = deck.slides.length + 2
  const txt = (sl, text, o) => sl.addText(String(text), { margin: 0, fontFace: F.sans, color: T.ink, valign: 'top', ...o })

  // 封面
  const cov = pptx.addSlide()
  cov.background = { color: T.bg }
  cov.addShape(pptx.ShapeType.rect, { x: MX, y: 1.3, w: 0.9, h: 0.07, fill: { color: T.acc }, line: { color: T.acc, width: 0 } })
  if (deck.kicker) txt(cov, deck.kicker, { x: MX, y: 1.55, w: CW, h: 0.3, fontSize: 12, color: T.acc, bold: true, charSpacing: 2 })
  const tpt = fitPt(deck.title, CW, 1.5, 44, 28, 1.2)
  txt(cov, deck.title, { x: MX, y: 2.0, w: CW, h: 1.5, fontSize: tpt, bold: true, fontFace: F.serif, lineSpacingMultiple: 1.1 })
  const th = linesAt(deck.title, CW, tpt) * tpt * 1.2 / 72
  if (deck.subtitle) txt(cov, deck.subtitle, { x: MX, y: 2.0 + th + 0.2, w: CW, h: 0.7, fontSize: 16, color: T.sub })
  if (arr(deck.stats).length >= 2) draw(pptx, cov, T, { type: 'stats', items: deck.stats.slice(0, 4) }, { x: MX, y: 4.5, w: CW, h: 1.5 })
  cov.addShape(pptx.ShapeType.line, { x: MX, y: 6.62, w: CW, h: 0, line: { color: T.ink, width: 0.75 } })
  txt(cov, `${org} · ${date}`, { x: MX, y: 6.74, w: 6, h: 0.3, fontSize: 11, color: T.sub })
  txt(cov, sources.length ? `依据 ${sources.length} 份底稿` : '', { x: W - MX - 4, y: 6.74, w: 4, h: 0.3, fontSize: 11, color: T.sub, align: 'right' })

  const frame = (s, pageNo) => {
    const sl = pptx.addSlide()
    sl.background = { color: T.bg }
    if (s.kicker) txt(sl, s.kicker, { x: MX, y: 0.44, w: 9, h: 0.26, fontSize: 10, color: T.acc, bold: true, charSpacing: 1.5 })
    const pt = fitPt(s.title, CW, 0.92, 25, 18, 1.2)
    const titleH = linesAt(s.title, CW, pt) * pt * 1.2 / 72
    txt(sl, s.title, { x: MX, y: 0.76, w: CW, h: titleH + 0.05, fontSize: pt, bold: true, fontFace: F.serif, lineSpacingMultiple: 1.08 })
    let y = 0.76 + titleH + 0.16
    sl.addShape(pptx.ShapeType.line, { x: MX, y, w: CW, h: 0, line: { color: T.ink, width: 0.75 } })
    y += 0.2
    if (s.lede) {
      const lh = linesAt(s.lede, CW, 13) * 13 * 1.35 / 72
      txt(sl, s.lede, { x: MX, y, w: CW, h: lh + 0.05, fontSize: 13, color: T.sub, lineSpacingMultiple: 1.2 })
      y += lh + 0.22
    } else y += 0.08
    sl.addShape(pptx.ShapeType.line, { x: MX, y: 6.92, w: CW, h: 0, line: { color: T.line, width: 0.75 } })
    const names = (arr(s.cites).length ? s.cites : []).map(n => sources.find(x => x.n === n)).filter(Boolean).map(x => `[${x.n}]《${x.name.replace(/\.[^.]+$/, '')}》`)
    txt(sl, names.length ? `来源：${names.join(' ')}` : '', { x: MX, y: 7.0, w: CW - 1.4, h: 0.26, fontSize: 9, color: T.mute })
    txt(sl, `${pageNo} / ${total}`, { x: W - MX - 1.2, y: 7.0, w: 1.2, h: 0.26, fontSize: 9, color: T.mute, align: 'right', fontFace: F.num })
    let bottom = 6.72
    if (s.takeaway) {
      const h = Math.max(0.5, linesAt(s.takeaway, CW - 0.9, 13) * 13 * 1.3 / 72 + 0.26)
      bottom -= h
      sl.addShape(pptx.ShapeType.line, { x: MX, y: bottom, w: CW, h: 0, line: { color: T.line, width: 0.75 } })
      txt(sl, '判断', { x: MX, y: bottom + 0.16, w: 0.8, h: 0.28, fontSize: 10, color: T.acc, bold: true, charSpacing: 2 })
      txt(sl, s.takeaway, { x: MX + 0.9, y: bottom + 0.13, w: CW - 0.9, h: h - 0.16, fontSize: 13, bold: true, lineSpacingMultiple: 1.15 })
      bottom -= 0.22
    }
    if (s.notes) sl.addNotes(s.notes)
    return { sl, rect: { x: MX, y, w: CW, h: bottom - y } }
  }

  deck.slides.forEach((s, i) => {
    const { sl, rect } = frame(s, i + 2)
    for (const { b, r } of arrange(s.blocks, rect)) draw(pptx, sl, T, b, r)
  })

  // 末页：来源和数字核对
  const check = deck.check
  const end = frame({ kicker: '来源与核对', title: '本稿依据的底稿和需要复核的地方', lede: deck.engineNote || '', cites: [] }, total)
  const blocks = []
  if (sources.length) blocks.push({ type: 'table', head: ['编号', '底稿', '字数'], rows: sources.slice(0, 10).map(s => [`[${s.n}]`, s.name, s.chars ? String(s.chars) : '']), note: sources.length > 10 ? `共 ${sources.length} 份` : '' })
  const review = [
    ...(check ? [`共出现 ${check.total} 处数字，${check.matched} 处与底稿原文一致${check.derived ? `，${check.derived} 处为测算` : ''}。`] : []),
    ...arr(check?.unmatched).slice(0, 5).map(u => `底稿里没找到「${u.value}」：${u.context}`),
    ...arr(deck.gaps).slice(0, 4).map(g => `底稿未覆盖：${g}`),
  ]
  if (review.length) blocks.push({ type: 'points', items: review.map(text => ({ head: '', text })) })
  for (const { b, r } of arrange(blocks, end.rect)) draw(pptx, end.sl, T, b, r)
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }))
}
