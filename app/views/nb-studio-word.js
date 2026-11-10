// 左上方本地 Word 文书修改工坊：支持章节本地快改、模板填充、本机 Word/WPS 检出修改与一键回传
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
  drawer(`${drawerHead(`📝 本地 Word 修改工坊 · ${esc(st.type)}`, '直接在线修改章节生成真实 .DOCX，或用本机 Word / WPS 打开修改后一键回传')}
    <div class="body">
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
        <select class="select sm" id="nbWordType">${opts(docTypes.map(t => [t, t]), st.type)}</select>
        <button class="btn sm" data-act="nb-word-switch">切换文书</button>
        <button class="btn sm pri" data-act="nb-word-ai">${icon('spark', 13)}AI/离线起草或填模板</button>
        <button class="btn sm" data-act="nb-word-office">${icon('open', 13)}用本机 Word/WPS 打开修改</button>
        ${st.checkout ? `<button class="btn sm pri" data-act="nb-word-checkin">回传本机 Word 修改件</button>` : ''}
        <button class="btn sm" data-act="nb-open-folder" data-p="${st.projectId}">📂 打开项目专属文件夹</button>
      </div>
      <div class="row" style="margin-bottom:8px;padding:6px 10px;background:#0F1E3A;border:1px solid #2563EB;border-radius:8px">
        <span style="font-size:12px;color:#93C5FD"><b>✍️ 段落级人机共创</b>：在下方正文框用鼠标选中一段文字 →</span>
        <input class="input sm grow" id="nbInlineInst" placeholder="输入原地改写要求（如：补充勾选底稿财务数据 / 精炼为投决要点 / 强化风险条款）…">
        <button class="btn sm pri" data-act="nb-word-inline">✨ 让 Agent 原地改写选中段落</button>
      </div>
      <textarea class="input area mono" id="nbWordArea" style="height:52vh;line-height:1.65">${esc(st.text)}</textarea>
      <div class="row" style="margin-top:10px"><span class="dim">保存即生成带版本留痕的真实 .DOCX 文件</span><span class="grow"></span>
        <button class="btn pri" data-act="nb-word-save">保存本地修改并提交新版本</button></div>
    </div>`, true)
}

Object.assign(ACT, {
  'nb-studio-word': el => openLocalWordStudio(el.dataset.p || S.sel),
  'nb-word-switch': () => openLocalWordStudio(wordSt.projectId, $('#nbWordType')?.value),
  'nb-word-save': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    const r = await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '左上 Word 工坊本地修改' }, '✅ 已保存本地 Word 修改并生成新版 .DOCX')
    if (r) await hooks.reload({ files: false })
  },
  'nb-word-office': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '检出前同步' })
    const r = await act('deliverable.checkout', { id: wordSt.did }, '已用本机 Word / WPS 打开工作副本')
    if (r) { wordSt.checkout = r; renderWordDrawer(); await hooks.reload({ files: false }) }
  },
  'nb-word-checkin': async () => {
    const r = await act('nb.plugin.submit', { projectId: wordSt.projectId, deliverableId: wordSt.did, channel: 'local-checkin' }, '✅ 已回传本机 Word 修改并更新节点')
    if (r) { wordSt.checkout = null; await hooks.reload({ files: false }); openLocalWordStudio(wordSt.projectId, wordSt.type) }
  },
  'nb-word-dl': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    const r = await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '导出 DOCX' })
    if (r?.version?.fileId) downloadFile(r.version.fileId, `${wordSt.type}.docx`)
  },
  'nb-word-inline': async () => {
    const area = $('#nbWordArea')
    const fullText = area?.value ?? wordSt.text
    const sel = area ? fullText.slice(area.selectionStart, area.selectionEnd).trim() : ''
    const selectedText = sel || fullText.split('\n\n').find(p => p.length > 20) || fullText.slice(0, 200)
    const instruction = $('#nbInlineInst')?.value?.trim() || '结合勾选底稿强化量化论证并精炼表述'
    const r = await act('nb.os.inline', { projectId: wordSt.projectId, deliverableId: wordSt.did, workType: wordSt.type, fullText, selectedText, instruction }, '✍️ Agent 已在原文原地改写并同步至项目群聊')
    if (r?.markdown) { wordSt.text = r.markdown; if (area) area.value = r.markdown; await hooks.reload({ files: false }) }
  },
  'nb-word-ai': async () => {
    const j = await act('ai.generate', { projectId: wordSt.projectId, deliverableId: wordSt.did, type: wordSt.type, fileIds: S.ctx.fileIds, prompt: `生成并完善「${wordSt.type}」` }, '正在生成 Word 文稿…')
    if (j) hooks.track(j)
  },
})
