// 访谈录音（工作台左上方的工具）：麦克风录音或上传音频，本机转写，逐句修改，再把转写转成纪要、底稿、拓扑或待办
import { S, ACT, hooks, $, $$, esc, md, icon, get, act, drawer, drawerHead, toast, pick, toB64, rawUrl } from '/api/investai?asset=ui.js'

let audSt = null
let recMedia = null
let recChunks = []

export async function openLocalAudioStudio(projectId) {
  const x = S.project?.project?.id === projectId ? S.project : await get('project', { id: projectId })
  let mSummary = x.meetings?.[0]
  if (!mSummary) mSummary = await act('meeting.create', { projectId, title: `${x.project.name} 尽调访谈纪要`, kind: '尽调访谈' })
  if (!mSummary) return
  const m = await get('meeting', { id: mSummary.id })
  const segs = m.asr?.segments?.length ? m.asr.segments : []
  audSt = { projectId, mid: m.id, m, segs, recOn: false, routeOut: null, routing: null }
  renderAudioDrawer()
}

let recStart = 0
let recTick = 0
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

// 转写内容的四个去向
const ROUTES = [
  ['minutes', '尽调纪要'],
  ['dossier', '补充底稿'],
  ['diagram', '股权与业务拓扑'],
  ['tickets', '待办工单'],
]

