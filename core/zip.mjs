// 零依赖 Office 文本抽取：读 ZIP 中央目录 + inflateRaw。只取文字，不做版式还原。
import { inflateRawSync } from 'node:zlib'

function entries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extra = buf.readUInt16LE(p + 30)
    const comment = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    out.set(name, { method, size, local })
    p += 46 + nameLen + extra + comment
  }
  return {
    names: [...out.keys()],
    read(name) {
      const e = out.get(name)
      if (!e) return ''
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28)
      const raw = buf.subarray(start, start + e.size)
      return (e.method === 8 ? inflateRawSync(raw) : raw).toString('utf8')
    },
  }
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const strip = xml => decode(xml.replace(/<[^>]+>/g, ''))

export function officeText(buf, ext) {
  const z = entries(buf)
  if (ext === '.docx') {
    return strip(z.read('word/document.xml').replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t'))
  }
  if (ext === '.pptx') {
    return z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))
      .map((n, i) => `# 第${i + 1}页\n` + strip(z.read(n).replace(/<\/a:p>/g, '\n'))).join('\n')
  }
  if (ext === '.xlsx') {
    const shared = [...z.read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => strip(m[1]))
    const sheet = z.read('xl/worksheets/sheet1.xml')
    return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 500).map(row =>
      [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(c => {
        const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? strip(c[2] ?? '')
        return /t="s"/.test(c[1]) ? shared[Number(v)] ?? '' : decode(v)
      }).join(',')).join('\n')
  }
  return ''
}
