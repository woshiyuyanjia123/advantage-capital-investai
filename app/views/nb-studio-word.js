// 尽调文书（工作台左上方的工具）：直接改正文、选中一段让模型改写，或用本机 Word/WPS 打开修订后回传
import { S, ACT, hooks, $, esc, md, icon, get, act, toast, drawer, drawerHead, downloadFile, opts } from '/api/investai?asset=ui.js'

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

let wordSplit = true
const chars = t => String(t ?? '').replace(/\s/g, '').length

function renderWordDrawer() {
  const st = wordSt
  const docTypes = [...new Set([st.type, '尽调报告', '投决报告', '保密协议', '投资框架协议', '法务审阅意见'])]
  drawer(`${drawerHead(`尽调文书 · ${esc(st.type)}`, st.checkout ? '本机修订中' : '')}
    <div class="body">
      <div class="nb-bar">
        <select class="select sm" id="nbWordType" data-act-change="nb-word-switch" title="换一种文书">${opts(docTypes.map(t => [t, t]), st.type)}</select>
        <button class="btn sm pri" data-act="nb-word-ai">${icon('spark', 13)}用勾选的底稿起草</button>
        <button class="btn sm" data-act="nb-word-office">${icon('open', 13)}用本机 Word/WPS 打开</button>
        ${st.checkout ? `<button class="btn sm pri" data-act="nb-word-checkin">${icon('check', 13)}回传本机修订件</button>` : ''}
        <span class="grow"></span>
        <div class="seg sm"><button class="${wordSplit ? '' : 'on'}" data-act="nb-word-view" data-v="edit">编辑</button><button class="${wordSplit ? 'on' : ''}" data-act="nb-word-view" data-v="split">对照</button></div>
        <button class="btn sm ghost ico" data-act="nb-open-folder" data-p="${st.projectId}" title="项目档案室">${icon('folder', 13)}</button>
      </div>
      <div class="nb-bar nb-inline">
        <input class="input sm grow" id="nbInlineInst" value="${esc(st.inst ?? '')}" placeholder="选中正文里的一段，写上改写要求">
        <button class="btn sm" data-act="nb-word-inline">${icon('edit', 13)}改写选中段落</button>
      </div>
      <div class="nb-word ${wordSplit ? 'split' : ''}"><textarea id="nbWordArea" spellcheck="false">${esc(st.text)}</textarea>
        ${wordSplit ? `<div class="pv"><div class="md doc" id="nbWordPv">${md(st.text)}</div></div>` : ''}</div>
      <div class="row" style="margin-top:12px"><span class="dim" style="font-size:12px"><span id="nbWordCount">${chars(st.text)}</span> 字</span><span class="grow"></span>
        <button class="btn pri" data-act="nb-word-save">保存并生成 DOCX</button></div>
    </div>`, true)
}

document.addEventListener('input', e => {
  if (!wordSt || e.target?.id !== 'nbWordArea') return
  wordSt.text = e.target.value
  if ($('#nbWordPv')) $('#nbWordPv').innerHTML = md(wordSt.text)
  if ($('#nbWordCount')) $('#nbWordCount').textContent = chars(wordSt.text)
})

Object.assign(ACT, {
  'nb-studio-word': el => openLocalWordStudio(el.dataset.p || S.sel),
  'nb-word-switch': () => openLocalWordStudio(wordSt.projectId, $('#nbWordType')?.value),
  'nb-word-view': el => { wordSt.text = $('#nbWordArea')?.value ?? wordSt.text; wordSplit = el.dataset.v === 'split'; renderWordDrawer() },
  'nb-word-save': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    const r = await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '在尽调文书里修订' }, '已保存，DOCX 已重新生成')
    if (r) await hooks.reload({ files: false })
  },
  'nb-word-office': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '检出前同步' })
    const r = await act('deliverable.checkout', { id: wordSt.did }, '已用本机程序打开')
    if (r) { wordSt.checkout = r; renderWordDrawer(); await hooks.reload({ files: false }) }
  },
  'nb-word-checkin': async () => {
    const r = await act('nb.plugin.submit', { projectId: wordSt.projectId, deliverableId: wordSt.did, channel: 'local-checkin' }, '已回传本机修订件')
    if (r) { wordSt.checkout = null; await hooks.reload({ files: false }); openLocalWordStudio(wordSt.projectId, wordSt.type) }
  },
  'nb-word-dl': async () => {
    wordSt.text = $('#nbWordArea')?.value ?? wordSt.text
    const r = await act('deliverable.save', { id: wordSt.did, text: wordSt.text, note: '导出 DOCX' })
    if (r?.version?.fileId) downloadFile(r.version.fileId, `${wordSt.type}.docx`)
  },
  // 段落改写：没选中文字时不动正文
  'nb-word-inline': async el => {
    const area = $('#nbWordArea')
    if (!area) return
    const fullText = area.value
    const selectedText = fullText.slice(area.selectionStart, area.selectionEnd).trim()
    if (!selectedText) { toast('先在正文里选中要改写的一段', 'deny'); area.focus(); return }
    const instruction = $('#nbInlineInst')?.value?.trim() || '结合勾选底稿强化量化论证并精炼表述'
    wordSt.inst = $('#nbInlineInst')?.value ?? ''
    el.disabled = true
    const r = await act('nb.os.inline', { projectId: wordSt.projectId, deliverableId: wordSt.did, workType: wordSt.type, fullText, selectedText, instruction, fileIds: S.ctx.fileIds }, '已改写选中段落，存为新版本')
    el.disabled = false
    if (!r?.markdown) return
    wordSt.text = r.markdown
    renderWordDrawer()
    await hooks.reload({ files: false })
  },
  'nb-word-ai': async () => {
    const j = await act('ai.generate', { projectId: wordSt.projectId, deliverableId: wordSt.did, type: wordSt.type, fileIds: S.ctx.fileIds, prompt: `生成并完善「${wordSt.type}」` }, '正在起草文书')
    if (j) hooks.track(j)
  },
})

window.addEventListener('investai:reload', () => {
  if (!wordSt || !$('#nbWordArea') || document.activeElement?.id === 'nbWordArea') return
  openLocalWordStudio(wordSt.projectId, wordSt.type)
})