function renderAudioDrawer() {
  const { m, segs, recOn, routeOut, routing } = audSt
  const lastRec = m.recordings?.at(-1)
  const none = segs.length ? '' : 'disabled'
  drawer(`${drawerHead(`访谈录音 · ${esc(m.title)}`, `${segs.length} 句${m.minutes ? ' · 已有纪要' : ''}`)}
    <div class="body" data-aud>
      <div class="nb-rec ${recOn ? 'on' : ''}">
        <button class="nb-rec-btn" data-act="nb-aud-rec" title="${recOn ? '停止并保存' : '开始录音'}">${icon(recOn ? 'stop' : 'mic', 18)}</button>
        <span class="nb-rec-time" id="nbRecTime">${recOn ? mmss((Date.now() - recStart) / 1000) : '00:00'}</span>
        ${lastRec && !recOn ? `<audio controls preload="none" src="${rawUrl(lastRec.fileId, true)}"></audio>` : '<span class="grow"></span>'}
        <button class="btn sm" data-act="nb-aud-up">${icon('upload', 13)}上传录音</button>
        ${lastRec ? `<button class="btn sm pri" data-act="nb-aud-asr" data-f="${lastRec.fileId}">${icon('spark', 13)}本机转写</button>` : ''}
      </div>
      <div class="row" style="margin-bottom:8px"><span class="nb-lab">转写内容</span><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-aud-denoise" ${none}>清理口头语</button>
        <button class="btn sm ghost" data-act="nb-aud-tts" ${none}>${icon('play', 12)}朗读</button>
        <button class="btn sm ghost" data-act="nb-aud-segadd">${icon('plus', 13)}加一行</button></div>
      <div class="nb-segs" id="nbSegBox">${segs.map((s, i) => `<div class="nb-seg-row">
        <span class="ts">${Math.floor((s.start || 0) / 60)}:${String(Math.floor((s.start || 0) % 60)).padStart(2, '0')}</span>
        <input class="spk" data-as-spk="${i}" value="${esc(s.speaker || `发言人 ${(i % 2) + 1}`)}">
        <input data-as-txt="${i}" value="${esc(s.text || '')}"></div>`).join('') || '<div class="nb-none">还没有转写内容</div>'}</div>
      <div class="nb-route"><span class="nb-lab">转成</span>
        ${ROUTES.map(([k, l]) => `<button class="${routing === k ? 'busy' : ''}" data-act="${k === 'minutes' ? 'nb-aud-minutes' : 'nb-aud-route'}" data-r="${k}" ${segs.length && !routing ? '' : 'disabled'}>${l}</button>`).join('')}</div>
      ${routeOut ? `<div class="sec">${esc(routeOut.title)}</div><div class="box nb-route-out"><div class="md">${md(routeOut.md)}</div></div>` : ''}
      ${m.minutes ? `<div class="sec">纪要草稿</div>
        <textarea class="input area" id="nbMinArea" style="height:24vh">${esc(m.minutes)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="nb-aud-minsave">保存纪要</button><span class="grow"></span>
          <button class="btn sm pri" data-act="nb-aud-confirm">${icon('check', 13)}确认纪要并同步待办</button></div>` : ''}
    </div>`, true)
}
const audOpen = () => !!$('#drawer [data-aud]') && !$('#drawer').hidden

function syncSegs() {
  if (!audSt || !$('#nbSegBox')) return
  audSt.segs = $$('[data-as-txt]').map((el, i) => ({
    start: audSt.segs[i]?.start ?? i * 10,
    speaker: $(`[data-as-spk="${i}"]`)?.value || `发言人 ${(i % 2) + 1}`,
    text: el.value.trim(),
  })).filter(s => s.text)
}
const b64 = text => btoa(unescape(encodeURIComponent(text)))
const CN_NUM = { 零: '0', 一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 点: '.' }

Object.assign(ACT, {
  'nb-studio-audio': el => openLocalAudioStudio(el.dataset.p || S.sel),
  'nb-aud-segadd': () => { syncSegs(); audSt.segs.push({ start: audSt.segs.length * 15, speaker: '发言人 1', text: '' }); renderAudioDrawer(); $(`[data-as-txt="${audSt.segs.length - 1}"]`)?.focus() },
  'nb-aud-up': async () => {
    const [file] = await pick({ accept: 'audio/*,.m4a,.mp3,.wav,.webm' })
    if (!file) return
    const r = await act('meeting.upload', { id: audSt.mid, name: file.name, data: await toB64(file) }, '录音已保存')
    if (r) openLocalAudioStudio(audSt.projectId)
  },
  'nb-aud-rec': async () => {
    if (audSt.recOn && recMedia) { recMedia.stop(); audSt.recOn = false; clearInterval(recTick); renderAudioDrawer(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recChunks = []
      recMedia = new MediaRecorder(stream)
      recMedia.ondataavailable = e => { if (e.data.size) recChunks.push(e.data) }
      recMedia.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const f = new File(recChunks, `录音-${Date.now()}.webm`, { type: 'audio/webm' })
        await act('meeting.upload', { id: audSt.mid, name: f.name, data: await toB64(f) }, '录音已保存')
        openLocalAudioStudio(audSt.projectId)
      }
      recMedia.start(); audSt.recOn = true; recStart = Date.now()
      clearInterval(recTick)
      recTick = setInterval(() => { const t = $('#nbRecTime'); if (t && audSt?.recOn) t.textContent = mmss((Date.now() - recStart) / 1000) }, 500)
      renderAudioDrawer()
    } catch (e) { toast(`麦克风未授权或不可用：${e.message}`, 'deny') }
  },
  'nb-aud-asr': async el => {
    const r = await act('nb.asr', { projectId: audSt.projectId, meetingId: audSt.mid, fileId: el.dataset.f })
    if (r?.segments) { audSt.segs = r.segments; toast(`${r.engine} 转写完成`, 'ok'); renderAudioDrawer() }
    else if (r?.job) { hooks.track(r.job); toast('本机转写已开始') }
  },
  // 去掉语气词，把「六点八亿元」这类口语数字换成阿拉伯数字
  'nb-aud-denoise': () => {
    syncSegs()
    audSt.segs = audSt.segs.map(s => ({
      ...s,
      text: s.text.replace(/(?:嗯+|啊+|那个|就是说|呃+)/g, '').replace(/[零一二两三四五六七八九点]{2,}(?=亿元|万元|%)/g, m => [...m].map(c => CN_NUM[c] ?? c).join('')).trim(),
    })).filter(s => s.text)
    toast('已清理口头语，口语数字已换成阿拉伯数字', 'ok')
    renderAudioDrawer()
  },
  // 两个声线交替朗读；正在读时再点一次停下
  'nb-aud-tts': () => {
    if (!('speechSynthesis' in window)) return toast('当前环境不支持语音合成', 'deny')
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return toast('已停止朗读') }
    syncSegs()
    const who = [...new Set(audSt.segs.map(s => s.speaker))]
    for (const s of audSt.segs) {
      const u = new SpeechSynthesisUtterance(`${s.speaker}：${s.text}`)
      u.pitch = who.indexOf(s.speaker) % 2 === 0 ? 0.94 : 1.12
      speechSynthesis.speak(u)
    }
    toast('正在朗读转写内容', 'ok')
  },
  'nb-aud-minutes': async () => {
    syncSegs()
    const text = audSt.segs.map(s => `${s.speaker}：${s.text}`).join('\n')
    const r = await act('meeting.transcript', { id: audSt.mid, text }, '已生成纪要和待办')
    if (r) { await hooks.reload({ files: false }); openLocalAudioStudio(audSt.projectId) }
  },
  'nb-aud-route': async el => {
    syncSegs()
    const kind = el.dataset.r
    const { projectId: pid, m } = audSt
    const lines = audSt.segs.map(s => `- **${s.speaker}**：${s.text}`).join('\n')
    if (!lines) return
    if (kind === 'dossier') {
      const name = `${m.title}_访谈转写.md`
      const saved = await act('kb.upload', { projectId: pid, name, data: b64(`# ${m.title} · 访谈转写\n\n${lines}`) })
      if (!saved) return
      if (saved.id && !S.ctx.fileIds.includes(saved.id)) S.ctx.fileIds.push(saved.id)
      audSt.routeOut = { title: '补充底稿', md: `已存为项目底稿《${saved.name || name}》，并勾选参与编制。` }
      S.project = await get('project', { id: pid }).catch(() => S.project)
      await hooks.reload()
    } else if (kind === 'tickets') {
      // 每句带「跟进、补充、核实」这类动作的话记一条待办，最多 5 条；一句都没有就记一条总的
      const todo = audSt.segs.filter(s => /需要|请|跟进|补充|提供|核查|核实|确认|安排|落实|之前|尽快/.test(s.text)).slice(0, 5)
      const titles = (todo.length ? todo.map(s => s.text) : [`跟进《${m.title}》访谈事项`]).map(t => t.slice(0, 80))
      const made = []
      for (const title of titles) { const t = await act('task.add', { projectId: pid, title }); if (t) made.push(title) }
      if (!made.length) return
      audSt.routeOut = { title: '待办工单', md: `已在管控看板新建 ${made.length} 条待办：\n\n${made.map(t => `- ${t}`).join('\n')}` }
      S.project = await get('project', { id: pid }).catch(() => S.project)
      await hooks.reload({ files: false })
    } else {
      // 拓扑交给问答模型整理，结果回来后显示在这里
      const done = text => { if (!audSt || audSt.mid !== m.id) return; audSt.routing = null; audSt.routeOut = { title: '股权与业务拓扑', md: text || '没有得到结果' }; if (audOpen()) renderAudioDrawer() }
      audSt.routing = 'diagram'; audSt.routeOut = null
      renderAudioDrawer()
      let started = false
      await hooks.send(`根据下面这段访谈转写，梳理其中提到的股权结构和业务链条，用缩进列表画出拓扑。只写转写里出现过的信息，没提到的写「转写未提及」。\n\n${lines}`, { silent: true, stay: true, keepCtx: true, onJob: j => { started = true; if (j.status !== 'running') done(j.text || j.error) }, onDone: j => done(j.text || j.error) })
      if (!started) done(S.chat.filter(z => z.role !== 'user').at(-1)?.text)
      return
    }
    if (audOpen()) renderAudioDrawer()
  },
  'nb-aud-minsave': async () => {
    const minutes = $('#nbMinArea')?.value ?? ''
    await act('meeting.update', { id: audSt.mid, minutes }, '纪要已保存')
  },
  'nb-aud-confirm': async () => {
    if ($('#nbMinArea')) await act('meeting.update', { id: audSt.mid, minutes: $('#nbMinArea').value })
    if (await act('meeting.confirm', { id: audSt.mid }, '纪要已归档，待办已同步')) { await hooks.reload(); openLocalAudioStudio(audSt.projectId) }
  },
})
