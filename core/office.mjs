// 文档引擎（需求 五、七）：真实 Word / PPT / Excel 生成、标准文书模板字段填充、PDF/Office 文字提取。
// 依赖均为宽松许可：docx(MIT)、pptxgenjs(MIT)、exceljs(MIT)、pdfjs-dist(Apache-2.0)。
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib'
import { officeText } from './zip.mjs'
import { renderProPptx } from './nb-ppt-pro.mjs'
import { fileURLToPath } from 'node:url'
import { join, sep } from 'node:path'

const FONT = 'Microsoft YaHei'

// ───────── Markdown → 结构块 ─────────
export function blocks(md) {
  const out = []
  const lines = String(md ?? '').replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    const h = l.match(/^(#{1,4})\s+(.*)/)
    if (h) { out.push({ t: 'h', level: h[1].length, text: h[2].trim() }); continue }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const row = s => s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const head = row(l)
      const body = []
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]))
      i--
      out.push({ t: 'table', head, rows: body })
      continue
    }
    const li = l.match(/^(\s*)(?:[-*+]|\d+[.)、])\s+(.*)/)
    if (li) { out.push({ t: 'li', text: li[2], indent: li[1].replace(/\t/g, '    ').length }); continue }
    if (/^>\s?/.test(l)) { out.push({ t: 'quote', text: l.replace(/^>\s?/, '') }); continue }
    out.push({ t: 'p', text: l.trim() })
  }
  return out
}
const plain = s => String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')

// ───────── Word ─────────
export async function renderDocx({ title, subtitle, markdown, footer }) {
  const d = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = d
  const run = (text, opt = {}) => {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/)
    return parts.filter(Boolean).map(p => new TextRun({ text: p.replace(/^\*\*|\*\*$/g, ''), bold: /^\*\*/.test(p) || opt.bold, font: FONT, size: opt.size ?? 22, color: opt.color }))
  }
  const children = [
    new Paragraph({ children: run(title, { bold: true, size: 36 }), alignment: AlignmentType.CENTER, spacing: { after: 160 } }),
    ...(subtitle ? [new Paragraph({ children: run(subtitle, { size: 20, color: '666666' }), alignment: AlignmentType.CENTER, spacing: { after: 320 } })] : []),
  ]
  for (const b of blocks(markdown)) {
    if (b.t === 'h') children.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1] ?? HeadingLevel.HEADING_3, children: run(plain(b.text), { bold: true, size: [32, 28, 24, 22][b.level - 1], color: '0F2A56' }), spacing: { before: 280, after: 140 }, ...(b.level <= 2 ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFDBFE' } } } : {}) }))
    else if (b.t === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: run(b.text), spacing: { line: 340, after: 80 } }))
    else if (b.t === 'quote') children.push(new Paragraph({ children: run(b.text, { color: '1E3A8A', size: 20 }), indent: { left: 280, right: 200 }, spacing: { before: 120, after: 140 }, shading: { fill: 'F0F6FF' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: '2563EB' } } }))
    else if (b.t === 'table') {
      const cell = (t, head, odd) => new TableCell({ children: [new Paragraph({ children: run(plain(t), { bold: head, size: 20, color: head ? 'FFFFFF' : '1E293B' }), spacing: { before: 60, after: 60 } })], shading: head ? { fill: '0F2A56' } : odd ? { fill: 'F8FAFC' } : undefined })
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: b.head.map(h => cell(h, true, false)), tableHeader: true }), ...b.rows.map((r, ri) => new TableRow({ children: b.head.map((_, i) => cell(r[i] ?? '', false, ri % 2 === 1)) }))] }))
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }))
    } else children.push(new Paragraph({ children: run(b.text), spacing: { line: 340, after: 110 }, ...(b.text.length > 40 ? { indent: { firstLine: 420 } } : {}) }))
  }
  if (footer) children.push(new Paragraph({ children: run(footer, { size: 16, color: '999999' }), spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } } }))
  const doc = new Document({ creator: 'InvestAI', title, styles: { default: { document: { run: { font: FONT } } } }, sections: [{ children }] })
  return Buffer.from(await Packer.toBuffer(doc))
}

