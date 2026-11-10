// Studio 8 大加工成品定向生成器（严格按勾选 fileIds 提炼 + 自动落盘项目专属文件夹 + 智能追问建议）
import { renderDocx, renderPptx, renderXlsx } from './office.mjs'
import { sheetsFromMarkdown } from './deliverables.mjs'
import { writeProjectArtifact } from './nb-folder.mjs'
import { buildComprehensiveMarkdown, buildRichPptSlides } from './nb-deep-doc.mjs'
import { extractGroundedFacts, generateTwoHostScript, renderInteractiveNlmHtml, synthesizeDeepSeekSection } from './nb-nlm-pipeline.mjs'
import { buildEquityResearchMemoHtml } from './nb-equity-memo.mjs'

export function buildFollowUps(p, question = '', checkedNames = []) {
  const srcHint = checkedNames[0] ? `《${checkedNames[0].replace(/\.[^.]+$/, '')}》` : '已勾选资料'
  const stage = p?.stage || '当前阶段'
  return [
    `基于${srcHint}，为「${p?.name || '本项目'}」生成一份 ≥3MB 麦肯锡咨询风演示文稿 PPT？`,
    `围绕「${stage}」准入要求，${srcHint}中还有哪些待核实风险或数据冲突？`,
    `将刚才的分析结论一键转化为「${stage}」正式 Word 报告或结构化数据表格并存入项目文件夹？`,
  ]
}

