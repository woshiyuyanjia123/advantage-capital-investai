// 录音转文字（制作台左上方的工具）：麦克风录音或上传音频，本机转写，逐句修改，生成纪要
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
  audSt = { projectId, mid: m.id, m, segs, recOn: false }
  renderAudioDrawer()
}

let recStart = 0
let recTick = 0
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function renderAudioDrawer() {
  const { m, segs, recOn } = audSt
  const lastRec = m.recordings?.at(-1)
  drawer(`${drawerHead(`录音转文字 · ${esc(m.title)}`, `${segs.length} 句${m.minutes ? ' · 已有纪要' : ''}`)}
    <div class="body">
      <div class="nb-rec ${recOn ? 'on' : ''}">
        <button class="nb-rec-btn" data-act="nb-aud-rec" title="${recOn ? '停止并保存' : '开始录音'}">${icon(recOn ? 'stop' : 'mic', 18)}</button>
        <span class="nb-rec-time" id="nbRecTime">${recOn ? mmss((Date.now() - recStart) / 1000) : '00:00'}</span>
        ${lastRec && !recOn ? `<audio controls preload="none" src="${rawUrl(lastRec.fileId, true)}"></audio>` : '<span class="grow"></span>'}
        <button class="btn sm" data-act="nb-aud-up">${icon('upload', 13)}上传音频</button>
        ${lastRec ? `<button class="btn sm pri" data-act="nb-aud-asr" data-f="${lastRec.fileId}">${icon('spark', 13)}本机转写</button>` : ''}
      </div>
      <div class="row" style="margin-bottom:8px"><span class="nb-lab">转写内容</span><span class="grow"></span>
        <button class="btn sm ghost" data-act="nb-aud-segadd">${icon('plus', 13)}加一行</button></div>
      <div class="nb-segs" id="nbSegBox">${segs.map((s, i) => `<div class="nb-seg-row">
        <span class="ts">${Math.floor((s.start || 0) / 60)}:${String(Math.floor((s.start || 0) % 60)).padStart(2, '0')}</span>
        <input class="spk" data-as-spk="${i}" value="${esc(s.speaker || `发言人 ${(i % 2) + 1}`)}">
        <input data-as-txt="${i}" value="${esc(s.text || '')}"></div>`).join('') || '<div class="nb-none">还没有转写内容</div>'}</div>
      <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn pri" data-act="nb-aud-minutes" ${segs.length ? '' : 'disabled'}>生成纪要和待办</button></div>
      ${m.minutes ? `<div class="sec">纪要草稿</div>
        <textarea class="input area" id="nbMinArea" style="height:28vh">${esc(m.minutes)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="nb-aud-minsave">保存纪要</button><span class="grow"></span>
          <button class="btn sm pri" data-act="nb-aud-confirm">${icon('check', 13)}确认纪要并同步待办</button></div>` : ''}
    </div>`, true)
}

function syncSegs() {
  if (!audSt || !$('#nbSegBox')) return
  audSt.segs = $$('[data-as-txt]').map((el, i) => ({
    start: audSt.segs[i]?.start ?? i * 10,
    speaker: $(`[data-as-spk="${i}"]`)?.value || `发言人 ${(i % 2) + 1}`,
    text: el.value.trim(),
  })).filter(s => s.text)
}

Object.assign(ACT, {
  'nb-studio-audio': el => openLocalAudioStudio(el.dataset.p || S.sel),
  'nb-aud-segadd': () => { syncSegs(); audSt.segs.push({ start: audSt.segs.length * 15, speaker: '发言人 1', text: '' }); renderAudioDrawer(); $(`[data-as-txt="${audSt.segs.length - 1}"]`)?.focus() },
  'nb-aud-up': async () => {
    const [file] = await pick({ accept: 'audio/*,.m4a,.mp3,.wav,.webm' })
    if (!file) return
    const r = await act('meeting.upload', { id: audSt.mid, name: file.name, data: await toB64(file) }, '音频已保存')
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
  'nb-aud-minutes': async () => {
    syncSegs()
    const text = audSt.segs.map(s => `${s.speaker}：${s.text}`).join('\n')
    const r = await act('meeting.transcript', { id: audSt.mid, text }, '已生成纪要和待办')
    if (r) { await hooks.reload({ files: false }); openLocalAudioStudio(audSt.projectId) }
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