// ───────── PPT ─────────
// 版面（LAYOUT_WIDE 13.33 × 7.5 英寸）：标题区 0.35–1.05，正文区 1.2–6.85，页脚 7.05。
const PPT = { W: 13.33, X: 0.6, CW: 12.1, TOP: 1.2, BOTTOM: 6.85 }
const PPT_BODY = PPT.BOTTOM - PPT.TOP

/** 估算文字的「视觉宽度」（以一个汉字为 1）：中文/全角按 1，英文数字按 0.55。 */
function visualLen(s) {
  let n = 0
  for (const ch of String(s)) n += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.55
  return n
}
/** 估算一段文字在给定宽度（英寸）、字号下占几行。 */
function lineCount(text, widthIn, fontPt) {
  const perLine = Math.max(4, Math.floor((widthIn - 0.35) / (fontPt / 72)))
  return Math.max(1, Math.ceil(visualLen(text) / perLine))
}
const itemFont = it => it.kind === 'head' ? 16 : it.kind === 'quote' ? 12 : it.small ? 12 : it.level ? 14 : 15
const itemHeight = (it, w) => lineCount(it.text, w - (it.level ? 0.4 : 0), itemFont(it)) * itemFont(it) * 1.3 / 72 + 0.09

/** Markdown → 章节：每个 # / ## 一章；### 及以下作为章内小标题；列表、段落、引用、表格都保留，不丢内容。 */
function markdownSections(md) {
  const sections = []
  let deckTitle
  let cur = null
  const start = title => { cur = { title, items: [], tables: [] }; sections.push(cur) }
  for (const b of blocks(md)) {
    if (b.t === 'h' && b.level <= 2) {
      if (b.level === 1 && deckTitle === undefined && !sections.length) { deckTitle = plain(b.text); continue }
      start(plain(b.text)); continue
    }
    if (!cur) start(deckTitle ?? '概览')
    const small = /引用来源|参考资料/.test(cur.title)
    if (b.t === 'table') cur.tables.push(b)
    else if (b.t === 'h') cur.items.push({ kind: 'head', text: plain(b.text) })
    else if (b.t === 'li') cur.items.push({ kind: 'bullet', text: plain(b.text), level: b.indent >= 2 ? 1 : 0, small })
    else if (b.t === 'quote') cur.items.push({ kind: 'quote', text: plain(b.text) })
    else cur.items.push({ kind: 'para', text: plain(b.text), small })
  }
  return { sections, deckTitle }
}

/** 表格按可用高度拆页（表头每页重复），不再截断第 12 行之后的数据。 */
function tableChunks(t, widthIn, availFirst, availNext) {
  const cols = Math.max(1, t.head.length)
  const colW = columnWidths(t, widthIn)
  const rowH = cells => Math.max(...cells.map((c, i) => lineCount(plain(c ?? ''), colW[i], 11))) * 11 * 1.25 / 72 + 0.12
  const headH = rowH(t.head)
  const chunks = []
  let rows = []
  let used = headH
  let avail = availFirst
  for (const r of t.rows) {
    const cells = t.head.map((_, i) => r[i] ?? '')
    const h = rowH(cells)
    if (rows.length && used + h > avail) { chunks.push({ rows, h: used }); rows = []; used = headH; avail = availNext }
    rows.push(cells); used += h
  }
  chunks.push({ rows, h: used })
  return { chunks, colW, cols }
}
function columnWidths(t, widthIn) {
  const n = Math.max(1, t.head.length)
  const want = t.head.map((h, i) => Math.min(30, Math.max(visualLen(plain(h)), ...t.rows.map(r => visualLen(plain(r[i] ?? ''))), 2)))
  const total = want.reduce((a, b) => a + b, 0)
  let w = want.map(x => Math.max(0.8, widthIn * x / total))
  const scale = widthIn / w.reduce((a, b) => a + b, 0)
  w = w.map(x => x * scale)
  return w.length === n ? w : Array(n).fill(widthIn / n)
}

/**
 * Markdown → 幻灯片描述：[{ title, items, table?, cont }]。
 * 按估算高度自动分页（长段落、长列表、长表格都会续页），保证每一行内容都在 PPT 里。
 */
