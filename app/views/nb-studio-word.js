// 写 Word（制作台左上方的工具）：直接改正文，或用本机 Word/WPS 打开修改后回传
import { S, ACT, hooks, $, esc, icon, get, act, drawer, drawerHead, downloadFile, opts } from '/api/investai?asset=ui.js'

let wordSt = null

export async function openLocalWordStudio(projectId, preferredType) {
  const x = S.project?.project?.id === projectId ? S.project : await get('project', { id: projectId })
  const docs = x.deliverables.filter(z => z.format === 'docx')
  let d = (preferredType && docs.find(z => z.type === preferredType)) ?? docs[0]
  if (!d) d = await act('deliverable.ensure', { projectId, type: preferredType || '尽调报告' })
  if (!d) return
  const { text } = d.versions?.length ? await get('version.text', { id: d.id }).catch(() => ({ text: '' })) : { text: `# ${x.project.name} · ${d.type}\n\n## 一、核心结论\n- 待补充依据\n\n## 二、关键风险与核实项\n- 待补充` }
  wordSt = { projectId, did: d.id, type: d.type, text: text || `# ${d.title}\n\n## 核心内容\n- 请在此直接本地修改正文`, checkout: d.checkout, docs }
  renderWordDrawer()
}

function renderWordDrawer() {
  const st = wordSt
  const docTypes = ['尽调报告', '投决报告', '保密协议', '投资框架协议', '法务审阅意见']
  drawer(`${drawerHead(`Word · ${esc(st.type)}`)}
    <div class="body">
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
        <select class="select sm" id="nbWordType">${opts(docTypes.map(t => [t, t]), st.type)}</select>
        <button class="btn sm" data-act="nb-word-switch">切换文书</button>
        <button class="btn sm pri" data-act="nb-word-ai">${icon('spark', 13)}用勾选的资料起草</button>
        <button class="btn sm" data-act="nb-word-office">${icon('open', 13)}用本机 Word/WPS 打开</button>
        ${st.checkout ? `<button class="btn sm pri" data-act="nb-word-checkin">回传本机修改</button>` : ''}
        <button class="btn sm" data-act="nb-open-folder" data-p="${st.projectId}">${icon('open', 13)}文件夹</button>
      </div>
      <textarea class="input area mono" id="nbWordArea" style="height:56vh;line-height:1.65">${esc(st.text)}</textarea>
      <div class="row" style="margin-top:10px"><span class="grow"></span>
        <button class="btn pri" data-act="nb-word-save">保存并生成 DOCX</button></div>
    </div>`, true)
}

Object.assign(ACT, {
  'nb-studio-word': el => openLocalWordStudio(el.dataset.p || S.sel),
  'nb-word-switch': () => openLocalWordStudio(wordSt.projectId, $('#nbWordType')?.value),
  'nb-word-save': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    const r = await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '在 Word 工具里修改' }, '已保存，DOCX 已重新生成')
    if (r) await hooks.reload({ files: false })
  },
  'nb-word-office': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '检出前同步' })
    const r = await act('deliverable.checkout', { id: wordSt.did }, '已用本机程序打开')
    if (r) { wordSt.checkout = r; renderWordDrawer(); await hooks.reload({ files: false }) }
  },
  'nb-word-checkin': async () => {
    const r = await act('nb.plugin.submit', { projectId: wordSt.projectId, deliverableId: wordSt.did, channel: 'local-checkin' }, '已回传本机修改')
    if (r) { wordSt.checkout = null; await hooks.reload({ files: false }); openLocalWordStudio(wordSt.projectId, wordSt.type) }
  },
  'nb-word-dl': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    const r = await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '导出 DOCX' })
    if (r?.version?.fileId) downloadFile(r.version.fileId, `${wordSt.type}.docx`)
  },
  'nb-word-ai': async () => {
    const j = await act('ai.generate', { projectId: wordSt.projectId, deliverableId: wordSt.did, type: wordSt.type, fileIds: S.ctx.fileIds, prompt: `生成并完善「${wordSt.type}」` }, '正在生成 Word 文稿…')
    if (j) hooks.track(j)
  },
})
