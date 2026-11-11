// 路演 PPT（工作台左上方的工具）：逐页改标题和要点，或用本机 PowerPoint/WPS 打开修订后回传
import { S, ACT, hooks, $, esc, icon, get, act, drawer, drawerHead, toast, downloadFile } from '/api/investai?asset=ui.js'

let pptState = null

export async function openLocalPptStudio(projectId) {
  const x = S.project?.project?.id === projectId ? S.project : await get('project', { id: projectId })
  let d = x.deliverables.find(z => z.format === 'pptx')
  if (!d) d = await act('deliverable.ensure', { projectId, type: '立项报告' })
  if (!d) return
  const info = await get('nb.slides', { id: d.id }).catch(() => ({ id: d.id, title: d.title, v: 0, slides: [{ index: 1, title: '项目核心亮点', bullets: ['行业趋势与市场空间', '核心壁垒与财务表现'] }] }))
  pptState = { projectId, did: d.id, title: info.title || `${x.project.name} 汇报`, slides: info.slides, sel: 0, checkout: info.checkout }
  renderPptDrawer()
}

const prevHTML = (s, i, n) => `<h4>${esc(s?.title || '')}</h4><ul>${(s?.bullets ?? []).map(x => `<li>${esc(x)}</li>`).join('')}</ul><span class="pg">${i + 1} / ${n}</span>`

function renderPptDrawer() {
  const st = pptState
  const cur = st.slides[st.sel] ?? st.slides[0]
  const keep = $('.nb-thumbs')?.scrollTop
  drawer(`${drawerHead(`路演 PPT · ${esc(st.title)}`, `${st.slides.length} 页${st.checkout ? ' · 本机修订中' : ''}`)}
    <div class="body"><div class="nb-bar">
      <button class="btn sm pri" data-act="nb-ppt-ai">${icon('spark', 13)}用勾选的底稿生成</button>
      <button class="btn sm" data-act="nb-ppt-office">${icon('open', 13)}用本机 PowerPoint/WPS 打开</button>
      ${st.checkout ? `<button class="btn sm pri" data-act="nb-ppt-checkin">${icon('check', 13)}回传本机修订件</button>` : ''}
      <span class="grow"></span>
      <button class="btn sm ghost" data-act="nb-open-folder" data-p="${st.projectId}">${icon('folder', 13)}项目档案室</button></div>
      <div class="nb-slide-list">
        <div class="nb-thumbs">${st.slides.map((s, i) => `<button class="nb-thumb ${i === st.sel ? 'on' : ''}" data-act="nb-ppt-sel" data-i="${i}"><span class="no">${i + 1}</span><b>${esc(s.title)}</b><span class="ln"></span><span class="ln"></span></button>`).join('')}
          <button class="btn sm" data-act="nb-ppt-add">${icon('plus', 13)}加一页</button></div>
        <div><div class="nb-prev" id="nbSlidePrev">${prevHTML(cur, st.sel, st.slides.length)}</div>
          <div class="nb-fields"><label class="f">标题<input class="input" id="nbSlideTitle" value="${esc(cur?.title || '')}"></label>
          <label class="f">要点（一行一条）<textarea class="input area" id="nbSlideBullets">${esc((cur?.bullets ?? []).join('\n'))}</textarea></label>
          <div class="row"><button class="btn sm danger" data-act="nb-ppt-del">删除本页</button><span class="grow"></span><button class="btn pri" data-act="nb-ppt-save">保存并生成 PPTX</button></div></div></div>
      </div></div>`, true)
  if (keep && $('.nb-thumbs')) $('.nb-thumbs').scrollTop = keep
}

// 边改边看：右边的预览和左边的缩略图标题跟着输入更新
document.addEventListener('input', e => {
  if (!pptState || (e.target?.id !== 'nbSlideTitle' && e.target?.id !== 'nbSlideBullets')) return
  syncCurSlide()
  const cur = pptState.slides[pptState.sel]
  if ($('#nbSlidePrev')) $('#nbSlidePrev').innerHTML = prevHTML({ ...cur, title: $('#nbSlideTitle').value }, pptState.sel, pptState.slides.length)
  const t = $('.nb-thumb.on b')
  if (t) t.textContent = cur.title
})

function syncCurSlide() {
  if (!pptState || !$('#nbSlideTitle')) return
  const cur = pptState.slides[pptState.sel]
  if (cur) { cur.title = $('#nbSlideTitle').value.trim() || '未命名页'; cur.bullets = $('#nbSlideBullets').value.split('\n').map(x => x.trim()).filter(Boolean) }
}

Object.assign(ACT, {
  'nb-studio-ppt': el => openLocalPptStudio(el.dataset.p || S.sel),
  'nb-ppt-sel': el => { syncCurSlide(); pptState.sel = Number(el.dataset.i); renderPptDrawer() },
  'nb-ppt-add': () => { syncCurSlide(); pptState.slides.push({ title: `第 ${pptState.slides.length + 1} 页`, bullets: [] }); pptState.sel = pptState.slides.length - 1; renderPptDrawer() },
  'nb-ppt-del': () => { if (pptState.slides.length <= 1) return toast('至少保留 1 页'); pptState.slides.splice(pptState.sel, 1); pptState.sel = Math.max(0, pptState.sel - 1); renderPptDrawer() },
  'nb-ppt-save': async () => { syncCurSlide(); const r = await act('nb.slides.save', { projectId: pptState.projectId, deliverableId: pptState.did, title: pptState.title, slides: pptState.slides }, '已保存，PPTX 已重新生成'); if (r) await hooks.reload({ files: false }) },
  'nb-ppt-office': async () => { syncCurSlide(); await act('nb.slides.save', { projectId: pptState.projectId, deliverableId: pptState.did, title: pptState.title, slides: pptState.slides }); const r = await act('deliverable.checkout', { id: pptState.did }, '已用本机程序打开'); if (r) { pptState.checkout = r; renderPptDrawer(); await hooks.reload({ files: false }) } },
  'nb-ppt-checkin': async () => { const r = await act('nb.plugin.submit', { projectId: pptState.projectId, deliverableId: pptState.did, channel: 'local-checkin' }, '已回传本机修订件'); if (r) { pptState.checkout = null; await hooks.reload({ files: false }); openLocalPptStudio(pptState.projectId) } },
  'nb-ppt-dl': async () => { syncCurSlide(); const r = await act('nb.slides.save', { projectId: pptState.projectId, deliverableId: pptState.did, title: pptState.title, slides: pptState.slides }); const fId = r?.version?.fileId; if (fId) downloadFile(fId, `${pptState.title}.pptx`) },
  'nb-ppt-ai': async () => { const j = await act('ai.generate', { projectId: pptState.projectId, deliverableId: pptState.did, type: '立项报告', fileIds: S.ctx.fileIds, prompt: '生成结构清晰的项目汇报 PPT 内容' }, '正在生成 PPT…'); if (j) hooks.track(j) },
})