export function markdownToSlides(md) {
  const { sections, deckTitle } = markdownSections(md)
  const out = []
  for (const s of sections) {
    const pages = []
    let page = { items: [], h: 0 }
    for (const it of s.items) {
      const h = itemHeight(it, PPT.CW)
      if (page.items.length && page.h + h > PPT_BODY) { pages.push(page); page = { items: [], h: 0 } }
      page.items.push(it); page.h += h
    }
    if (page.items.length || !s.tables.length) pages.push(page)
    for (const t of s.tables) {
      const last = pages.at(-1)
      const room = last ? PPT_BODY - last.h - (last.items.length ? 0.2 : 0) : PPT_BODY
      const { chunks, colW } = tableChunks(t, PPT.CW, room > 1.2 ? room : PPT_BODY, PPT_BODY)
      chunks.forEach((c, i) => {
        if (i === 0 && last && room > 1.2 && c.h <= room && !last.table) { last.table = { head: t.head, rows: c.rows, colW, y: last.items.length ? last.h + 0.2 : 0 }; last.h += c.h + 0.2; return }
        pages.push({ items: [], h: c.h, table: { head: t.head, rows: c.rows, colW, y: 0 } })
      })
    }
    pages.forEach((p, i) => out.push({ title: i ? `${s.title}（续）` : s.title, items: p.items, table: p.table, bullets: p.items.map(x => ({ text: x.text, bold: x.kind === 'head' })) }))
  }
  out.title = deckTitle
  return out
}

export async function renderPptx({ title, subtitle, markdown, slides: given, sources = [], theme = 'mck', pageCount = 8, targetMB = 6, density = 'standard' }) {
  const list = given ?? markdownToSlides(markdown)
  return renderProPptx({ title, subtitle, slides: list.map(s => ({ title: s.title, bullets: (s.items ?? s.bullets ?? []).map(x => typeof x === 'string' ? x : x.text).filter(Boolean) })), sources, theme, pageCount, targetMB, density })
}
export async function renderPptxLegacy({ title, subtitle, markdown, slides: given }) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = String(title ?? '')
  pptx.company = 'InvestAI'
  pptx.defineSlideMaster({ title: 'IA', background: { color: 'FFFFFF' }, objects: [{ rect: { x: 0, y: 0, w: PPT.W, h: 0.12, fill: { color: '1D4ED8' } } }, { text: { text: 'InvestAI · 内部资料', options: { x: 0.4, y: 7.05, w: 6, h: 0.3, fontSize: 9, color: '94A3B8', fontFace: FONT } } }], slideNumber: { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontSize: 9, color: '94A3B8' } })
  const cover = pptx.addSlide()
  cover.background = { color: '0F172A' }
  cover.addText(String(title ?? ''), { x: 0.8, y: 2.4, w: 11.7, h: 1.3, fontSize: visualLen(title) > 26 ? 30 : 36, bold: true, color: 'FFFFFF', fontFace: FONT, fit: 'shrink', valign: 'bottom' })
  if (subtitle) cover.addText(String(subtitle), { x: 0.8, y: 3.8, w: 11.7, h: 0.6, fontSize: 16, color: '93C5FD', fontFace: FONT })
  cover.addText(new Date().toLocaleDateString('zh-CN'), { x: 0.8, y: 6.4, w: 6, h: 0.4, fontSize: 12, color: '64748B', fontFace: FONT })
  const list = given ?? markdownToSlides(markdown)
  if (!list.length) list.push({ title: '内容', items: [{ kind: 'para', text: '（本版本暂无正文内容，待补充）' }] })
  for (const s of list) {
    const sl = pptx.addSlide({ masterName: 'IA' })
    sl.addText(String(s.title ?? ''), { x: 0.5, y: 0.3, w: 12.3, h: 0.75, fontSize: visualLen(s.title) > 34 ? 20 : 24, bold: true, color: '0F172A', fontFace: FONT, fit: 'shrink', valign: 'middle' })
    // 兼容旧调用方式：只给 bullets 的幻灯片
    const items = s.items ?? (s.bullets ?? []).map(b => ({ kind: b.bold ? 'head' : 'bullet', text: b.text }))
    let bodyH = 0
    if (items.length) {
      bodyH = Math.min(PPT_BODY, items.reduce((a, it) => a + itemHeight(it, PPT.CW), 0) + 0.1)
      sl.addText(items.map(it => ({
        text: it.text,
        options: {
          bullet: it.kind === 'bullet' ? (it.level ? { indent: 18 } : true) : false,
          indentLevel: it.kind === 'bullet' && it.level ? 1 : 0,
          bold: it.kind === 'head', italic: it.kind === 'quote',
          fontSize: itemFont(it), color: it.kind === 'quote' ? '64748B' : it.kind === 'head' ? '1D4ED8' : '1E293B',
          breakLine: true, paraSpaceAfter: 5,
        },
      })), { x: PPT.X, y: PPT.TOP, w: PPT.CW, h: bodyH, fontFace: FONT, valign: 'top', fit: 'shrink', margin: 2 })
    }
    if (s.table) {
      const t = s.table
      const rows = [t.head.map(c => ({ text: plain(c), options: { bold: true, fill: { color: 'E8EEF7' }, color: '0F172A' } })), ...t.rows.map(r => r.map(c => ({ text: plain(c ?? '') })))]
      sl.addTable(rows, { x: PPT.X, y: PPT.TOP + (t.y ?? (items.length ? bodyH + 0.2 : 0)), w: PPT.CW, colW: t.colW, fontSize: 11, fontFace: FONT, color: '1E293B', valign: 'middle', border: { type: 'solid', color: 'CBD5E1', pt: 0.5 }, margin: 0.05 })
    }
    for (const t of s.tables ?? []) {
      // 旧调用方式（直接传 tables）：同样完整输出，不截断
      const rows = [t.head.map(c => ({ text: plain(c), options: { bold: true, fill: { color: 'E8EEF7' } } })), ...t.rows.map(r => t.head.map((_, i) => ({ text: plain(r[i] ?? '') })))]
      sl.addTable(rows, { x: PPT.X, y: PPT.TOP + bodyH + 0.2, w: PPT.CW, fontSize: 11, fontFace: FONT, border: { type: 'solid', color: 'CBD5E1', pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true, newSlideStartY: PPT.TOP })
    }
    if (s.notes) sl.addNotes(s.notes)
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }))
}

