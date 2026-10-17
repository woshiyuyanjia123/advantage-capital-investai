#!/usr/bin/env node
// 操作演示视频：启动一个全新的本机演示服务 → 无头 Chrome 按脚本真实操作界面（带光标与字幕）→ macOS 中文语音旁白 → 合成 MP4。
//   node scripts/demo/record.mjs [输出.mp4]
// 需要：macOS（say、afinfo、swift）、Google Chrome。录制约 5 分钟，全部在临时目录进行，不影响真实数据。
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = resolve(process.argv[2] ?? join(ROOT, 'release', 'InvestAI-操作演示.mp4'))
const W = 1600, H = 900, PORT = 4399, BASE = `http://127.0.0.1:${PORT}`
const TMP = await mkdtemp(join(tmpdir(), 'investai-demo-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('[demo]', ...a)

// ───────── 演示服务（全新数据） ─────────
const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--desktop', '--data', join(TMP, 'data'), '--port', String(PORT)], { stdio: 'ignore', env: { ...process.env, INVESTAI_SECRETS: join(TMP, 'secrets.json') } })
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/investai?op=rev`)).ok) break } catch { /* 启动中 */ } await sleep(250) }
const api = async (op, body) => { const r = await fetch(`${BASE}/api/investai?op=${op}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(`${op}: ${j.error}`); return j }
const as = id => api('persona', { userId: id })

// 准备：明川医疗的投委会已发起，王总已投票（视频中由李总投出决定票）
await as('u_chen')
let st = await api('state')
const P = n => st.projects.find(p => p.name.includes(n))
const mc = P('明川')
const mcd = await api(`project&id=${mc.id}`)
await api('deliverable.finalize', { id: mcd.deliverables.find(d => d.type === '投资建议书').id })
await as('u_zhang')
const gate = await api('project.gate', { id: mc.id })
await as('u_wang')
await api('approval.vote', { id: gate.id, decision: 'pass', opinion: '同意，关注上市对赌安排' })
await as('u_zhang')
st = await api('state')
const IDS = { yf: P('云帆').id, cg: P('澄光').id, mc: mc.id, hy: P('衡远').id }
log('数据准备完成')

// ───────── 旁白 ─────────
const SCENES = []
const scene = (cap, say, run) => SCENES.push({ cap, say, run })

// ───────── 浏览器与界面辅助 ─────────
const b = await launch({ width: W, height: H, port: 9341 })
const OVERLAY = `window.__demo ??= (() => {
  const st = document.createElement('style')
  st.textContent = '#dm-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:1180px;background:rgba(8,14,28,.9);border:1px solid #2B4F87;color:#fff;font:600 21px/1.55 "PingFang SC",sans-serif;padding:9px 22px;border-radius:12px;z-index:99999;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.5)}#dm-cur{position:fixed;width:24px;height:24px;border-radius:50%;background:rgba(59,130,246,.3);border:2px solid #BFDBFE;z-index:100000;pointer-events:none;transition:left .55s ease,top .55s ease;left:800px;top:450px;margin:-12px 0 0 -12px;box-shadow:0 0 0 4px rgba(59,130,246,.15)}#dm-cur.click{animation:dmc .4s}@keyframes dmc{50%{transform:scale(1.9);background:rgba(59,130,246,.65)}}#dm-title{position:fixed;inset:0;z-index:100001;background:radial-gradient(1100px 560px at 30% 20%,#173061,#0A1120);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#E6ECF5;font-family:"PingFang SC",sans-serif;text-align:center}#dm-title .mk{font-size:30px;color:#3B82F6;font-weight:800;font-style:italic}#dm-title h1{font-size:60px;margin:10px 0 14px;letter-spacing:.04em}#dm-title p{font-size:24px;color:#93C5FD;margin:5px}#dm-title small{margin-top:26px;font-size:17px;color:#8A98AE}'
  document.head.append(st)
  const cap = Object.assign(document.createElement('div'), { id: 'dm-cap', hidden: true }); document.body.append(cap)
  const cur = Object.assign(document.createElement('div'), { id: 'dm-cur' }); document.body.append(cur)
  const find = (sel, text) => { const list = [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0); return text ? list.find(e => e.innerText.includes(text)) : list[0] }
  const move = el => { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); cur.style.left = (r.left + Math.min(r.width / 2, 60)) + 'px'; cur.style.top = (r.top + r.height / 2) + 'px' }
  return {
    caption: t => { cap.hidden = !t; cap.textContent = t || '' },
    title: h => { let el = document.getElementById('dm-title'); if (!h) return el?.remove(); if (!el) { el = Object.assign(document.createElement('div'), { id: 'dm-title' }); document.body.append(el) } el.innerHTML = h },
    async point(sel, text) { const el = find(sel, text); if (!el) throw new Error('找不到 ' + sel + ' ' + (text || '')); move(el); await new Promise(r => setTimeout(r, 650)) },
    async click(sel, text) { const el = find(sel, text); if (!el) throw new Error('找不到 ' + sel + ' ' + (text || '')); move(el); await new Promise(r => setTimeout(r, 650)); cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); el.click(); await new Promise(r => setTimeout(r, 300)) },
    scroll(sel, y) { const el = document.querySelector(sel); if (el) el.scrollTo({ top: y, behavior: 'smooth' }) },
  }
})(); 1`
const ev = js => b.evaluate(js)
const inject = () => ev(OVERLAY)
const click = (sel, text) => ev(`__demo.click(${JSON.stringify(sel)}, ${JSON.stringify(text ?? '')})`)
const point = (sel, text) => ev(`__demo.point(${JSON.stringify(sel)}, ${JSON.stringify(text ?? '')})`)
const scroll = (sel, y) => ev(`__demo.scroll(${JSON.stringify(sel)}, ${y})`)
const caption = t => ev(`__demo.caption(${JSON.stringify(t)})`)
const okDialog = async () => { await sleep(500); await click('#modal [data-dlg=ok]') }
async function waitFor(js, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(js).catch(() => false)) return true; await sleep(300) } throw new Error(`等待超时：${js}`) }
async function persona(id) {
  await click('.me-btn')
  await sleep(500)
  await click(`[data-act=set-persona][data-id=${id}]`)
  await sleep(1200)
}
const openProject = async id => { await ev(`(() => { const x = document.createElement('button'); x.dataset.act = 'open-project'; x.dataset.id = ${JSON.stringify(id)}; document.body.append(x); x.click(); x.remove(); return 1 })()`); await sleep(1500) }
const nav = view => click(`#nav [data-act=go][data-view=${view}]`)

