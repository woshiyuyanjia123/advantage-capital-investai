// 成果编制：按勾选的底稿生成演示文稿、报告、数据表、投委会备忘录和互动成品，存进项目文件夹。
// 有模型时由模型通读底稿后撰写；没有模型、策略不允许外发或模型失败时，退回底稿原文摘编，并在成品和返回值里写明原因。
// 每份成品都把出现的数字和底稿核对一遍，结果随成品一起返回（check）。
import { renderDocx, renderXlsx } from './office.mjs'
import { writeProjectArtifact } from './nb-folder.mjs'
import { buildComprehensiveMarkdown } from './nb-deep-doc.mjs'
import { prepareSources, checkNumbers, checkLine } from './nb-ground.mjs'
import { authorDeck, authorReport, authorTable } from './nb-author.mjs'
import { buildOfflineDeck, renderDeck, deckText, deckToMarkdown } from './nb-deck.mjs'
import { buildInteractive, INTERACTIVE } from './nb-interactive.mjs'
import { WORK_TYPES } from './workflow.mjs'

export function buildFollowUps(p, question = '', checkedNames = [], lastAnswer = '', lackingWorks = []) {
  const src = checkedNames[0] ? `《${checkedNames[0].replace(/\.[^.]+$/, '')}》` : '已勾选的底稿'
  const stage = p?.stage || '当前阶段'
  const qClean = String(question || '').trim()
  const aClean = String(lastAnswer || '').trim()
  const needWork = lackingWorks[0] || `${stage}核心材料`
  if (qClean || aClean) {
    const topic = (qClean || aClean).replace(/[？?。！!；;\n]+/g, ' ').trim().slice(0, 22) || '上述问题'
    const unverified = (aClean.match(/(?:待核实|未提供|尚未|缺失|差异|风险|冲突)[^。\n]{0,26}/) || [])[0]
    return [
      `围绕「${topic}」，逐条对照 ${src} 与其他勾选底稿，确认数字口径是否一致。`,
      unverified ? `针对「${unverified}」，向被投企业或中介补充调取哪些关键底稿？` : `针对「${topic}」反映出的问题，还有哪些关键尽调事项尚未核实？`,
      `把「${topic}」的核心判断与依据整理成可写入「${needWork}」的结论段（保留 [n] 引用）。`,
    ]
  }
  return [
    `${src}和其他底稿在核心财务与业务指标上有没有口径不一致的地方？`,
    lackingWorks.length ? `按「${stage}」准入要求，先核查「${lackingWorks.slice(0, 2).join('、')}」还缺哪些客观依据？` : `按「${stage}」的准入要求，这个项目还缺哪些材料、哪些事项没核实？`,
    `把针对「${needWork}」的关键发现整理成给投委会的汇报提纲，每页一个判断。`,
  ]
}

const MEMO_PROMPT = '这是提交投委会的投资备忘录。章节按下面的顺序考虑，底稿没有材料的部分并入相邻章节或列入待补充信息：交易概要；公司与团队；行业与需求；产品、技术与客户；竞争与替代；财务表现与口径核对；估值与条款；反方意见（站在否决这个项目的立场，列出最强的三到五条理由，逐条写明底稿里的依据）；结论与交割前必须完成的事项。结论一章必须给出明确态度（建议推进、暂缓或放弃）和理由；不打分、不评星。'

/** 项目记录里只存阶段的 id，这里补上阶段名给成品和提示词用；不写回数据库。 */
export function withStage(db, p) {
  if (!p || p.stage) return p
  const name = db.get('workflows', p.workflowId)?.stages?.find(s => s.id === p.stageId)?.name
  return name ? Object.defineProperty({ ...p }, 'stage', { value: name, enumerable: false }) : p
}

/** 读出勾选的底稿（没勾选时用项目的全部底稿），返回正文和其中最高的密级。成品自己不算底稿。 */
export async function gatherDocs({ kb, org }, user, p, fileIds) {
  let allFiles = kb.list(user, { projectId: p.id }).filter(f => !f.rel.includes('/.versions/'))
  if (!allFiles.some(f => f.mountId !== 'm_ws')) {
    await kb.scanAll().catch(() => {})
    allFiles = kb.list(user, { projectId: p.id }).filter(f => !f.rel.includes('/.versions/'))
  }
  const rawSources = allFiles.filter(f => f.mountId !== 'm_ws' && !f.rel.includes('/Studio成品/'))
  if (Array.isArray(fileIds) && fileIds.length === 0) {
    throw Object.assign(new Error('请至少勾选 1 份底稿后再生成成果'), { status: 400 })
  }
  const matched = Array.isArray(fileIds) && fileIds.length ? allFiles.filter(f => fileIds.includes(f.id)) : []
  const picked = (matched.length ? matched : rawSources.length ? rawSources : allFiles).slice(0, 20)
  const docs = []
  let levelMax = 0
  for (const f of picked) {
    const r = await kb.read(f.id, user).catch(() => null)
    if (!r?.text?.trim()) continue
    docs.push({ id: f.id, name: f.name, level: f.level ?? 1, text: org.redact(user, r.text).slice(0, 80000) })
    levelMax = Math.max(levelMax, f.level ?? 1)
  }
  return { docs, levelMax }
}

