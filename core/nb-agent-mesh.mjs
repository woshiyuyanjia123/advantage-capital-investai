// 交叉核对：让模型分别站在“撰写”和“反方”两个立场通读底稿，找出不同底稿对同一件事说法不一致的地方。
// 走和成果编制相同的密级路由；没有可用模型时不产出任何结论，只返回底稿分级和原因。
// 模型给出的每条结论都把里面的数字和底稿核对一遍，对不上的列出来。
import { prepareSources, checkNumbers, sourceDigest, projectFacts } from './nb-ground.mjs'
import { askJson } from './nb-author.mjs'

/** 按文件名推定底稿的证据效力。只看文件名，结果仅供排序和提示，不代表内容已经核实。 */
export function gradeDocCredibility(name = '') {
  if (/审计|财务|财报|利润|合同|天眼查|工商/.test(name)) return { grade: 'A', label: 'A级·审计、合同、工商类' }
  if (/商业计划|BP|路演/i.test(name)) return { grade: 'C', label: 'C级·公司自述材料' }
  return { grade: 'B', label: 'B级·访谈与内部纪要' }
}

const clean = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const list = (v, max = 8) => (Array.isArray(v) ? v : []).map(x => clean(x)).filter(Boolean).slice(0, max)

/**
 * 返回 { engine, note, thesis, highlights, valuationNote, conflicts, redFlags, patchAdvice, numCheck, dialogs, credibilityDist, sources, elapsedMs }。
 * engine 为空表示没有调用模型，此时 conflicts 等字段都是空的，note 写明原因。
 */
export async function runAgentMeshCrossCheck(ai, p, docs = [], { level } = {}) {
  const t0 = Date.now()
  const levelMax = level ?? docs.reduce((a, d) => Math.max(a, d.level ?? 2), 0)
  const sources = docs.map((d, i) => ({ n: i + 1, name: d.name, ...gradeDocCredibility(d.name) }))
  const dist = { A: sources.filter(x => x.grade === 'A').length, B: sources.filter(x => x.grade === 'B').length, C: sources.filter(x => x.grade === 'C').length }
  const base = { at: new Date().toISOString(), engine: '', note: '', credibilityDist: dist, sources, thesis: '', highlights: [], valuationNote: '', conflicts: [], redFlags: [], patchAdvice: '', numCheck: null, dialogs: [] }
  const done = extra => ({ ...base, ...extra, elapsedMs: Date.now() - t0 })
  if (!docs.length) return done({ note: '没有读到底稿正文' })
  const route = await ai?.route?.(levelMax).catch(e => ({ adapter: null, reason: e.message })) ?? { adapter: null, reason: '未配置模型' }
  if (!route.adapter) return done({ note: `没有调用模型（${route.reason}），不同底稿之间的口径需要人工比对` })

  const G = prepareSources(p, docs)
  const ctx = [
    `项目登记信息：\n${projectFacts(p).map(([k, v]) => `${k}：${v}`).join('\n') || p.name}`,
    `底稿（共 ${docs.length} 份，括号里是按文件名推定的证据效力）：\n${sources.map(s => `[${s.n}]《${s.name}》（${s.label}）`).join('\n')}`,
    sourceDigest(docs),
  ].join('\n\n')
  const rules = '只用给出的底稿。底稿里没有的事实和数字不写。引用数字保持原样并在句末标来源编号，如 [2]。没有发现就返回空数组，不要凑数。只输出 JSON。'
  const errors = []
  const ask = (system, user) => askJson(route.adapter, { system, user: `${ctx}\n\n${user}`, maxTokens: 12000, timeoutMs: 240000 }).catch(e => { errors.push(e.message); return null })
  const [w, q] = await Promise.all([
    ask(`你是优势资本的投资经理，负责把底稿里支持投资的理由讲清楚。${rules}`,
      '通读全部底稿，输出 {"thesis":"这个项目值得上会讨论的核心理由，一两句话，带来源编号","highlights":["底稿里支持这个理由的事实，带来源编号"],"valuationNote":"底稿里和估值、交易条款有关的事实，没有就留空"}'),
    ask(`你是优势资本投委会里专门挑毛病的委员。你的工作是找出不同底稿对同一指标、同一事实说法不一致的地方，尤其是公司自述材料和审计、合同、访谈之间的差异。${rules}`,
      '逐项比对后输出 {"conflicts":[{"topic":"哪个指标或事实","bpClaim":"公司自述材料的说法，带来源编号","auditFact":"审计、合同或访谈的说法，带来源编号","impact":"这个差异对估值或交易条款意味着什么"}],"redFlags":["底稿里已经出现、需要在交割前解决的风险事项，带来源编号"],"patchAdvice":"撰写材料时应该统一采用哪个口径，为什么"}'),
  ])
  if (!w && !q) return done({ note: `模型调用失败：${errors[0] ?? '没有返回内容'}` })

  const conflicts = (Array.isArray(q?.conflicts) ? q.conflicts : []).map(c => ({ topic: clean(c?.topic, 60), bpClaim: clean(c?.bpClaim), auditFact: clean(c?.auditFact), impact: clean(c?.impact) })).filter(c => c.topic && (c.bpClaim || c.auditFact)).slice(0, 10)
  const out = { thesis: clean(w?.thesis, 600), highlights: list(w?.highlights), valuationNote: clean(w?.valuationNote, 600), conflicts, redFlags: list(q?.redFlags), patchAdvice: clean(q?.patchAdvice, 600) }
  const text = [out.thesis, ...out.highlights, out.valuationNote, ...conflicts.flatMap(c => [c.bpClaim, c.auditFact, c.impact]), ...out.redFlags].join('\n')
  const c = checkNumbers(text, G.corpus)
  const numCheck = { ...c, rate: c.total ? Math.round((c.matched + c.derived) / c.total * 100) : null }
  // 过程记录：只记实际发生的事
  const dialogs = [
    { from: '底稿整理', to: '撰写', action: '分级', msg: `${docs.length} 份底稿：A 级 ${dist.A} 份，B 级 ${dist.B} 份，C 级 ${dist.C} 份（按文件名推定）；整理出表格 ${G.tables.length} 张、条目 ${G.passages.length} 条。` },
    w ? { from: '撰写', to: '反方', action: '提出主线', msg: out.thesis || '模型没有给出主线。' } : { from: '撰写', to: '反方', action: '失败', msg: '这一步模型没有返回可用内容。' },
    q ? { from: '反方', to: '撰写', action: '指出差异', msg: conflicts.length ? `找到 ${conflicts.length} 处说法不一致：${conflicts.map(x => x.topic).join('、')}。${out.patchAdvice}` : '没有发现不同底稿之间说法不一致的地方。' } : { from: '反方', to: '撰写', action: '失败', msg: '这一步模型没有返回可用内容。' },
    { from: '数字核对', to: '全部', action: '核对', msg: c.total ? `以上结论里出现 ${c.total} 处数字，${c.matched} 处与底稿原文一致${c.derived ? `，${c.derived} 处写明为测算` : ''}${c.unmatched.length ? `，${c.unmatched.length} 处在底稿里没找到：${c.unmatched.map(u => u.value).join('、')}` : ''}。` : '以上结论里没有出现数字。' },
  ]
  return done({ engine: route.label, note: errors.length ? `有一步没有成功：${errors[0]}` : '', ...out, numCheck, dialogs })
}

