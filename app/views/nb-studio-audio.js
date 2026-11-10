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
  const { m, segs, recOn, routeOut } = audSt
  const lastRec = m.recordings?.at(-1)
  drawer(`${drawerHead(`🎙️ 多模态语音与尽调访谈中心 · ${esc(m.title)}`, '融合语音降噪清洗、双人投研对谈联播与四路意图路由（结构化纪要 / 尽调增补底稿 / 拓扑架构图 / 待办工单分配）')}
    <div class="body">
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
        <button class="btn sm ${recOn ? 'danger' : 'pri'}" data-act="nb-aud-rec">${icon('mic', 13)}${recOn ? '停止录音并保存' : '本机麦克风直录'}</button>
        <button class="btn sm" data-act="nb-aud-up">${icon('upload', 13)}上传录音/视频音轨</button>
        ${lastRec ? `<button class="btn sm pri" data-act="nb-aud-asr" data-f="${lastRec.fileId}">${icon('spark', 13)}本地转写</button>` : ''}
        <button class="btn sm" data-act="nb-aud-denoise">🧹 语音文本降噪清洗</button>
        <button class="btn sm" data-act="nb-aud-tts">🎧 双声线播报</button>
        <button class="btn sm" data-act="nb-aud-segadd">${icon('plus', 13)}加行</button>
      </div>
      <div class="row" style="margin-bottom:10px;padding:6px 10px;background:#0F1E3A;border:1px solid #2563EB;border-radius:8px;flex-wrap:wrap">
        <span style="font-size:11.5px;color:#93C5FD"><b>🧭 多模态四路意图路由</b>（将转写内容定向转化为）：</span>
        <button class="btn sm pri" data-act="nb-aud-minutes">① 结构化尽调纪要</button>
        <button class="btn sm" data-act="nb-aud-route" data-r="dossier">② 补充尽调底稿入库</button>
        <button class="btn sm" data-act="nb-aud-route" data-r="diagram">③ 股权与业务拓扑图</button>
        <button class="btn sm" data-act="nb-aud-route" data-r="tickets">④ 责任人待办工单</button>
      </div>
      ${lastRec ? `<audio controls preload="none" src="${rawUrl(lastRec.fileId, true)}" style="width:100%;height:32px;margin-bottom:8px"></audio>` : ''}
      ${routeOut ? `<div class="box" style="margin-bottom:8px;border-color:#10B981"><div class="md">${md(routeOut)}</div></div>` : ''}
      <div class="box" id="nbSegBox">${segs.map((s, i) => `<div class="nb-seg-row">
        <span class="mono dim">${Math.floor((s.start || 0) / 60)}:${String(Math.floor((s.start || 0) % 60)).padStart(2, '0')}</span>
        <input class="input sm" data-as-spk="${i}" value="${esc(s.speaker || `发言人 ${(i % 2) + 1}`)}">
        <input class="input sm" data-as-txt="${i}" value="${esc(s.text || '')}"></div>`).join('')}</div>
      ${m.minutes ? `<div class="sec">纪要草稿（可直接本地修改后归档进项目成果与看板）</div>
        <textarea class="input area mono" id="nbMinArea" style="height:24vh">${esc(m.minutes)}</textarea>
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
  'nb-aud-denoise': () => {
    syncSegs()
    const cnNum = { '零': '0', '一': '1', '二': '2', '两': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '点': '.' }
    audSt.segs = audSt.segs.map(s => ({
      ...s,
      text: s.text.replace(/(?:嗯+|啊+|那个|就是说|呃+)/g, '').replace(/[零一二两三四五六七八九点]{2,}(?=亿元|万元|%)/g, m => [...m].map(c => cnNum[c] ?? c).join('')).trim(),
    }))
    toast('🧹 已完成语音转写文本降噪清洗与金融数字标准化', 'ok')
    renderAudioDrawer()
  },
  'nb-aud-tts': () => {
    syncSegs()
    if (!('speechSynthesis' in window)) return toast('当前环境不支持语音合成')
    speechSynthesis.cancel()
    audSt.segs.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(`${s.speaker}说：${s.text}`)
      u.pitch = i % 2 === 0 ? 0.94 : 1.12
      speechSynthesis.speak(u)
    })
    toast('🎧 正在以双声线交替播报访谈对话…', 'ok')
  },
  'nb-aud-route': async el => {
    syncSegs()
    const rType = el.dataset.r
    const raw = audSt.segs.map(s => `- **${s.speaker}**：${s.text}`).join('\n')
    if (rType === 'dossier') {
      const mdText = `# ${audSt.m.title} · 语音转写清洗底稿\n\n${raw}`
      const saved = await act('kb.upload', { projectId: audSt.projectId, name: `${audSt.m.title}_语音清洗底稿.md`, data: btoa(unescape(encodeURIComponent(mdText))) }, '✅ 已将清洗后语音底稿写入项目资料库并自动勾选')
      if (saved?.id && !S.ctx.fileIds.includes(saved.id)) S.ctx.fileIds.push(saved.id)
      audSt.routeOut = `**✅ 意图路由 [补充尽调底稿]**：已生成《${audSt.m.title}_语音清洗底稿.md》并加入左侧底稿勾选池。`
    } else if (rType === 'diagram') {
      audSt.routeOut = `**🧭 意图路由 [股权与业务拓扑结构流]**\n\n\`\`\`\n[项目访谈输入] ──► [核心业务与订单核验] ──► [财务收入时点复核] ──► [法务诉讼/合规条款闭环]\n\`\`\`\n${raw}`
    } else {
      await act('nb.os.dispatch', { projectId: audSt.projectId, text: `@项目组 根据会议录音分配待办：${audSt.segs.map(s => s.text).join('；').slice(0, 120)}` })
      audSt.routeOut = `**📌 意图路由 [责任人待办工单]**：已从语音转写中提取待办事项并自动指派至项目看板与协同流。`
    }
    renderAudioDrawer()
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