export async function generateStudioArtifact({ db, kb, org, deliverables, ai }, user, p, b) {
  p = withStage(db, p)
  const kind = String(b.kind || 'ppt')
  const theme = String(b.theme || 'mck')
  const pageCount = Math.max(4, Math.min(24, Number(b.pageCount) || 8))
  const density = ['concise', 'standard', 'dense'].includes(b.density) ? b.density : 'standard'
  const { docs, levelMax } = await gatherDocs({ kb, org }, user, p, b.fileIds)
  if (!docs.length) throw Object.assign(new Error('所选底稿里没有读到文字，无法生成成果。请确认底稿已上传并解析完成。'), { status: 400 })
  const G = prepareSources(p, docs)
  const route = await ai?.route?.(levelMax).catch(e => ({ adapter: null, reason: e.message })) ?? { adapter: null, reason: '未配置模型' }
  const ws = db.one('mounts', x => x.kind === 'workspace')
  const stamp = new Date().toISOString().slice(0, 10)
  const save = (fileName, buffer, meta) => writeProjectArtifact({ db, kb, dir: ws.path }, user, p, { fileName, buffer, kind, sourceCount: docs.length, ...meta })
  const describe = (engine, note) => engine ? `${engine} 撰写` : `底稿摘编（${note}）`

  if (kind === 'ppt') {
    let deck = null, engine = '', note = route.adapter ? '' : route.reason, issues = []
    if (route.adapter) {
      try {
        const r = await authorDeck(route.adapter, p, docs, { pageCount, density, prompt: b.prompt })
        deck = r.deck; issues = r.issues; engine = route.label
      } catch (e) { note = `模型撰稿失败：${e.message}` }
    }
    if (!deck) deck = buildOfflineDeck(p, G, { pageCount })
    deck.sources = G.sources
    deck.kicker ||= [p.stage, p.fields?.round].filter(Boolean).join(' · ')
    const check = checkNumbers(deckText(deck), G.corpus)
    deck.check = check
    deck.engineNote = engine ? `正文由 ${engine} 依据底稿撰写。${issues.join('；')}` : `本稿未调用模型，内容为底稿原文摘编（${note}）。`
    const buf = await renderDeck(deck, { theme })
    const pages = deck.slides.length + 2
    const curPptWork = (p.works ?? []).find(w => w.stageId === p.stageId && WORK_TYPES[w.type]?.format === 'pptx' && w.status !== 'done')
      ?? (p.works ?? []).find(w => w.stageId === p.stageId && WORK_TYPES[w.type]?.format === 'pptx')
    const pptType = b.workType || curPptWork?.type || '立项报告'
    const d = deliverables.ensure(p.id, pptType, { workId: curPptWork?.id, format: 'pptx' }, user)
    const ver = await deliverables.addVersion(user, d, { buffer: buf, markdown: deckToMarkdown(deck), ext: '.pptx', engine: engine || '底稿摘编', sources: docs.length, note: `${pages} 页`, preserveFinal: d.status === 'final', richDeck: true })
    return save(`${p.name}_演示文稿_${pages}页_${stamp}.pptx`, buf, { workType: d.type, deliverableId: d.id, version: ver.version.v, summary: `${pages} 页 · ${describe(engine, note)} · ${checkLine(check)}`, engine: engine || '底稿摘编', engineNote: note, check, issues, pages })
  }

  if (kind === 'word' || kind === 'report' || kind === 'ic_memo') {
    const memo = kind === 'ic_memo'
    const type = memo ? '投资备忘录' : '尽职调查报告'
    const chapters = memo ? 9 : Math.max(3, Math.min(12, pageCount))
    let md = '', engine = '', note = route.adapter ? '' : route.reason, issues = []
    if (route.adapter) {
      try {
        const r = await authorReport(route.adapter, p, docs, { type, chapters, density, prompt: [memo ? MEMO_PROMPT : '', b.prompt].filter(Boolean).join('\n') })
        md = r.markdown; issues = r.issues; engine = route.label
      } catch (e) { note = `模型撰稿失败：${e.message}` }
    }
    if (!md) md = buildComprehensiveMarkdown(p, memo ? '投资备忘录（底稿摘编，结论待投资经理填写）' : type, docs)
    const check = checkNumbers(md, G.corpus)
    const title = md.match(/^#\s+(.+)$/m)?.[1] ?? `${p.name} ${type}`
    const buf = await renderDocx({ title, subtitle: `${engine ? `${engine} 依据 ${docs.length} 份底稿撰写` : `${docs.length} 份底稿的原文摘编`} · ${stamp}`, markdown: md.replace(/^#\s+.+\n+/, ''), footer: checkLine(check) + (check.unmatched.length ? `：${check.unmatched.slice(0, 8).map(u => u.value).join('、')}` : '') })
    const docWorkType = b.workType || (memo ? '投资建议书' : '尽调报告')
    const d = deliverables.ensure(p.id, docWorkType, {}, user)
    const ver = await deliverables.addVersion(user, d, { buffer: buf, markdown: md, ext: '.docx', engine: engine || '底稿摘编', sources: docs.length, note: type, preserveFinal: d.status === 'final' })
    const chars = md.replace(/\s/g, '').length
    return save(`${p.name}_${type}_${stamp}.docx`, buf, { workType: d.type, deliverableId: d.id, version: ver.version.v, summary: `约 ${chars} 字 · ${describe(engine, note)} · ${checkLine(check)}`, engine: engine || '底稿摘编', engineNote: note, check, issues })
  }

  if (kind === 'table' || kind === 'xlsx') {
    let aiSheet = null, engine = '', note = route.adapter ? '' : route.reason
    if (route.adapter) {
      try {
        aiSheet = await authorTable(route.adapter, p, docs, { prompt: b.prompt })
        engine = route.label
      } catch (e) { note = `模型制表失败：${e.message}` }
    }
    const sheets = []
    if (aiSheet) {
      sheets.push({
        name: aiSheet.sheetName,
        columns: aiSheet.columns.map((h, c) => ({ header: h, key: `c${c}`, width: Math.max(14, Math.min(42, h.length * 2 + 10)) })),
        rows: aiSheet.rows.map(r => Object.fromEntries(aiSheet.columns.map((_, c) => [`c${c}`, /^-?[\d,]+(\.\d+)?$/.test(r[c]) ? Number(r[c].replace(/,/g, '')) : r[c]]))),
        notes: aiSheet.note ? `${aiSheet.note}（由 ${engine} 整理）` : `由 ${engine} 依据勾选底稿整理`,
      })
    }
    sheets.push(...G.tables.slice(0, 12).map((t, i) => ({
      name: `${i + 1}-${t.title}`.slice(0, 28),
      columns: t.head.map((h, c) => ({ header: h || `列${c + 1}`, key: `c${c}`, width: Math.max(12, Math.min(40, String(h).length * 2 + 8)) })),
      rows: t.rows.map(r => Object.fromEntries(r.map((v, c) => [`c${c}`, /^-?[\d,]+(\.\d+)?$/.test(v) ? Number(v.replace(/,/g, '')) : v]))),
      notes: `来源：[${t.n}]《${t.source}》`,
    })))
    const numbered = G.passages.filter(x => /\d/.test(x.text))
    sheets.push({ name: '数据摘录', columns: [{ header: '编号', key: 'i', width: 8 }, { header: '底稿原文', key: 't', width: 80 }, { header: '来源', key: 's', width: 30 }, { header: '主题', key: 'k', width: 16 }], rows: numbered.map((x, i) => ({ i: i + 1, t: x.text, s: `[${x.n}] ${G.sources[x.n - 1].name}`, k: x.topics.map(t => ({ overview: '主体', business: '业务', finance: '财务', risk: '风险', todo: '待核实' })[t]).join('、') })) })
    const todo = G.passages.filter(x => x.topics.includes('todo') || x.topics.includes('risk'))
    if (todo.length) sheets.push({ name: '风险与待核实', columns: [{ header: '编号', key: 'i', width: 8 }, { header: '事项（底稿原文）', key: 't', width: 80 }, { header: '来源', key: 's', width: 30 }, { header: '责任人', key: 'o', width: 14 }, { header: '核实结果', key: 'r', width: 30 }], rows: todo.map((x, i) => ({ i: i + 1, t: x.text, s: `[${x.n}] ${G.sources[x.n - 1].name}`, o: '', r: '' })) })
    const checkSource = aiSheet ? aiSheet.rows.flat().join(' ') + ' ' + aiSheet.note : ''
    const check = checkSource ? checkNumbers(checkSource, G.corpus) : { total: 0, matched: 0, derived: 0, unmatched: [] }
    const buf = await renderXlsx({ title: `${p.name} 底稿数据表`, sheets })
    return save(`${p.name}_数据表_${stamp}.xlsx`, buf, { summary: `${sheets.length} 张工作表：${aiSheet ? '综合分析 1 张、' : ''}底稿原表 ${G.tables.length} 张、数据摘录 ${numbered.length} 条${todo.length ? `、风险与待核实 ${todo.length} 条` : ''}${aiSheet ? ` · ${describe(engine, note)}` : ''}`, engine: engine || '底稿摘编', engineNote: note, check })
  }

  const label = INTERACTIVE[kind] ?? '专项成果'
  const r = await buildInteractive(kind, p, docs, G, route, { prompt: b.prompt })
  const check = checkNumbers(r.text, G.corpus)
  return save(`${p.name}_${label}_${stamp}.html`, Buffer.from(r.html, 'utf8'), { summary: `${label} · ${describe(r.engine, r.note)} · ${checkLine(check)}`, engine: r.engine || '底稿摘编', engineNote: r.note, check })
}