export async function previewAnyArtifact(fullPath) {
  const { readFile } = await import('node:fs/promises')
  const ext = (fullPath.match(/\.[^.]+$/) || [''])[0].toLowerCase()
  const name = fullPath.split(/[\\/]/).pop()
  if (ext === '.html' || ext === '.md' || ext === '.txt') {
    return { name, ext, kind: 'html', content: await readFile(fullPath, 'utf8') }
  }
  if (ext === '.xlsx') {
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(fullPath)
    const sheets = wb.worksheets.map(ws => {
      const rows = []
      ws.eachRow({ includeEmpty: false }, (row, rn) => { if (rn <= 40) rows.push(row.values.slice(1).map(v => String(v?.text ?? v ?? ''))) })
      return { name: ws.name, rows }
    })
    return { name, ext, kind: 'xlsx', sheets }
  }
  const { inflateRawSync } = await import('node:zlib')
  const buf = await readFile(fullPath)
  const entries = readZipXmlEntries(buf, inflateRawSync)
  if (ext === '.pptx') {
    const NOISE = /^(\d+\s*\/\s*\d+|\d+)$/ // 页码
    const slides = Object.keys(entries).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
      .map((k, idx) => {
        const rawTexts = [...entries[k].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => decodeXml(m[1]).trim()).filter(Boolean)
        const clean = rawTexts.filter(t => !NOISE.test(t) && !t.startsWith('来源：'))
        const title = clean.find(t => t.length >= 6) || rawTexts[0] || `第 ${idx + 1} 页`
        const bullets = clean.filter(t => t !== title && t.length >= 4)
        return { page: idx + 1, title, bullets, texts: rawTexts }
      })
    return { name, ext, kind: 'pptx', slides }
  }
  if (ext === '.docx') {
    const xml = entries['word/document.xml'] || ''
    const paras = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map(p => [...p[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => decodeXml(m[1])).join('').trim()).filter(Boolean)
    return { name, ext, kind: 'docx', paras }
  }
  return { name, ext, kind: 'binary' }
}

function decodeXml(s = '') {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

function readZipXmlEntries(buf, inflateRawSync) {
  const out = {}
  let off = 0
  while (off + 30 < buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8)
    const csize = buf.readUInt32LE(off + 18)
    const nlen = buf.readUInt16LE(off + 26)
    const elen = buf.readUInt16LE(off + 28)
    const name = buf.subarray(off + 30, off + 30 + nlen).toString('utf8')
    const start = off + 30 + nlen + elen
    if (name.endsWith('.xml') && csize > 0 && start + csize <= buf.length) {
      try {
        const raw = buf.subarray(start, start + csize)
        out[name] = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8')
      } catch { /* skip */ }
    }
    off = start + csize
  }
  return out
}