// ───────── 分镜 ─────────
const TITLE = (h1, p, small = '') => `<div class="mk">A /</div><h1>${h1}</h1>${p.map(x => `<p>${x}</p>`).join('')}${small ? `<small>${small}</small>` : ''}`

scene('', '这是深蓝投研工作台，InvestAI 二点一版的操作演示。它是投资管理机构的 AI 协作系统：项目按流程推进，人来决策，AI 在权限范围内协助起草、提取和整理。', async () => {
  await ev(`__demo.title(${JSON.stringify(TITLE('深蓝投研工作台 · InvestAI', ['投资管理全流程 · 四层权限 · AI 协作'], '操作演示 · 本机演示数据（虚构）'))})`)
})
scene('首次打开：5 步界面导览', '第一次打开时，系统会播放一个简短的界面导览，告诉你导航在哪、工作台看什么、身份怎么切换、遇到问题去哪里找帮助。', async () => {
  await ev(`__demo.title('')`)
  await sleep(1500)
  for (let i = 0; i < 3; i++) { await click('.tour-card [data-tour=next]'); await sleep(1600) }
  await click('.tour-card [data-tour=end]')
})
scene('工作台：「轮到你」汇总所有项目中需要你处理的事', '工作台最上面是「轮到你」：它汇总所有项目里，下一步需要你本人处理的事项，点「去处理」直接进入。下面是待表决、待审核成果、我的任务和最新动态。', async () => {
  await point('#wbNext')
  await sleep(2500)
  await point('#wbApprovals')
  await sleep(1200)
  await point('#wbTasks')
})
scene('项目管理：按业务类型配置的流程推进', '项目管理按业务类型分组。选中财务投资后，上方是它的流程阶段，可以按阶段筛选，也可以切换成阶段看板。', async () => {
  await nav('pipeline')
  await sleep(800)
  await click('[data-act=bt][data-k=financial]')
  await sleep(1500)
  await click('[data-act=layout]')
  await sleep(2200)
  await click('[data-act=layout]')
})
scene('项目详情：流程步骤、准入条件与「下一步」', '打开新录入的云帆数据项目。顶部是八个阶段的流程，当前阶段的准入条件是「项目信息表」必须定稿。「下一步」告诉你还差什么、谁负责，轮到你的事项有按钮直接去做。', async () => {
  await openProject(IDS.yf)
  await point('.stepper')
  await sleep(2000)
  await point('.guide')
})
scene('智能提取：每个字段都有来源，缺失与冲突单独列出', '点「去起草」，系统从 BP 和财报中提取项目信息表。每个字段都标注来源原文；资料里没有的字段列为缺失，不会编造；BP 写的收入和审计财报不一致，被标为冲突，由人选择核实后的值。', async () => {
  await click('.guide [data-act=work-ai]')
  await waitFor(`!!document.querySelector('#drawer:not([hidden]) [data-act=x-confirm]')`)
  await sleep(1500)
  await scroll('#drawer .body', 520)
  await sleep(2500)
  await scroll('#drawer .body', 0)
})
scene('人工确认后才写入公司库', '勾选核实过的字段，确认后写入公司库，并保留来源和确认人。系统同时生成了一份 Excel 格式的项目信息表。', async () => {
  await click('[data-act=x-confirm]')
  await okDialog()
  await sleep(1500)
  await click('[data-act=drawer-close]')
})
scene('提交审核 → 负责人定稿', '项目经理把项目信息表提交审核。提交时 AI 会自动预审，检查数字能否在原文中找到。然后切换到部门负责人陈总，他在「下一步」里看到轮到自己定稿。', async () => {
  await click('[data-act=ptab][data-k=works]')
  await sleep(500)
  await click('.wcard [data-act=open-deliverable]')
  await sleep(1200)
  await click('[data-act=dl-submit]')
  await sleep(2000)
  await click('[data-act=drawer-close]')
  await persona('u_chen')
  await sleep(800)
  await point('.guide')
})
scene('定稿是正式决定，只能由有权的人做', '陈总打开成果，确认定稿。定稿是正式决定，只能由具备「材料定稿」权限的人本人操作，AI 没有这个能力。', async () => {
  await click('.guide [data-act=open-deliverable]')
  await sleep(1500)
  await click('[data-act=dl-final]')
  await okDialog()
  await sleep(1200)
  await click('[data-act=drawer-close]')
})
scene('准入满足 → 发起决策 → 表决 → 自动推进', '准入条件满足后，可以发起「项目启动审批」，系统通知表决人。陈总在「决策审批」里表决通过，项目自动进入下一个阶段「立项准备」，新阶段的工作同时生成。', async () => {
  await click('.guide [data-act=gate]')
  await okDialog()
  await sleep(1500)
  await click('[data-act=ptab][data-k=decide]')
  await sleep(800)
  await ev(`(() => { const t = document.querySelector('.votebox textarea'); if (t) t.value = '同意启动，尽快安排立项材料'; return 1 })()`)
  await click('[data-act=vote][data-d=pass]')
  await okDialog()
  await sleep(1800)
  await scroll('#view .page', 0)
  await point('.stepper .step.cur')
})
scene('AI 起草：先规划结构，再按资料写，数字逐条核对', '回到项目经理张伟，起草立项报告。AI 先参考机构历史成果的结构给出大纲，确认后再按项目资料起草。每个数字都要标注资料编号，系统自动与原文逐条核对。', async () => {
  await persona('u_zhang')
  await sleep(500)
  await click('.guide [data-act=work-ai]', '')
  await sleep(1200)
  await click('[data-act=plan]')
  await waitFor(`!!document.querySelector('#outlineEd')`)
  await sleep(1800)
  await click('[data-act=draft-go]')
  await waitFor(`!!document.querySelector('#abody .filecard')`, 60000)
  await sleep(1200)
  await point('#abody .ccheck')
})
scene('成果是真实的 PPT 文件：版本、Office 编辑、导出', '生成的是真实的 PPT 文件。每次修改都是新版本，可以恢复历史版本；可以用本机 Office 打开编辑后提交，也可以下载或导出 PDF。', async () => {
  await click('#abody .filecard')
  await sleep(1500)
  await scroll('#drawer .body', 600)
  await sleep(1500)
  await point('#drawer footer')
  await sleep(1200)
  await click('[data-act=drawer-close]')
})
scene('权限：分析师看不到估值，也不能撤回定稿', '切换到分析师林晓。同一个项目，金额、估值和交易条款对她显示为隐藏。打开已定稿的项目信息表，「撤回定稿」按钮是灰色的；点一下，系统会说明原因，以及可以找谁。', async () => {
  await persona('u_lin')
  await openProject(IDS.cg)
  await point('.kv')
  await sleep(2400)
  await click('[data-act=ptab][data-k=works]')
  await sleep(600)
  await click('.wcard [data-act=open-deliverable]')
  await sleep(1300)
  await click('#drawer .nope')
  await sleep(2800)
  await click('[data-act=drawer-close]')
})
scene('会议纪要：录音在本机转写，AI 整理待办与责任人', '回到项目经理，打开衡远储能的尽调沟通会，关联会议录音。录音在本机转写，不出机构；系统整理出讨论要点、决定事项和待办，责任人只会从参会人中识别。', async () => {
  await persona('u_zhang')
  await nav('meetings')
  await sleep(1000)
  await click('[data-act=meeting]')
  await sleep(1200)
  await ev(`(() => { const s = document.querySelector('#linkAudio'); if (s) s.value = s.options[1]?.value; return 1 })()`)
  await click('[data-act=meeting-link]')
  await waitFor(`!!document.querySelector('#drawer [data-act=meeting-confirm]')`, 90000)
  await sleep(1000)
  await scroll('#drawer .body', 380)
  await sleep(2500)
  await scroll('#drawer .body', 900)
})
scene('确认后：纪要定稿入项目，待办生成任务', '核对待办与责任人后确认，纪要作为成果定稿存入项目，待办自动生成任务并通知责任人。', async () => {
  await click('[data-act=meeting-confirm]')
  await okDialog()
  await sleep(1800)
  await click('[data-act=drawer-close]')
})
scene('投委会：三分之二规则，逐人表决', '明川医疗的投资决策委员会正在表决，规则是三分之二通过，王总已经同意。切换到合伙人李总，他投出第二票，达到阈值，项目自动进入交易执行阶段。', async () => {
  await persona('u_li')
  await openProject(IDS.mc)
  await click('[data-act=ptab][data-k=decide]')
  await sleep(1200)
  await ev(`(() => { const t = document.querySelector('.votebox textarea'); if (t) t.value = '同意投资，交割前落实注册证续期安排'; return 1 })()`)
  await click('[data-act=vote][data-d=pass]')
  await okDialog()
  await sleep(2000)
  await scroll('#view .page', 0)
  await point('.stepper .step.cur')
})
scene('系统配置：流程、权限、AI 策略都可在后台配置', '系统管理员在系统配置中维护人员与岗位的四层权限，用结构化表单配置每类业务的流程，并设置 AI 参与级别和模型路由：机密及以上的资料只交给本机模型。', async () => {
  await persona('u_admin')
  await nav('settings')
  await sleep(800)
  await click('.rtabs [data-sub=workflow]')
  await sleep(2500)
  await scroll('#view .page', 500)
  await sleep(1500)
  await click('.rtabs [data-sub=ai]')
  await sleep(2500)
})
scene('随时求助：帮助中心', '右上角是帮助中心，有三步上手、按岗位的用法、名词解释和常见问题。', async () => {
  await click('[data-act=help]')
  await sleep(1500)
  await scroll('#drawer .body', 500)
})
scene('', '以上就是 InvestAI 的主要操作。所有功能都经过自动化测试与代码审查验证。谢谢观看。', async () => {
  await click('[data-act=drawer-close]')
  await ev(`__demo.title(${JSON.stringify(TITLE('谢谢观看', ['人做决策 · AI 协助 · 每一步可追溯'], '回归测试 33 · 验收 135 · 评测 34 · 全部通过'))})`)
})

