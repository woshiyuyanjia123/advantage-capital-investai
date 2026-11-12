// 成果编制的质量约束：内容来自底稿、数字可核对、模型失败时如实退回摘编。
import './helpers.mjs' // 先把密钥文件指到临时目录，再加载后端
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { createCore } = await import('../core/index.mjs')
const { prepareSources, checkNumbers, numbersIn } = await import('../core/nb-ground.mjs')
const { normalizeDeck, buildOfflineDeck, renderDeck, deckText } = await import('../core/nb-deck.mjs')
const { unzipAll } = await import('../core/office.mjs')

const req = (op, body, method = body ? 'POST' : 'GET') => new Request(
  `http://127.0.0.1/api/investai?${new URLSearchParams(method === 'GET' ? { op, ...(body || {}) } : { op })}`,
  method === 'POST' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {},
)
const call = async (core, op, body, method) => (await core.handle(req(op, body, method))).json()
const DOCS = [
  { name: '审计报告摘要.pdf', text: '主要财务数据（单位：万元）\n营业收入：65,300\n净利润：3,900\n应收账款：24,800\n说明：营业收入较 BP 披露口径低，差异来自一笔 2,700 万元合同的收入确认时点。' },
  { name: '客户合同.xlsx', text: '## 工作表：客户合同\n客户,合同金额（万元）,签订日期\n甲公司,12800,2025-11\n乙公司,9600,2026-02\n丙公司,2700,2025-12' },
  { name: '访谈纪要.md', text: '- 毛利率由 21% 降至 17%。\n- 存在一项诉讼，金额约 800 万元，尚未判决。\n待核实：海外认证进度。' },
]
const P = { name: '测试项目 B轮', stage: '尽职调查', fields: { round: 'B轮', amount: '1.2 亿元', valuation: '投前 45 亿元' } }

async function slidesText(buf) {
  return unzipAll(buf).filter(([k]) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).map(([, v]) => Buffer.from(v).toString('utf8').replace(/<[^>]+>/g, ' ')).join('\n')
}

test('Q1 底稿整理：带千分位的「名称：数值」是键值表，不会被拆成逗号分隔的表格', () => {
  const G = prepareSources(P, DOCS)
  const kv = G.tables.find(t => t.keyValue)
  assert.deepEqual(kv.rows[0], ['营业收入', '65,300'])
  const csv = G.tables.find(t => !t.keyValue)
  assert.deepEqual(csv.head, ['客户', '合同金额（万元）', '签订日期'])
  assert.equal(csv.rows.length, 3)
  assert.ok(G.passages.every(x => !x.text.includes('12800')), '表格行不重复出现在句子里')
  assert.deepEqual(numbersIn('甲公司,12800,2025-11').map(x => x.v), ['12800', '2025', '11'])
})

test('Q2 数字核对：底稿里有的算一致，写明测算的算测算，其余列出来', () => {
  const G = prepareSources(P, DOCS)
  const c = checkNumbers('营业收入 65,300 万元 [1]，净利润 3,900 万元。净利率约 6.0%（测算：3,900÷65,300）。同行平均毛利率 35%。估值 45 亿元。', G.corpus)
  assert.equal(c.unmatched.length, 1)
  assert.equal(c.unmatched[0].value, '35')
  assert.ok(c.derived >= 1 && c.matched >= 5)
  assert.equal(checkNumbers('收入 6.53 亿元', G.corpus).unmatched.length, 0, '亿元和万元换算后的写法算一致')
})

test('Q3 没有模型时的演示文稿只排底稿里的内容，材料不够就少排，不出现套话和假数字', async () => {
  const G = prepareSources(P, DOCS)
  const deck = buildOfflineDeck(P, G, { pageCount: 12 })
  deck.sources = G.sources
  assert.ok(deck.slides.length >= 3 && deck.slides.length < 10, `页数随材料而定：${deck.slides.length}`)
  const text = deckText(deck)
  assert.equal(checkNumbers(text, G.corpus).unmatched.length, 0)
  for (const junk of ['核验台账', '交叉比对', '历史基期', '100%']) assert.ok(!text.includes(junk), `不应出现「${junk}」`)
  const chart = deck.slides.flatMap(s => s.blocks).find(b => b.type === 'chart')
  assert.deepEqual(chart.series[0].values, [12800, 9600, 2700])
  const buf = await renderDeck(deck)
  assert.ok(buf.length < 1024 * 1024, '文件大小来自内容，不塞填充图片')
  const xml = await slidesText(buf)
  assert.ok(xml.includes('12800') || xml.includes('12,800'))
})

test('Q4 模型给的页面会被清洗：坏块和空页去掉，图表数值必须是数字', () => {
  const deck = normalizeDeck({ slides: [
    { title: '有效页', blocks: [{ type: 'points', items: [{ head: '甲', text: '内容 😀' }] }, { type: 'chart', labels: ['a', 'b'], series: [{ name: 's', values: ['1,200', 'x'] }] }, { type: 'unknown' }] },
    { title: '空页', blocks: [{ type: 'table', head: ['只有一列'], rows: [] }] },
    { blocks: [{ type: 'text', text: '没有标题' }] },
  ] }, { title: 'T' })
  assert.equal(deck.slides.length, 1)
  assert.equal(deck.slides[0].blocks.length, 1)
  assert.equal(deck.slides[0].blocks[0].items[0].text, '内容')
})