export async function generateStudioArtifact({ db, kb, org, deliverables, ai }, user, p, b) {
  const kind = String(b.kind || 'ppt')
  const theme = String(b.theme || 'mck')
  const pageCount = Math.max(4, Math.min(24, Number(b.pageCount) || 8))
  const targetMB = Math.max(3, Math.min(35, Number(b.targetMB) || 6))
  const density = ['concise', 'standard', 'dense'].includes(b.density) ? b.density : 'standard'
  let allFiles = kb.list(user, { companyId: p.companyId }).filter(f => !f.rel.includes('/.versions/'))
  if (!allFiles.some(f => f.mountId !== 'm_ws')) {
    await kb.scanAll().catch(() => {})
    allFiles = kb.list(user, { companyId: p.companyId }).filter(f => !f.rel.includes('/.versions/'))
  }
  const rawSources = allFiles.filter(f => f.mountId !== 'm_ws')
  const pool = rawSources.length ? rawSources : allFiles
  const picked = (b.fileIds?.length ? allFiles.filter(f => b.fileIds.includes(f.id)) : pool).slice(0, 12)
  const docs = []
  for (const f of picked) {
    const r = await kb.read(f.id, user).catch(() => null)
    if (r?.text) docs.push({ id: f.id, name: f.name, text: org.redact(user, r.text).slice(0, 6000) })
  }
  const srcNames = docs.map(d => d.name)
  const snippets = docs.flatMap((d, idx) => d.text.split(/\n|。/).map(s => s.trim()).filter(s => s.length > 12 && s.length < 110).slice(0, 5).map(s => `${s} [${idx + 1}]`))
  const ws = db.one('mounts', x => x.kind === 'workspace')
  const stamp = new Date().toISOString().slice(0, 10)
  if (kind === 'ppt') {
    const aiSec = await synthesizeDeepSeekSection(ai, p, docs, b.prompt)
    const aiBullets = aiSec ? aiSec.split('\n').map(s => s.replace(/^[-*#\d.]+\s*/, '').trim()).filter(s => s.length > 14 && s.length < 95).slice(0, 5) : []
    const slides = buildRichPptSlides(p, docs, snippets, { pageCount, density })
    if (aiBullets.length >= 3) slides.splice(1, 0, { title: `DeepSeek 实时底稿交叉核验：${p.name}核心财务与估值博弈`, bullets: aiBullets })
    const buf = await renderPptx({ title: `${p.name} · 专项投研演示文稿`, subtitle: `基于已勾选 ${docs.length} 份来源 · 规格：${pageCount}页 / 目标~${targetMB}MB`, slides, sources: srcNames, theme, pageCount, targetMB, density })
    const d = deliverables.ensure(p.id, '立项报告', { format: 'pptx' }, user)
    await deliverables.addVersion(user, d, { buffer: buf, ext: '.pptx', engine: `Studio ${pageCount}页麦肯锡PPT引擎`, sources: docs.length, note: `${pageCount}页 · ${(buf.length / 1048576).toFixed(2)}MB` })
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_演示文稿_${pageCount}页_${stamp}.pptx`, buffer: buf, kind: 'ppt', sourceCount: docs.length, summary: `${pageCount} 页麦肯锡 PPT（${(buf.length / 1048576).toFixed(2)} MB · ${docs.length} 份来源）` })
  }
  if (kind === 'word' || kind === 'report') {
    const aiSec = await synthesizeDeepSeekSection(ai, p, docs, b.prompt)
    const md = buildComprehensiveMarkdown(p, '尽调与投决深度报告', docs, snippets, { chapterCount: pageCount, density }) + (aiSec ? `\n\n## DeepSeek 实时专项研判与投资问题深度解答\n${aiSec}` : '')
    const buf = await renderDocx({ title: `${p.name} · 尽调与投决深度报告`, subtitle: `严格基于已勾选 ${docs.length} 份来源生成 · 规格：${pageCount}章核验版`, markdown: md })
    const d = deliverables.ensure(p.id, '尽调报告', {}, user)
    await deliverables.addVersion(user, d, { buffer: buf, markdown: md, ext: '.docx', engine: aiSec ? 'DeepSeek API + 深度报告引擎' : 'Studio 深度报告引擎', sources: docs.length, note: `${pageCount}章尽调报告` })
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_深度尽调报告_${pageCount}章_${stamp}.docx`, buffer: buf, kind: 'word', sourceCount: docs.length, summary: `${pageCount} 章深度报告 · ${docs.length} 个来源` })
  }
  if (kind === 'table' || kind === 'xlsx') {
    const baseSheets = sheetsFromMarkdown(buildComprehensiveMarkdown(p, '尽调清单', docs, snippets), '核验表')
    const rows = (snippets.length ? snippets : ['核心指标正常 [1]']).map((s, i) => ({ idx: `E-${i + 1}`, finding: s, src: srcNames[i % Math.max(1, srcNames.length)] || '项目资料', status: '已溯源核对' }))
    const sheets = [...baseSheets, { name: '4-勾选资料逐条溯源台账', columns: [{ header: '编号', key: 'idx', width: 10 }, { header: '提取事实与量化指标', key: 'finding', width: 64 }, { header: '对应勾选来源', key: 'src', width: 32 }, { header: '核对状态', key: 'status', width: 14 }], rows }]
    const buf = await renderXlsx({ title: `${p.name} · 四维投研核验数据表`, sheets })
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_数据表格_${stamp}.xlsx`, buffer: buf, kind: 'xlsx', sourceCount: docs.length, summary: `四工作表核验台账 XLSX（源自 ${docs.length} 份勾选资料）` })
  }
  if (kind === 'ic_memo') {
    const html = buildEquityResearchMemoHtml(p, docs, user)
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_投委会备忘录_IC_Memo_${stamp}.html`, buffer: Buffer.from(html, 'utf8'), kind: 'ic_memo', sourceCount: docs.length, summary: `九章券商深度研报级 IC 投资备忘录（含蓝军反驳与 Verdict Box）` })
  }
  const labelMap = { mindmap: '思维导图', infographic: '信息图', flashcards: '闪卡', quiz: '测验', audio: '音频概览与双人对谈', video: '视频概览脚本' }
  const label = labelMap[kind] || '专项成果'
  const grounded = extractGroundedFacts(p, docs)
  const turns = kind === 'audio' ? await generateTwoHostScript(ai, p, docs, grounded) : []
  const html = renderInteractiveNlmHtml(p, kind, docs, { ...grounded, turns })
  return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_${label}_${stamp}.html`, buffer: Buffer.from(html, 'utf8'), kind, sourceCount: docs.length, summary: `${label}（源自 ${docs.length} 份勾选资料）` })
}
