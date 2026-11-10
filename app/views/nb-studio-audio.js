// 左上方录音转文字与本地逐句校对工坊：支持麦克风录音、音频上传、离线本地转写、逐句编辑与一键纪要
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
  const segs = m.asr?.segments?.length ? m.asr.segments : [{ start: 0, speaker: '发言人 1', text: '点击上方「麦克风录音」「上传音频」或直接在下方增改转写句子，支持离线本地转写与专有名词自动纠错。' }]
  audSt = { projectId, mid: m.id, m, segs, recOn: false }
  renderAudioDrawer()
}

function renderAudioDrawer() {
  const { m, segs, recOn } = audSt
  const lastRec = m.recordings?.at(-1)
  drawer(`${drawerHead(`🎙️ 本地录音转文字工坊 · ${esc(m.title)}`, '音频不出本机：支持麦克风直录、本地 Whisper 转写、逐句本地校对与一键转会议纪要')}
    <div class="body">
      <div class="row" style="margin-bottom:10px;flex-wrap:wrap">
        <button class="btn sm ${recOn ? 'danger' : 'pri'}" data-act="nb-aud-rec">${icon('mic', 13)}${recOn ? '停止录音并保存' : '本机麦克风录音'}</button>
        <button class="btn sm" data-act="nb-aud-up">${icon('upload', 13)}上传本地音频</button>
        ${lastRec ? `<button class="btn sm pri" data-act="nb-aud-asr" data-f="${lastRec.fileId}">${icon('spark', 13)}运行本地离线转写</button>` : ''}
        <button class="btn sm" data-act="nb-aud-segadd">${icon('plus', 13)}新增转写行</button>
        <button class="btn sm pri" data-act="nb-aud-minutes">生成纪要与待办草稿</button>
      </div>
      ${lastRec ? `<audio controls preload="none" src="${rawUrl(lastRec.fileId, true)}" style="width:100%;height:32px;margin-bottom:8px"></audio>` : ''}
      <div class="box" id="nbSegBox">${segs.map((s, i) => `<div class="nb-seg-row">
        <span class="mono dim">${Math.floor((s.start || 0) / 60)}:${String(Math.floor((s.start || 0) % 60)).padStart(2, '0')}</span>
        <input class="input sm" data-as-spk="${i}" value="${esc(s.speaker || `发言人 ${(i % 2) + 1}`)}">
        <input class="input sm" data-as-txt="${i}" value="${esc(s.text || '')}"></div>`).join('')}</div>
      ${m.minutes ? `<div class="sec">纪要草稿（可直接本地修改后归档进项目成果与看板）</div>
        <textarea class="input area mono" id="nbMinArea" style="height:28vh">${esc(m.minutes)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="nb-aud-minsave">保存纪要修改</button><span class="grow"></span>
          <button class="btn sm pri" data-act="nb-aud-confirm">${icon('check', 13)}确认纪要入库并同步看板待办</button></div>` : ''}
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
  'nb-aud-segadd': () => { syncSegs(); audSt.segs.push({ start: audSt.segs.length * 15, speaker: '发言人 1', text: '新增记录内容…' }); renderAudioDrawer() },
  'nb-aud-up': async () => {
    const [file] = await pick({ accept: 'audio/*,.m4a,.mp3,.wav,.webm' })
    if (!file) return
    const r = await act('meeting.upload', { id: audSt.mid, name: file.name, data: await toB64(file) }, '本地音频已保存')
    if (r) openLocalAudioStudio(audSt.projectId)
  },
  'nb-aud-rec': async () => {
    if (audSt.recOn && recMedia) { recMedia.stop(); audSt.recOn = false; return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recChunks = []
      recMedia = new MediaRecorder(stream)
      recMedia.ondataavailable = e => { if (e.data.size) recChunks.push(e.data) }
      recMedia.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const f = new File(recChunks, `录音-${Date.now()}.webm`, { type: 'audio/webm' })
        await act('meeting.upload', { id: audSt.mid, name: f.name, data: await toB64(f) }, '本机麦克风录音已保存')
        openLocalAudioStudio(audSt.projectId)
      }
      recMedia.start(); audSt.recOn = true; renderAudioDrawer()
    } catch (e) { toast(`麦克风未授权或不可用：${e.message}`, 'deny') }
  },
  'nb-aud-asr': async el => {
    const r = await act('nb.asr', { projectId: audSt.projectId, meetingId: audSt.mid, fileId: el.dataset.f })
    if (r?.segments) { audSt.segs = r.segments; toast(`✅ ${r.engine} 完成转写`, 'ok'); renderAudioDrawer() }
    else if (r?.job) { hooks.track(r.job); toast('已启动本机 faster-whisper 转写…') }
  },
  'nb-aud-minutes': async () => {
    syncSegs()
    const text = audSt.segs.map(s => `${s.speaker}：${s.text}`).join('\n')
    const r = await act('meeting.transcript', { id: audSt.mid, text }, '✅ 已基于本地转写稿生成纪要与待办')
    if (r) { await hooks.reload({ files: false }); openLocalAudioStudio(audSt.projectId) }
  },
  'nb-aud-minsave': async () => {
    const minutes = $('#nbMinArea')?.value ?? ''
    await act('meeting.update', { id: audSt.mid, minutes }, '✅ 纪要本地修改已保存')
  },
  'nb-aud-confirm': async () => {
    if ($('#nbMinArea')) await act('meeting.update', { id: audSt.mid, minutes: $('#nbMinArea').value })
    if (await act('meeting.confirm', { id: audSt.mid }, '✅ 纪要已归档为正式成果并同步看板待办')) { await hooks.reload(); openLocalAudioStudio(audSt.projectId) }
  },
})
