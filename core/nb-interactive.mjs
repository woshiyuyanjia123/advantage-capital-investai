// 互动成品：导图、闪卡、测验、对谈稿、讲解分镜、一页速览。输出单个 HTML 文件，展开和翻面用 <details>，不依赖外部资源。
// 有模型时由模型按底稿撰写；没有模型时只用底稿里的原文、表格和「名称：数值」条目，不编对话、不编选项。
import { authorStructured } from './nb-author.mjs'
import { projectFacts } from './nb-ground.mjs'

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
const str = (v, max = 400) => String(v ?? '').replace(/\p{Extended_Pictographic}|️/gu, '').trim().slice(0, max)
const arr = v => Array.isArray(v) ? v : []
export const INTERACTIVE = { mindmap: '思维导图', infographic: '一页速览', flashcards: '闪卡', quiz: '测验', audio: '对谈稿', video: '讲解分镜' }

const CSS = `*{box-sizing:border-box}i.no{font-style:normal}body{margin:0;background:#F4F2EC;color:#1B1A17;font:15px/1.7 "Segoe UI Variable","Source Han Sans SC","Noto Sans SC","PingFang SC",DengXian,sans-serif}
main{max-width:920px;margin:0 auto;padding:44px 28px 72px}h1{font:700 30px/1.25 "Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,serif;margin:6px 0 8px}
h2{font:700 19px/1.3 "Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,serif;margin:34px 0 10px;padding-top:14px;border-top:1px solid #1B1A17}
.k{font-size:12px;letter-spacing:.14em;color:#2D5A4A;font-weight:700}.sub{color:#5F5B52;font-size:13.5px}.c{color:#2D5A4A;font-size:12px;font-family:Georgia,serif;white-space:nowrap}
details{border-bottom:1px solid #D8D4C8;padding:11px 0}summary{cursor:pointer;font-weight:600;list-style:none}summary::-webkit-details-marker{display:none}
summary::before{content:"+";display:inline-block;width:1.2em;color:#2D5A4A;font-family:Georgia,serif}details[open]>summary::before{content:"–"}
details>div,details>ul,details>p,details>details{margin:8px 0 2px 1.2em}ul{padding-left:1.1em;margin:6px 0}li{margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));border-top:1px solid #1B1A17}.grid>div{padding:16px 16px 14px 0;border-bottom:1px solid #D8D4C8}
.v{font:400 30px/1.1 Georgia,"Songti SC",SimSun,serif;color:#2D5A4A}.l{font-weight:700;font-size:13.5px;margin-top:6px}
table{border-collapse:collapse;width:100%;margin:8px 0 4px;font-size:14px}th{text-align:left;color:#5F5B52;font-size:12.5px;border-bottom:1px solid #1B1A17;padding:6px 10px 6px 0}td{border-bottom:1px solid #D8D4C8;padding:7px 10px 7px 0;vertical-align:top}
.turn{display:grid;grid-template-columns:3.2em 1fr;gap:6px;padding:10px 0;border-bottom:1px solid #D8D4C8}.who{font-weight:700;color:#2D5A4A}.who.b{color:#9A6B1E}
.opt{display:block;margin:5px 0}.ok{color:#2D5A4A;font-weight:700}button{font:inherit;border:1px solid #1B1A17;background:#1B1A17;color:#FAF9F5;padding:6px 16px;cursor:pointer;margin-right:8px}
button.g{background:transparent;color:#1B1A17}footer{margin-top:40px;padding-top:12px;border-top:1px solid #1B1A17;color:#5F5B52;font-size:12.5px}`

const cite = n => Number.isInteger(Number(n)) && Number(n) > 0 ? ` <span class="c">[${Number(n)}]</span>` : ''

