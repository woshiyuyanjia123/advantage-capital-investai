// 没有模型时的报告：把底稿里的登记要素、原文句子和表格按主题排好，不补一句底稿以外的话。
import { prepareSources, projectFacts } from './nb-ground.mjs'

const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(c => String(c ?? '').replace(/\|/g, '／')).join(' | ')} |`)].join('\n')

/** 底稿摘编报告（Markdown）。docs: [{ name, text }]。 */
export function buildComprehensiveMarkdown(p, type = '尽职调查报告', docs = []) {
  const G = prepareSources(p, docs)
  const used = new Set()
  const sec = (topic, max = 10) => {
    const list = G.passages.filter(x => x.topics.includes(topic) && !used.has(x.text)).slice(0, max)
    list.forEach(x => used.add(x.text))
    return list.map(x => `- ${x.text} [${x.n}]`).join('\n')
  }
  const facts = projectFacts(p)
  const parts = [
    `# ${p?.name || '项目'} ${type}`,
    `> 本稿未调用模型，内容是 ${docs.length} 份底稿的原文摘编，按主题排列，没有加入分析和结论。带 [n] 的是底稿编号，见文末。`,
  ]
  const add = (title, body) => { if (body) parts.push(`## ${title}`, body) }
  add('项目登记要素', facts.length ? mdTable(['要素', '内容'], facts) : '')
  add('主体情况', sec('overview'))
  add('业务与客户', sec('business'))
  add('底稿中的数据表', G.tables.map(t => `### ${t.title} [${t.n}]\n\n${mdTable(t.head, t.rows.slice(0, 30))}`).join('\n\n'))
  add('财务与订单', sec('finance'))
  add('风险与口径差异', sec('risk'))
  add('待核实事项', sec('todo'))
  add('其他摘录', G.passages.filter(x => !used.has(x.text)).slice(0, 12).map(x => `- ${x.text} [${x.n}]`).join('\n'))
  add('依据的底稿', G.sources.map(s => `- [${s.n}] 《${s.name}》`).join('\n') || '- 未选择底稿')
  return parts.join('\n\n')
}
