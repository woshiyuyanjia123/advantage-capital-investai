// 文档引擎（需求 五、七）：真实 Word / PPT / Excel 生成、标准文书模板字段填充、PDF/Office 文字提取。
// 依赖均为宽松许可：docx(MIT)、pptxgenjs(MIT)、exceljs(MIT)、pdfjs-dist(Apache-2.0)。
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib'
import { officeText } from './zip.mjs'
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
    const li = l.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)/)
    if (li) { out.push({ t: 'li', text: li[1] }); continue }
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
    if (b.t === 'h') children.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1] ?? HeadingLevel.HEADING_3, children: run(plain(b.text), { bold: true, size: [32, 30, 26, 24][b.level - 1] }), spacing: { before: 240, after: 120 } }))
    else if (b.t === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: run(b.text), spacing: { after: 60 } }))
    else if (b.t === 'quote') children.push(new Paragraph({ children: run(b.text, { color: '666666', size: 20 }), indent: { left: 360 }, spacing: { after: 80 } }))
    else if (b.t === 'table') {
      const cell = (t, head) => new TableCell({ children: [new Paragraph({ children: run(plain(t), { bold: head, size: 20 }) })], shading: head ? { fill: 'E8EEF7' } : undefined })
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: b.head.map(h => cell(h, true)), tableHeader: true }), ...b.rows.map(r => new TableRow({ children: b.head.map((_, i) => cell(r[i] ?? '', false)) }))] }))
      children.push(new Paragraph({ children: [] }))
    } else children.push(new Paragraph({ children: run(b.text), spacing: { after: 100 }, ...(b.text.length > 40 ? { indent: { firstLine: 420 } } : {}) }))
  }
  if (footer) children.push(new Paragraph({ children: run(footer, { size: 16, color: '999999' }), spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } } }))
  const doc = new Document({ creator: 'InvestAI', title, styles: { default: { document: { run: { font: FONT } } } }, sections: [{ children }] })
  return Buffer.from(await Packer.toBuffer(doc))
}

// ───────── PPT ─────────
/** Markdown → 幻灯片：每个 ## 一页；列表成要点；表格成表；超长内容自动续页。 */
export function markdownToSlides(md) {
  const slides = []
  let cur = null
  for (const b of blocks(md)) {
    if (b.t === 'h' && b.level <= 2) { if (b.level === 1 && !slides.length && !cur) { slides.title = plain(b.text); continue } cur = { title: plain(b.text), bullets: [], tables: [] }; slides.push(cur); continue }
    if (!cur) { cur = { title: slides.title ?? '概览', bullets: [], tables: [] }; slides.push(cur) }
    if (b.t === 'table') cur.tables.push(b)
    else if (b.t === 'h') cur.bullets.push({ text: plain(b.text), bold: true })
    else cur.bullets.push({ text: plain(b.text) })
  }
  const out = []
  for (const s of slides) {
    for (let i = 0; i < Math.max(1, Math.ceil(s.bullets.length / 7)); i++) out.push({ title: i ? `${s.title}（续）` : s.title, bullets: s.bullets.slice(i * 7, i * 7 + 7), tables: i ? [] : s.tables })
  }
  out.title = slides.title
  return out
}

export async function renderPptx({ title, subtitle, markdown, slides: given }) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.defineSlideMaster({ title: 'IA', background: { color: 'FFFFFF' }, objects: [{ rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: '1D4ED8' } } }, { text: { text: 'InvestAI · 内部资料', options: { x: 0.4, y: 7.05, w: 6, h: 0.3, fontSize: 9, color: '94A3B8', fontFace: FONT } } }], slideNumber: { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontSize: 9, color: '94A3B8' } })
  const cover = pptx.addSlide()
  cover.background = { color: '0F172A' }
  cover.addText(title, { x: 0.8, y: 2.6, w: 11.7, h: 1.1, fontSize: 36, bold: true, color: 'FFFFFF', fontFace: FONT })
  if (subtitle) cover.addText(subtitle, { x: 0.8, y: 3.8, w: 11.7, h: 0.6, fontSize: 16, color: '93C5FD', fontFace: FONT })
  const list = given ?? markdownToSlides(markdown)
  for (const s of list) {
    const sl = pptx.addSlide({ masterName: 'IA' })
    sl.addText(s.title, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: '0F172A', fontFace: FONT })
    let y = 1.2
    if (s.bullets?.length) {
      const h = Math.min(5.6, 0.48 * s.bullets.length + 0.2)
      sl.addText(s.bullets.map(b => ({ text: b.text, options: { bullet: !b.bold, bold: !!b.bold, fontSize: b.bold ? 16 : 15, color: '1E293B', breakLine: true, paraSpaceAfter: 6 } })), { x: 0.6, y, w: s.tables?.length ? 6.2 : 12.1, h, fontFace: FONT, valign: 'top' })
      if (!s.tables?.length) y += h
    }
    for (const t of s.tables ?? []) {
      const rows = [t.head.map(c => ({ text: plain(c), options: { bold: true, fill: { color: 'E8EEF7' } } })), ...t.rows.slice(0, 12).map(r => t.head.map((_, i) => ({ text: plain(r[i] ?? '') })))]
      sl.addTable(rows, { x: s.bullets?.length ? 7 : 0.6, y: 1.2, w: s.bullets?.length ? 5.8 : 12.1, fontSize: 11, fontFace: FONT, border: { type: 'solid', color: 'CBD5E1', pt: 0.5 } })
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
