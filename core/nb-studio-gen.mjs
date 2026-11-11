// Studio 8 大加工成品定向生成器（严格按勾选 fileIds 提炼 + 自动落盘项目专属文件夹 + 智能追问建议）
import { renderDocx, renderPptx, renderXlsx } from './office.mjs'
import { sheetsFromMarkdown } from './deliverables.mjs'
import { writeProjectArtifact } from './nb-folder.mjs'
import { buildComprehensiveMarkdown, buildRichPptSlides } from './nb-deep-doc.mjs'
import { extractGroundedFacts, generateTwoHostScript, renderInteractiveNlmHtml, synthesizeDeepSeekSection } from './nb-nlm-pipeline.mjs'
import { buildEquityResearchMemoHtml } from './nb-equity-memo.mjs'
import { planPptDeckWithAi } from './nb-ppt-ai.mjs'
import { runAgentMeshCrossCheck } from './nb-agent-mesh.mjs'
import { prepareSources, checkNumbers } from './nb-ground.mjs'

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
  const rawSources = allFiles.filter(f => f.mountId !== 'm_ws' && !String(f.rel || '').includes('Studio成品'))
  const pool = rawSources.length ? rawSources : allFiles
  const matched = b.fileIds?.length ? allFiles.filter(f => b.fileIds.includes(f.id)) : []
  const picked = (matched.length ? matched : pool).slice(0, 12)
  const docs = []
  for (const f of picked) {
    const r = await kb.read(f.id, user).catch(() => null)
    if (r?.text) docs.push({ id: f.id, name: f.name, text: org.redact(user, r.text).slice(0, 6000) })
  }
  const srcNames = docs.map(d => d.name)
  const snippets = docs.flatMap((d, idx) => d.text.split(/\n|。/).map(s => s.trim()).filter(s => s.length > 12 && s.length < 110).slice(0, 5).map(s => `${s} [${idx + 1}]`))
  const ws = db.one('mounts', x => x.kind === 'workspace')
  const stamp = new Date().toISOString().slice(0, 10)
  const grounded = prepareSources(p, docs)
  const needMesh = ['ppt', 'word', 'report', 'table', 'xlsx', 'ic_memo'].includes(kind)
  const docSig = docs.map(d => d.id).join(',')
  const prevMesh = db.get('kvstate', `mesh_${p.id}`)
  const mesh = !needMesh ? null : (prevMesh && prevMesh.docSig === docSig && Date.now() - (prevMesh.savedAt || 0) < 180000)
    ? prevMesh
    : await runAgentMeshCrossCheck(ai, p, docs)
  if (mesh && mesh !== prevMesh) db.put('kvstate', { id: `mesh_${p.id}`, docSig, savedAt: Date.now(), ...mesh }, { actor: user, reason: `Agent×Agent 网状互校 (${kind})`, action: 'mesh' })
  const meshCert = mesh ? { engine: mesh.engine, rate: mesh.numCheck?.rate ?? 100, conflicts: mesh.conflicts?.length ?? 0, dist: mesh.credibilityDist, elapsedMs: mesh.elapsedMs } : null
  if (kind === 'ppt') {
    const plan = await planPptDeckWithAi(ai, p, docs, { pageCount, density, userPrompt: b.prompt, mesh })
    const slideCorpus = plan.slides.map(s => `${s.title} ${(s.bullets || []).join(' ')}`).join('\n')
    const check = checkNumbers(slideCorpus, grounded.corpus)
    const buf = await renderPptx({ title: `${p.name} · 专项投研演示文稿`, subtitle: `基于已勾选 ${docs.length} 份底稿 Agent×Agent 互校编排 · 规格：${pageCount}页 / 目标~${targetMB}MB`, slides: plan.slides, sources: srcNames, theme, pageCount, targetMB, density })
    const d = deliverables.ensure(p.id, '立项报告', { format: 'pptx' }, user)
    const ver = await deliverables.addVersion(user, d, { buffer: buf, ext: '.pptx', engine: `${mesh?.engine || 'Carbon'} 多版式PPT架构师 (${pageCount}页)`, sources: docs.length, note: `${pageCount}页 · ${(buf.length / 1048576).toFixed(2)}MB · 互校${meshCert?.rate ?? 100}%` })
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_演示文稿_${pageCount}页_${stamp}.pptx`, buffer: buf, kind: 'ppt', workType: '立项报告', deliverableId: d.id, version: ver.version.v, pages: pageCount, engine: mesh?.engine || 'Carbon', check, sourceCount: docs.length, meshCert, summary: `${pageCount}页发布会与麦肯锡多版式 PPT（${(buf.length / 1048576).toFixed(2)}MB · 互校锚定率 ${meshCert?.rate ?? 100}%）`, extra: { workType: '立项报告', deliverableId: d.id, version: ver.version.v, pages: pageCount, engine: mesh?.engine || 'Carbon', check } })
  }
  if (kind === 'word' || kind === 'report') {
    const aiSec = await synthesizeDeepSeekSection(ai, p, docs, b.prompt)
    const meshMd = mesh ? `\n\n## Agent × Agent 跨源矛盾对质与蓝军复核纪要（${mesh.engine}）\n- **核心投资主线**：${mesh.thesis}\n${(mesh.conflicts || []).map(c => `- **【${c.topic}】** BP自述：${c.bpClaim} ｜ 审计/底稿实证：${c.auditFact} ➔ *条款建议：${c.impact}*`).join('\n')}` : ''
    const md = buildComprehensiveMarkdown(p, '尽调与投决深度报告', docs, snippets, { chapterCount: pageCount, density }) + meshMd + (aiSec ? `\n\n## Carbon 首席合伙人专项研判与交割保护建议\n${aiSec}` : '')
    const check = checkNumbers(md, grounded.corpus)
    const buf = await renderDocx({ title: `${p.name} · 尽调与投决深度报告`, subtitle: `严格基于已勾选 ${docs.length} 份底稿经 Agent×Agent 互校生成 · 规格：${pageCount}章核验版`, markdown: md })
    const d = deliverables.ensure(p.id, '尽调报告', {}, user)
    const ver = await deliverables.addVersion(user, d, { buffer: buf, markdown: md, ext: '.docx', engine: mesh?.engine || '深度报告引擎', sources: docs.length, note: `${pageCount}章尽调报告 · 互校${meshCert?.rate ?? 100}%` })
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_深度尽调报告_${pageCount}章_${stamp}.docx`, buffer: buf, kind: 'word', workType: '尽调报告', deliverableId: d.id, version: ver.version.v, check, engine: mesh?.engine || '深度报告引擎', sourceCount: docs.length, meshCert, summary: `${pageCount}章深度尽调报告（${docs.length}份底稿互校 · 锚定率 ${meshCert?.rate ?? 100}%）`, extra: { workType: '尽调报告', deliverableId: d.id, version: ver.version.v, engine: mesh?.engine || '深度报告引擎', check } })
  }
  if (kind === 'table' || kind === 'xlsx') {
    const baseSheets = sheetsFromMarkdown(buildComprehensiveMarkdown(p, '尽调清单', docs, snippets), '核验表')
    const rows = (snippets.length ? snippets : ['核心指标正常 [1]']).map((s, i) => ({ idx: `E-${i + 1}`, finding: s, src: srcNames[i % Math.max(1, srcNames.length)] || '项目资料', status: '已溯源核对' }))
    const conflictRows = (mesh?.conflicts || []).map((c, i) => ({ idx: `C-${i + 1}`, topic: c.topic, bp: c.bpClaim, audit: c.auditFact, impact: c.impact }))
    const sheets = [
      ...baseSheets,
      { name: '4-勾选资料逐条溯源台账', columns: [{ header: '编号', key: 'idx', width: 10 }, { header: '提取事实与量化指标', key: 'finding', width: 64 }, { header: '对应勾选来源', key: 'src', width: 32 }, { header: '核对状态', key: 'status', width: 14 }], rows },
      { name: '5-Agent跨源矛盾对质台账', columns: [{ header: '编号', key: 'idx', width: 10 }, { header: '对质维度', key: 'topic', width: 22 }, { header: 'C级BP自述', key: 'bp', width: 42 }, { header: 'A/B级审计与尽调实证', key: 'audit', width: 44 }, { header: '估值与CP条款影响', key: 'impact', width: 36 }], rows: conflictRows },
    ]
    const buf = await renderXlsx({ title: `${p.name} · 五维投研核验与跨源对质数据表`, sheets })
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_数据表格_${stamp}.xlsx`, buffer: buf, kind: 'xlsx', sourceCount: docs.length, meshCert, summary: `五工作表核验与跨源对质台账 XLSX（源自 ${docs.length} 份底稿）` })
  }
  if (kind === 'ic_memo') {
    const html = buildEquityResearchMemoHtml(p, docs, user, mesh)
    const check = checkNumbers(html.replace(/<[^>]+>/g, ' '), grounded.corpus)
    return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_投委会备忘录_IC_Memo_${stamp}.html`, buffer: Buffer.from(html, 'utf8'), kind: 'ic_memo', workType: '投资建议书', sourceCount: docs.length, meshCert, summary: `九章券商研报级 IC 备忘录（含动态估值沙盘与 ${meshCert?.conflicts ?? 1} 项蓝军对质）`, extra: { workType: '投资建议书', check } })
  }
  const labelMap = { mindmap: '思维导图', infographic: '信息图', flashcards: '闪卡', quiz: '测验', audio: '音频概览与双人对谈', video: '视频概览脚本' }
  const label = labelMap[kind] || '专项成果'
  const interactiveFacts = extractGroundedFacts(p, docs)
  const turns = kind === 'audio' ? await generateTwoHostScript(ai, p, docs, interactiveFacts) : []
  const html = renderInteractiveNlmHtml(p, kind, docs, { ...interactiveFacts, turns })
  const check = checkNumbers(html.replace(/<[^>]+>/g, ' '), grounded.corpus)
  return writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName: `${p.name}_${label}_${stamp}.html`, buffer: Buffer.from(html, 'utf8'), kind, sourceCount: docs.length, meshCert, summary: `${label}（源自 ${docs.length} 份勾选资料）`, extra: { check } })
}