// ───────── Excel ─────────
/** sheets: [{ name, columns:[{header,key,width}], rows:[{...}], notes? }]；单元格可传 { value, source } 生成批注。 */
export async function renderXlsx({ title, sheets }) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'InvestAI'
  for (const sh of sheets) {
    const ws = wb.addWorksheet(String(sh.name).slice(0, 30).replace(/[\\/?*[\]:]/g, '_'))
    if (title) { ws.addRow([title]).font = { bold: true, size: 14 }; ws.addRow([]) }
    const head = ws.addRow(sh.columns.map(c => c.header))
    head.font = { bold: true }
    head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } } })
    sh.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 18 })
    for (const r of sh.rows) {
      const row = ws.addRow(sh.columns.map(c => { const v = r[c.key]; return v && typeof v === 'object' && 'value' in v ? v.value : v ?? '' }))
      sh.columns.forEach((c, i) => {
        const v = r[c.key]
        if (v && typeof v === 'object' && v.source) row.getCell(i + 1).note = `来源：${v.source}`
        if (v && typeof v === 'object' && v.flag) row.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.flag === 'conflict' ? 'FFFDE2E2' : 'FFFEF3C7' } }
      })
    }
    if (sh.notes) { ws.addRow([]); for (const n of [].concat(sh.notes)) ws.addRow([n]).font = { color: { argb: 'FF64748B' }, size: 9 } }
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function readXlsx(buf) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const out = []
  wb.eachSheet(ws => {
    out.push(`## 工作表：${ws.name}`)
    ws.eachRow({ includeEmpty: false }, row => out.push((row.values ?? []).slice(1).map(v => v && typeof v === 'object' ? (v.result ?? v.text ?? v.richText?.map(t => t.text).join('') ?? '') : v ?? '').join(',')))
  })
  return out.join('\n')
}