/** 底稿里现成的「问得出、答得准」的条目：名称-数值对和表格单元格。 */
function pairsOf(G) {
  const out = []
  for (const t of G.tables) {
    const src = t.source.replace(/\.[^.]+$/, '')
    if (t.keyValue) for (const [k, v] of t.rows) out.push({ q: `《${src}》里的「${k}」是多少？`, a: v, n: t.n, group: t.title })
    else for (const r of t.rows) for (let c = 1; c < t.head.length; c++) if (r[c]) out.push({ q: `《${src}》里，「${r[0]}」的${t.head[c]}是？`, a: r[c], n: t.n, group: `${t.title}·${t.head[c]}` })
  }
  return out
}
const TOPICS = [['overview', '主体情况'], ['business', '业务与客户'], ['finance', '财务与订单'], ['risk', '风险与差异'], ['todo', '待核实']]
function groupsOf(G, max = 6) {
  const used = new Set()
  return TOPICS.map(([k, name]) => {
    const items = G.passages.filter(x => x.topics.includes(k) && !used.has(x.text)).slice(0, max)
    items.forEach(x => used.add(x.text))
    return { name, items }
  }).filter(g => g.items.length)
}

const TASKS = {
  mindmap: `把底稿内容整理成一张导图：中心是这个项目当前要判断的问题，下面 4-6 个分支，每个分支 2-5 个节点，节点可以再带 1-3 个子节点。节点写具体事实或判断，带来源编号。
只输出 JSON：{"root":"…","branches":[{"name":"…","children":[{"text":"…","cite":1,"children":[{"text":"…","cite":2}]}]}]}`,
  flashcards: `出 12-16 张闪卡，帮项目组成员记住底稿里的关键事实、数字、口径差异和待核实事项。问题要具体，答案一两句话，带来源编号。不要出“以下哪项正确”这种题。
只输出 JSON：{"cards":[{"q":"…","a":"…","cite":1}]}`,
  quiz: `出 8-10 道单选题，检验读者是否读懂了底稿，覆盖数字、口径差异、风险和推理。每题 4 个选项，错误选项要像是读错底稿会得出的答案；每题给出解析和来源编号。
只输出 JSON：{"questions":[{"q":"…","options":["…","…","…","…"],"answer":0,"why":"…","cite":1}]}`,
  audio: `写一份两个人的对谈稿，给没时间读底稿的合伙人听。甲是负责这个项目的投资经理，乙是提问的风控同事。16-22 轮，口语，一次只说一件事；乙要追问口径、风险和没核实的地方，甲用底稿里的事实和数字回答，答不上来的直接说底稿里没有。
只输出 JSON：{"title":"…","turns":[{"speaker":"甲","text":"…"},{"speaker":"乙","text":"…"}]}`,
  video: `写一份 6-9 个分镜的讲解脚本，每个分镜说明画面上放什么（来自底稿的表、数字或原话）和旁白。旁白口语，40-90 字，数字带来源编号。
只输出 JSON：{"title":"…","scenes":[{"title":"…","visual":"…","narration":"…","cite":1}]}`,
  infographic: `做一页速览：一句话结论，3-5 个最要紧的数字，再分 3-4 个小节各列 2-4 条要点。全部出自底稿，带来源编号。
只输出 JSON：{"headline":"…","stats":[{"value":"…","label":"…","cite":1}],"sections":[{"title":"…","items":[{"text":"…","cite":1}]}]}`,
}

function valid(kind, o) {
  if (kind === 'mindmap') return arr(o?.branches).filter(b => b?.name && arr(b.children).length).length >= 2
  if (kind === 'flashcards') return arr(o?.cards).filter(c => c?.q && c?.a).length >= 4
  if (kind === 'quiz') return arr(o?.questions).filter(q => q?.q && arr(q.options).length >= 3 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).length >= 3
  if (kind === 'audio') return arr(o?.turns).filter(t => t?.text).length >= 6
  if (kind === 'video') return arr(o?.scenes).filter(s => s?.narration).length >= 3
  return arr(o?.sections).length >= 1 || arr(o?.stats).length >= 2
}