test('Q5 接上模型：先定提纲再分批撰写，坏 JSON 重试；模型不可用时退回摘编并写明原因', async () => {
  const calls = []
  let bad = true
  const server = createServer(async (rq, rs) => {
    let body = ''
    for await (const ch of rq) body += ch
    const j = JSON.parse(body || '{}')
    const user = j.messages?.at(-1)?.content ?? ''
    calls.push({ user, max: j.max_tokens })
    let out = '正常'
    if (user.includes('安排一份')) out = JSON.stringify({ subtitle: '测试结论', stats: [], slides: [{ no: 1, kicker: '判断', title: '第一页的判断', purpose: 'p', evidence: 'e', form: 'f' }, { no: 2, kicker: '数据', title: '第二页的判断', purpose: 'p', evidence: 'e', form: 'f' }], gaps: ['缺订单台账'] })
    else if (user.includes('现在写第')) out = bad ? (bad = false, '这不是 JSON') : JSON.stringify({ slides: [
      { no: 1, title: '第一页的判断', blocks: [{ type: 'points', items: [{ head: '要点', text: '海外收入占比 22% [1]，同行平均 35%。' }] }], takeaway: '判断一', cites: [1], notes: '讲稿' },
      { no: 2, title: '第二页的判断', blocks: [{ type: 'stats', items: [{ value: '45 亿元', label: '投前估值' }, { value: '5 亿元', label: '本轮融资' }] }], takeaway: '判断二', cites: [1], notes: '讲稿' },
    ] })
    rs.writeHead(200, { 'content-type': 'text/event-stream' })
    rs.end(`data: ${JSON.stringify({ choices: [{ delta: { content: out } }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const dir = await mkdtemp(join(tmpdir(), 'nb-q-'))
  const core = await createCore({ dir, mode: 'dsh' })
  try {
    const st = await call(core, 'state')
    const p = st.projects.find(x => x.name.includes('衡远')) ?? st.projects[0]
    // 未配置模型：摘编，并说明原因
    const off = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'ppt' })
    assert.equal(off.engine, '底稿摘编')
    assert.ok(off.engineNote && off.summary.includes('底稿摘编'))
    assert.equal(off.check.unmatched.length, 0)
    assert.ok(off.bytes < 1024 * 1024)

    await call(core, 'nb.api.connect', { mode: 'local', localBaseURL: `http://127.0.0.1:${server.address().port}/v1`, localModel: 'fake' })
    const art = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'ppt', pageCount: 4 })
    assert.match(art.engine, /fake/)
    assert.equal(art.pages, 4)
    const plan = calls.find(c => c.user.includes('安排一份'))
    assert.ok(plan.max >= 16000, '给足输出额度')
    assert.ok(plan.user.includes('【底稿 [1]') && plan.user.includes('2,700'), '提纲阶段拿到底稿原文')
    assert.equal(calls.filter(c => c.user.includes('现在写第')).length, 2, '坏 JSON 重试一次')
    assert.deepEqual(art.check.unmatched.map(u => u.value), ['35'], '模型写出的底稿外数字被列出来')
    const xml = await slidesText(await readFile(art.fullPath))
    assert.ok(xml.includes('第一页的判断') && xml.includes('判断二') && xml.includes('缺订单台账'))

    // 模型挂掉：退回摘编，不报错，不冒充模型
    await new Promise(r => server.close(r))
    const down = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'word' })
    assert.equal(down.engine, '底稿摘编')
    assert.ok(down.engineNote)
    const memo = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'ic_memo' })
    assert.ok(memo.name.endsWith('.docx'))
    for (const kind of ['table', 'mindmap', 'flashcards', 'quiz', 'audio', 'video', 'infographic']) {
      const a = await call(core, 'nb.studio.make', { projectId: p.id, kind })
      assert.ok(a.bytes > 500 && a.summary, kind)
      if (a.name.endsWith('.html')) {
        const html = await readFile(a.fullPath, 'utf8')
        for (const junk of ['国产替代', '订单饱满', '高复购']) assert.ok(!html.includes(junk), `${kind} 不应出现编造的「${junk}」`)
      }
    }
  } finally {
    server.close()
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('Q6 报送成品：按成品对应的工作项报送，不重复加版本；不认项目文件夹以外的路径', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nb-q6-'))
  const core = await createCore({ dir, mode: 'dsh' })
  try {
    const st = await call(core, 'state')
    const p = st.projects.find(x => x.name.includes('衡远')) ?? st.projects[0]
    const art = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'ppt' })
    assert.equal(art.workType, '立项报告')
    const sub = await call(core, 'nb.flow.submit', { projectId: p.id, artifactPath: art.fullPath, artifactName: art.name, autoSubmitReview: true })
    assert.equal(sub.workType, '立项报告')
    assert.equal(sub.version, art.version, '生成时已存过的版本直接报送')
    const outside = await core.handle(req('nb.flow.submit', { projectId: p.id, artifactPath: join(dir, '..', 'x.pptx'), artifactName: '不存在.pptx' }))
    assert.equal(outside.status, 400)
    const xlsx = await call(core, 'nb.studio.make', { projectId: p.id, kind: 'table' })
    const noNode = await core.handle(req('nb.flow.submit', { projectId: p.id, artifactPath: xlsx.fullPath, artifactName: xlsx.name }))
    assert.equal(noNode.status, 400, '没有对应工作项时要求选择，不默认塞进第一个')
  } finally {
    await core.close()
    await rm(dir, { recursive: true, force: true })
  }
})