// ───────── PDF 文字（含页码） ─────────
let pdfjs = null
let pdfAssets = null
export async function pdfText(buf) {
  pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs')
  // 中文 CID 字体需要 CMap 才能还原文字；标准字体数据用于无内嵌字体的 PDF
  pdfAssets ??= (() => { const root = fileURLToPath(new URL('.', import.meta.resolve('pdfjs-dist/package.json'))); return { cMapUrl: join(root, 'cmaps') + sep, standardFontDataUrl: join(root, 'standard_fonts') + sep } })()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), ...pdfAssets, cMapPacked: true, useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise
  const pages = []
  for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let last = null
    let text = ''
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const y = it.transform?.[5]
      if (last !== null && Math.abs(y - last) > 2) text += '\n'
      text += it.str
      last = y
    }
    pages.push(text.replace(/[ \t]+\n/g, '\n').trim())
  }
  await doc.destroy()
  return { pages, text: pages.map((t, i) => `[第${i + 1}页]\n${t}`).join('\n\n'), scanned: pages.every(p => p.length < 20) }
}

/** 统一文字抽取：按扩展名分派，返回 { text, pages?, note } */
export async function extractAny(buf, ext) {
  try {
    if (['.md', '.txt', '.csv', '.tsv', '.json', '.log'].includes(ext)) return { text: buf.toString('utf8') }
    if (ext === '.pdf') { const r = await pdfText(buf); return { text: r.text, pages: r.pages.length, note: r.scanned ? '扫描件无文字层，需 OCR' : '' } }
    if (ext === '.xlsx') return { text: await readXlsx(buf) }
    if (ext === '.docx' || ext === '.pptx') return { text: officeText(buf, ext) }
  } catch (e) { return { text: '', note: `文字抽取失败：${String(e.message).slice(0, 80)}` } }
  return { text: '', note: '仅登记元数据' }
}

// ───────── ZIP 写入（模板填充后重新打包） ─────────
export function zipFiles(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, data0] of files) {
    const data = Buffer.isBuffer(data0) ? data0 : Buffer.from(data0)
    const comp = deflateRawSync(data)
    const n = Buffer.from(name)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc >>> 0, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(crc >>> 0, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42)
    parts.push(local, n, comp)
    central.push(cen, n)
    offset += 30 + n.length + comp.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

export function unzipAll(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('不是有效的 Office 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let k = 0; k < count; k++) {
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nl = buf.readUInt16LE(p + 28)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nl)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    out.push([name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw)])
    p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return out
}

/**
 * 标准文书模板填充（NDA、固定函件）：替换 {{字段}}。
 * Word 常把占位符拆进多个 run，先合并 {{ … }} 之间的标签再替换。缺失字段保留醒目标记，不编造。
 */
export function fillDocxTemplate(buf, values) {
  const missing = new Set()
  const used = new Set()
  const files = unzipAll(buf).map(([name, data]) => {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) return [name, data]
    let xml = data.toString('utf8')
    xml = xml.replace(/\{(?:<[^>]+>)*\{((?:[^{}]|<[^>]+>)*?)\}(?:<[^>]+>)*\}/g, (all, inner) => `{{${inner.replace(/<[^>]+>/g, '')}}}`)
    xml = xml.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, key) => {
      const v = values[key]
      if (v === undefined || v === null || v === '') { missing.add(key); return `【待补充：${key}】` }
      used.add(key)
      return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    })
    return [name, Buffer.from(xml)]
  })
  return { buffer: zipFiles(files), missing: [...missing], used: [...used] }
}

export function templateFields(buf) {
  const keys = new Set()
  for (const [name, data] of unzipAll(buf)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue
    const xml = data.toString('utf8').replace(/\{(?:<[^>]+>)*\{((?:[^{}]|<[^>]+>)*?)\}(?:<[^>]+>)*\}/g, (a, inner) => `{{${inner.replace(/<[^>]+>/g, '')}}}`)
    for (const m of xml.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) keys.add(m[1])
  }
  return [...keys]
}

export const MIME = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.aiff': 'audio/aiff', '.amr': 'audio/amr',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
}