function offline(kind, p, G) {
  const groups = groupsOf(G)
  const pairs = pairsOf(G)
  if (kind === 'mindmap') return { root: p.name, branches: [...groups.map(g => ({ name: g.name, children: g.items.map(x => ({ text: x.text, cite: x.n })) })), ...G.tables.slice(0, 3).map(t => ({ name: t.title, children: t.rows.slice(0, 6).map(r => ({ text: r.filter(Boolean).join('：'), cite: t.n })) }))] }
  if (kind === 'flashcards') return { cards: [...pairs.slice(0, 12).map(x => ({ q: x.q, a: x.a, cite: x.n })), ...G.passages.filter(x => x.topics.includes('todo') || x.topics.includes('risk')).slice(0, 4).map(x => ({ q: `底稿提到了哪项${x.topics.includes('todo') ? '待核实事项' : '风险'}？（来源 [${x.n}]）`, a: x.text, cite: x.n }))] }
  if (kind === 'quiz') {
    const qs = []
    for (const x of pairs) {
      const others = [...new Set(pairs.filter(y => y.group === x.group && y.a !== x.a).map(y => y.a))].slice(0, 3)
      if (others.length < 2) continue
      const options = [x.a, ...others]
      const shift = qs.length % options.length
      const rotated = [...options.slice(shift), ...options.slice(0, shift)]
      qs.push({ q: x.q, options: rotated, answer: rotated.indexOf(x.a), why: `见底稿 [${x.n}]`, cite: x.n })
      if (qs.length >= 10) break
    }
    return { questions: qs }
  }
  if (kind === 'audio' || kind === 'video') {
    const scenes = [...groups.map(g => ({ title: g.name, visual: `底稿原文摘录（${g.items.length} 条）`, narration: g.items.slice(0, 4).map(x => `${x.text}。`).join(''), cite: g.items[0].n })), ...G.tables.slice(0, 2).map(t => ({ title: t.title, visual: `表格：${t.head.join('、')}`, narration: t.rows.slice(0, 5).map(r => `${r[0]}，${t.head.slice(1).map((h, i) => `${h} ${r[i + 1]}`).join('，')}。`).join(''), cite: t.n }))]
    return kind === 'video' ? { title: `${p.name} 底稿讲解`, scenes } : { title: `${p.name} 底稿朗读稿`, turns: scenes.map(s => ({ speaker: '朗读', text: `${s.title}。${s.narration}` })) }
  }
  return { headline: p.desc || p.name, stats: [...projectFacts(p).filter(([k]) => ['轮次', '拟投金额', '估值'].includes(k)).map(([k, v]) => ({ value: v, label: k })), ...pairs.slice(0, 3).map(x => ({ value: x.a, label: x.q.replace(/^《[^》]+》里的「|」是多少？$/g, ''), cite: x.n }))].slice(0, 5), sections: groups.map(g => ({ title: g.name, items: g.items.slice(0, 4).map(x => ({ text: x.text, cite: x.n })) })) }
}