// ───────── 录制 ─────────
const AUD = join(TMP, 'audio'), FR = join(TMP, 'frames')
await mkdir(AUD, { recursive: true }); await mkdir(FR, { recursive: true })
for (const [i, s] of SCENES.entries()) {
  s.audio = join(AUD, `s${i}.aiff`)
  execFileSync('say', ['-v', 'Tingting', '-r', '205', '-o', s.audio, s.say])
  s.dur = Number(/estimated duration: ([\d.]+)/.exec(execFileSync('afinfo', [s.audio]).toString())?.[1] ?? 5)
}
log(`旁白 ${SCENES.length} 段，共 ${SCENES.reduce((a, s) => a + s.dur, 0).toFixed(0)} 秒`)

await b.goto(`${BASE}/`)
await sleep(800)
await inject()
const frames = []
let t0 = 0
b.on('Page.screencastFrame', async ({ data, sessionId }) => {
  const t = (Date.now() - t0) / 1000
  const f = join(FR, `f${String(frames.length).padStart(6, '0')}.jpg`)
  frames.push([f, t])
  b.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  await writeFile(f, Buffer.from(data, 'base64'))
})
t0 = Date.now()
await b.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
const audioList = []
for (const [i, s] of SCENES.entries()) {
  const start = (Date.now() - t0) / 1000
  audioList.push([s.audio, start + 0.15])
  await caption(s.cap)
  try { await s.run() } catch (e) { log(`第 ${i + 1} 段操作出错：${e.message}`) }
  const left = s.dur + 0.15 + 0.7 - ((Date.now() - t0) / 1000 - start)
  if (left > 0) await sleep(left * 1000)
  log(`第 ${i + 1}/${SCENES.length} 段完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
await caption('')
await sleep(1500)
await b.send('Page.stopScreencast')
await sleep(500)
const total = (Date.now() - t0) / 1000
await writeFile(join(TMP, 'frames.txt'), `${frames.map(([f, t]) => `${f}\t${t.toFixed(3)}`).join('\n')}\nEND\t${total.toFixed(3)}\n`)
await writeFile(join(TMP, 'audio.txt'), audioList.map(([f, t]) => `${f}\t${t.toFixed(3)}`).join('\n') + '\n')
b.close()
server.kill()
log(`录制完成：${frames.length} 帧，${total.toFixed(1)} 秒，开始编码…`)
await mkdir(dirname(OUT), { recursive: true })
execFileSync('swift', [join(ROOT, 'scripts', 'demo', 'encode.swift'), join(TMP, 'frames.txt'), join(TMP, 'audio.txt'), OUT], { stdio: 'inherit' })
log(`视频：${OUT}（临时文件在 ${TMP}）`)