function node(n) {
  const kids = arr(n?.children).filter(c => c?.text)
  return kids.length ? `<details><summary>${esc(str(n.text, 200))}${cite(n.cite)}</summary>${kids.map(node).join('')}</details>` : `<p>${esc(str(n.text, 240))}${cite(n.cite)}</p>`
}
function body(kind, o) {
  if (kind === 'mindmap') return `<h2>${esc(str(o.root, 80))}</h2>` + arr(o.branches).filter(b => b?.name).map(b => `<details open><summary>${esc(str(b.name, 60))}</summary>${arr(b.children).filter(c => c?.text).map(node).join('')}</details>`).join('')
  if (kind === 'flashcards') return arr(o.cards).filter(c => c?.q && c?.a).slice(0, 24).map((c, i) => `<details><summary><i class="no">${String(i + 1).padStart(2, '0')}</i>　${esc(str(c.q, 200))}</summary><p>${esc(str(c.a, 400))}${cite(c.cite)}</p></details>`).join('')
  if (kind === 'quiz') return arr(o.questions).filter(q => q?.q).slice(0, 14).map((q, i) => `<h2><i class="no">${i + 1}.</i> ${esc(str(q.q, 240))}</h2>${arr(q.options).slice(0, 5).map((x, k) => `<span class="opt">${'ABCDE'[k]}. ${esc(str(x, 200))}</span>`).join('')}<details><summary>看答案</summary><p><span class="ok">${'ABCDE'[q.answer] ?? ''}</span>　${esc(str(q.why, 400))}${cite(q.cite)}</p></details>`).join('')
  if (kind === 'audio') return `<p><button id="play">朗读</button><button id="stop" class="g">停止</button></p>` + arr(o.turns).filter(t => t?.text).slice(0, 40).map(t => `<div class="turn"><span class="who${/乙|B/.test(t.speaker) ? ' b' : ''}">${esc(str(t.speaker, 8) || '甲')}</span><span class="say">${esc(str(t.text, 600))}</span></div>`).join('')
    + `<script>(()=>{const s=window.speechSynthesis;if(!s)return;document.getElementById('play').onclick=()=>{s.cancel();document.querySelectorAll('.turn').forEach(el=>{const u=new SpeechSynthesisUtterance(el.querySelector('.say').textContent.replace(/\\[\\d+\\]/g,''));u.lang='zh-CN';u.pitch=el.querySelector('.who.b')?1.15:0.92;s.speak(u)})};document.getElementById('stop').onclick=()=>s.cancel()})()</script>`
  if (kind === 'video') return arr(o.scenes).filter(s => s?.narration).slice(0, 12).map((s, i) => `<h2><i class="no">分镜 ${i + 1}</i>　${esc(str(s.title, 60))}</h2><table><tr><th style="width:7em">画面</th><td>${esc(str(s.visual, 300))}</td></tr><tr><th>旁白</th><td>${esc(str(s.narration, 500))}${cite(s.cite)}</td></tr></table>`).join('')
  const stats = arr(o.stats).filter(s => s?.value && s?.label).slice(0, 5)
  return (o.headline ? `<p style="font-size:18px;margin:14px 0 22px">${esc(str(o.headline, 200))}</p>` : '')
    + (stats.length ? `<div class="grid">${stats.map(s => `<div><div class="v">${esc(str(s.value, 20))}</div><div class="l">${esc(str(s.label, 40))}${cite(s.cite)}</div></div>`).join('')}</div>` : '')
    + arr(o.sections).filter(s => s?.title).slice(0, 6).map(s => `<h2>${esc(str(s.title, 60))}</h2><ul>${arr(s.items).filter(x => x?.text || typeof x === 'string').slice(0, 6).map(x => `<li>${esc(str(x.text ?? x, 300))}${cite(x.cite)}</li>`).join('')}</ul>`).join('')
}

/** 生成一个互动成品。返回 { html, text, engine, note }；text 是正文纯文字（数字核对用）。 */
export async function buildInteractive(kind, p, docs, G, route, { prompt = '' } = {}) {
  let data = null, engine = '', note = route?.adapter ? '' : (route?.reason || '未配置模型')
  if (route?.adapter && TASKS[kind]) {
    try {
      const { out } = await authorStructured(route.adapter, p, docs, prompt ? `${TASKS[kind]}

使用者的额外要求：${prompt}` : TASKS[kind])
      if (valid(kind, out)) { data = out; engine = route.label }
      else note = '模型给出的内容不完整'
    } catch (e) { note = `模型撰稿失败：${e.message}` }
  }
  if (!data) data = offline(kind, p, G)
  const inner = body(kind, data)
  const empty = !inner.replace(/<[^>]+>/g, '').trim()
  const label = INTERACTIVE[kind] ?? '专项成果'
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} · ${label}</title><style>${CSS}</style></head><body><main>
<div class="k">${esc(label)}</div><h1>${esc(str(data.title, 80) || p.name)}</h1>
<div class="sub">${engine ? `由 ${esc(engine)} 依据底稿撰写` : `未调用模型，内容为底稿原文摘编（${esc(note)}）`}</div>
${empty ? '<p>所选底稿里没有可用于这类成品的内容。</p>' : inner}
<footer>依据的底稿：${G.sources.map(s => `[${s.n}]《${esc(s.name)}》`).join('　')}</footer></main></body></html>`
  return { html, text: inner.replace(/<script[\s\S]*?<\/script>|<i class="no">[^<]*<\/i>/g, '').replace(/<[^>]+>/g, ' '), engine, note, empty }
}
