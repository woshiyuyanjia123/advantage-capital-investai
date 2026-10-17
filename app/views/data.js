// 智能提取中心 · 公司库 · 研究与数据（智堡 / 公司观点库 / 指标库 / 行情与公告）· 资料库 · 模板与规范
import { S, D, ACT, VIEWS, hooks, $, $$, esc, md, csv, icon, get, post, act, toast, dialog, confirmBox, askText, drawer, drawerHead, can, proj, userName, fmt, ymd, rel, opts, empty, pick, toB64, ficon, levelTag, sparkline, LEVELS } from '/api/investai?asset=ui.js'

// ───────── 智能提取中心 ─────────
VIEWS.extract = async v => {
  const schemas = S.meta.schemas
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>智能提取</h1><p>把 BP、财报、尽调材料转换为固定格式：每个字段标注来源与页码；缺失、冲突单独列出，不编造。人工确认后写入公司库，可导出 Excel / PDF。</p></div></div>
    <div class="cards3">${Object.entries(schemas).map(([k, s]) => `<div class="box"><h3>${icon('extract', 15)}${esc(s.name)}</h3><div class="dim" style="font-size:12.5px;min-height:38px">${esc(s.desc ?? '')}</div><div class="row" style="margin-top:8px"><select class="select sm grow" id="xp-${k}">${opts(D().projects.filter(p => p.status === 'active').map(p => [p.id, p.name]), S.sel)}</select><button class="btn sm pri" data-act="xc-run" data-k="${k}" ${can('extract.run') ? '' : 'disabled'}>提取</button></div></div>`).join('')}</div>
    <div class="sec">提取记录</div><div id="xlist"><span class="spin"></span></div></div>`
  const list = await get('extractions').catch(() => [])
  $('#xlist').innerHTML = list.length ? `<div class="tablebox"><table class="t"><thead><tr><th>结果</th><th>项目</th><th>来源</th><th>缺失</th><th>冲突</th><th>状态</th><th>时间</th></tr></thead><tbody>${list.map(x => `<tr class="click" data-act="extraction" data-id="${x.id}"><td><b>${esc(x.name)}</b></td><td>${esc(proj(x.projectId)?.name ?? '')}</td><td>${x.origin === 'fill' ? '外部填报' : esc(x.engine ?? '')}</td><td>${x.missing?.length ?? 0}</td><td class="${x.conflicts?.length ? 'bad' : ''}">${x.conflicts?.length ?? 0}</td><td><span class="pill ${x.status === 'confirmed' ? 'st-4' : 'st-0'}">${x.status === 'confirmed' ? '已入库' : '待确认'}</span></td><td class="dim">${fmt(x.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : empty('暂无记录')
}
ACT['xc-run'] = async el => {
  const pid = $(`#xp-${el.dataset.k}`).value
  if (!pid) return toast('请选择项目', 'deny')
  S.sel = pid
  S.project = await get('project', { id: pid }).catch(() => null)
  if (S.project) ACT.extract(el)
}

// ───────── 公司库 ─────────
VIEWS.companies = v => {
  const d = D()
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>公司库</h1><p>同一套公司档案：BP 提取、外部填报、人工维护的数据都写在这里，并保留来源与确认人。</p></div></div>
    <div class="cards3">${d.companies.map(c => { const ps = d.projects.filter(p => p.companyId === c.id); return `<div class="box click" data-act="open-company" data-id="${c.id}"><h3>${icon('building', 15)}${esc(c.name)}</h3><div class="row"><span class="tag blue">${esc(c.industry)}</span>${c.region ? `<span class="tag">${esc(c.region)}</span>` : ''}</div><div class="dim" style="font-size:12px;margin-top:8px">${ps.map(p => `${esc(p.name)} · ${esc(p.stage)}`).join('<br>') || '无可见项目'}</div></div>` }).join('')}</div></div>`
}
async function openCompany(id) {
  const c = await get('company', { id }).catch(e => { toast(e.message, 'deny'); return null })
  if (!c) return
  const fields = Object.entries(c.fields ?? {})
  const metrics = c.metrics ?? []
  const periods = [...new Set(metrics.map(m => m.period))].sort()
  const names = [...new Set(metrics.map(m => m.metric))]
  drawer(`${drawerHead(esc(c.name), `${esc(c.industry)} · ${esc(c.region ?? '')}`)}
    <div class="body">
      <div class="sec" style="margin-top:0">基本信息 <span class="dim">（每个字段保留来源、确认人与时间）</span></div>
      ${fields.length ? `<div class="tablebox"><table class="t"><tbody>${fields.map(([k, f]) => `<tr><td style="width:120px" class="dim">${esc(k)}</td><td>${f.hidden ? `<span class="masked">●●●● ${icon('lock', 12)}</span>` : esc(f.value)}</td><td class="dim" style="font-size:11.5px">${f.source?.fileId ? `<button class="src" data-act="file" data-id="${f.source.fileId}">${esc(String(f.source.path).split('/').pop())}${f.source.page ? ` 第${f.source.page}页` : ''}</button>` : esc(f.source?.path ?? '')}<br>${esc(f.by ?? '')} ${f.at ? ymd(f.at) : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('尚无确认的信息：可在项目中运行「项目信息表」提取或发起外部填报')}
      <div class="sec">指标库</div>
      ${names.length ? `<div class="tablebox"><table class="t"><thead><tr><th>指标</th>${periods.map(p => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${names.map(n => `<tr><td>${esc(n)}</td>${periods.map(p => { const m = metrics.find(z => z.metric === n && z.period === p); return `<td title="${esc(m ? `${m.source?.path ?? ''} · ${m.by ?? ''}` : '')}">${m ? esc(m.value ?? m.yi?.toFixed?.(2)) : '—'}</td>` }).join('')}</tr>`).join('')}</tbody></table></div>` : empty('尚无指标：确认「财务分析表」提取后写入')}
      <div class="sec">项目</div>${c.projects.map(p => `<div class="li2" data-act="open-project" data-id="${p.id}"><b class="grow">${esc(p.name)}</b><span class="dim">${esc(p.businessName)} · ${esc(p.stage)}</span></div>`).join('') || empty('无')}
      <div class="sec">公告与企业研究 <span class="dim">（智堡企业研究检索）</span></div><div id="annc"><span class="spin"></span></div>
    </div>`, true)
  const a = await get('announcements', { company: id }).catch(e => ({ items: [], note: e.message }))
  const el = $('#annc')
  if (el) el.innerHTML = a.items.length ? `<div class="feed">${a.items.map(x => `<div class="fi2" data-act="wis" data-res="company-reports" data-id="${esc(x.id)}"><time>${esc(String(x.datetime ?? '').slice(0, 10))}</time><div class="grow"><div class="tt">${esc(x.title)}</div><div class="pv">${esc(x.preview ?? '')}</div></div></div>`).join('')}</div>` : empty(a.note || '暂无')
}
ACT['open-company'] = el => openCompany(el.dataset.id)

// ───────── 研究与数据 ─────────
const RTABS = [['wisburg', '智堡研究'], ['views', '公司观点库'], ['metrics', '指标库'], ['market', '行情']]
VIEWS.research = v => {
  const tab = RTABS.some(([k]) => k === S.sub) ? S.sub : 'wisburg'
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>研究与数据</h1><p>外部研究（智堡，真实数据）、机构内部观点、结构化指标与行情。智堡按关注列表定时采集入库。</p></div></div>
    <div class="rtabs">${RTABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="go" data-view="research" data-sub="${k}">${l}</button>`).join('')}</div><div id="rbody"></div></div>`
  R[tab]($('#rbody'))
}
const R = {
  wisburg(el) {
    const res = Object.entries(S.meta.wisburg)
    const w = S.wis
    const st = D().wisburg
    el.innerHTML = `${st.configured ? '' : '<div class="banner">智堡接口未配置：请在 系统配置 → 集成 中填写 API Key</div>'}
      <div class="rtabs">${res.map(([k, l]) => `<button class="${w.resource === k ? 'on' : ''}" data-act="wis-res" data-k="${k}">${esc(l)}</button>`).join('')}</div>
      <div class="filters"><div class="q">${icon('search', 14)}<input class="input" id="wq" value="${esc(w.q)}" placeholder="关键词（可选）"></div><button class="btn pri" data-act="wis-go">搜索</button><span class="dim" style="font-size:12px">关注列表：${esc((D().settings.watchlist ?? []).join('、') || '未设置')} · 定时采集到「我的上传/智堡」</span></div>
      <div class="feed" id="wfeed"></div>`
    paintWis()
    if (!w.items.length && !w.loading && st.configured) loadWis()
    $('#wq').addEventListener('keydown', e => { if (e.key === 'Enter') ACT['wis-go']() })
  },
  async views(el) {
    const list = await get('views').catch(() => [])
    el.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="dim grow" style="font-size:12.5px">机构对行业 / 公司的正式观点。AI 起草与问答时会引用这里的观点，保持机构口径一致。</span>${can('views.manage') ? `<button class="btn pri sm" data-act="view-edit">${icon('plus', 13)}新增观点</button>` : ''}</div>
      <div class="cards3">${list.map(x => `<div class="box"><h3><span class="pill ${x.stance === '看多' ? 'st-4' : x.stance === '看空' ? 'st-2' : 'st-3'}">${esc(x.stance)}</span>${esc(x.target)}<span class="grow"></span><span class="dim" style="font-weight:400">${x.scope === 'company' ? '公司' : '行业'} · v${x.version ?? 1}</span></h3><div style="font-size:12.5px">${esc(x.thesis)}</div>${x.points?.length ? `<ul class="pts">${x.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}<div class="row dim" style="font-size:11.5px;margin-top:6px">${esc(x.by ?? '')} · ${ymd(x.updatedAt)}<span class="grow"></span>${can('views.manage') ? `<button class="lnk" data-act="view-edit" data-id="${x.id}">编辑</button><button class="lnk" data-act="view-del" data-id="${x.id}">删除</button>` : ''}</div></div>`).join('') || empty('暂无观点')}</div>`
  },
  async metrics(el) {
    const list = await get('metrics').catch(e => { el.innerHTML = empty(e.message); return null })
    if (!list) return
    const comps = [...new Set(list.map(m => m.companyId))]
    el.innerHTML = `<div class="dim" style="font-size:12.5px;margin-bottom:10px">结构化指标来自人工确认后的「财务分析表」提取，每个数值可追溯到原文。</div>${comps.map(cid => { const ms = list.filter(m => m.companyId === cid); const periods = [...new Set(ms.map(m => m.period))].sort(); const names = [...new Set(ms.map(m => m.metric))]; const c = D().companies.find(z => z.id === cid); return `<div class="box" style="margin-bottom:10px"><h3>${icon('chart', 15)}${esc(c?.name ?? cid)}</h3><div class="tablebox"><table class="t"><thead><tr><th>指标</th>${periods.map(p => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${names.map(n => `<tr><td>${esc(n)}</td>${periods.map(p => { const m = ms.find(z => z.metric === n && z.period === p); return `<td title="${esc(m?.source?.path ?? '')}">${m ? esc(m.value ?? '') : '—'}</td>` }).join('')}</tr>`).join('')}</tbody></table></div></div>` }).join('') || empty('指标库为空：在项目中提取并确认「财务分析表」后自动入库')}`
  },
  async market(el) {
    const q = await get('quotes').catch(() => [])
    el.innerHTML = `<div class="infobox" style="margin-bottom:10px">本系统不内置未经授权的行情源。请从机构已授权的数据终端导出 CSV（表头：代码,名称,日期,收盘价[,涨跌幅][,成交额]）后导入；接入授权行情接口需在 系统配置 → 集成 中配置。公告类信息见公司档案中的「公告与企业研究」。</div>
      ${can('integration.manage') ? `<div class="row" style="margin-bottom:10px"><button class="btn sm pri" data-act="mkt-import">${icon('upload', 13)}导入行情 CSV</button></div>` : ''}
      ${q.length ? `<div class="tablebox"><table class="t"><thead><tr><th>代码</th><th>名称</th><th>日期</th><th>收盘</th><th>涨跌幅</th><th>区间</th><th>走势</th><th>来源</th></tr></thead><tbody>${q.map(x => `<tr><td class="mono">${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.date)}</td><td>${x.close}</td><td class="${x.chg >= 0 ? 'ok' : 'bad'}">${x.chg == null ? '—' : `${x.chg.toFixed(2)}%`}</td><td class="${x.periodChg >= 0 ? 'ok' : 'bad'}">${x.periodChg == null ? '—' : `${x.periodChg.toFixed(1)}%`}</td><td>${sparkline(x.series)}</td><td class="dim">${esc(x.source)}</td></tr>`).join('')}</tbody></table></div>` : empty('暂无行情数据')}`
  },
}
function paintWis() {
  const el = $('#wfeed')
  if (!el) return
  const w = S.wis
  el.innerHTML = w.items.map(x => `<div class="fi2" data-act="wis" data-res="${esc(w.resource)}" data-id="${esc(x.id)}"><time>${esc(String(x.datetime ?? '').slice(0, 10))}</time><div class="grow"><div class="tt">${esc(x.title)}</div><div class="pv">${esc(x.preview || String(x.full ?? '').slice(0, 140))}</div></div></div>`).join('') + (w.loading ? '<div style="padding:12px"><span class="spin"></span></div>' : w.err ? `<div class="bad" style="padding:12px">${esc(w.err)}</div>` : w.cursor ? '<button class="btn" data-act="wis-more" style="margin:10px 0">加载更多</button>' : w.items.length ? '' : empty('没有结果'))
}
async function loadWis(more = false) {
  const w = S.wis
  w.loading = true; w.err = ''
  if (!more) { w.items = []; w.cursor = null }
  paintWis()
  try { const r = await get('wisburg.list', { resource: w.resource, q: w.q, ...(more && w.cursor ? { after: w.cursor } : {}) }); w.items.push(...r.items); w.cursor = r.cursor ?? r.pageInfo?.endCursor ?? null } catch (e) { w.err = e.message } finally { w.loading = false; paintWis() }
}
Object.assign(ACT, {
  'wis-res': el => { S.wis.resource = el.dataset.k; S.wis.items = []; S.wis.cursor = null; hooks.refresh() },
  'wis-go': () => { S.wis.q = $('#wq')?.value.trim() ?? ''; loadWis() },
  'wis-more': () => loadWis(true),
  'view-edit': async el => {
    const list = await get('views')
    const x = list.find(z => z.id === el.dataset.id) ?? { scope: 'industry', stance: '中性', points: [] }
    const r = await dialog(`<h3>${x.id ? '编辑' : '新增'}机构观点</h3><div class="row"><label class="f grow">范围<select class="select" name="scope">${opts([['industry', '行业'], ['company', '公司']], x.scope)}</select></label><label class="f grow">对象<input class="input" name="target" value="${esc(x.target ?? '')}" required></label><label class="f">立场<select class="select" name="stance">${opts(['看多', '中性', '看空'].map(s => [s, s]), x.stance)}</select></label></div>
      <label class="f">核心观点<textarea class="input area" name="thesis" required>${esc(x.thesis ?? '')}</textarea></label><label class="f">要点（每行一条）<textarea class="input area" name="points">${esc((x.points ?? []).join('\n'))}</textarea></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存（生成新版本）</button></div>`, { wide: true })
    if (r && await act('view.save', { id: x.id, ...r, points: r.points.split('\n').map(s => s.trim()).filter(Boolean) }, '已保存')) hooks.refresh()
  },
  'view-del': async el => { if (await confirmBox('删除观点', '删除后 AI 不再引用该观点；历史保留可回滚。', { danger: true }) && await act('view.delete', { id: el.dataset.id }, '已删除')) hooks.refresh() },
  'mkt-import': async () => {
    const [file] = await pick({ multiple: false, accept: '.csv' })
    if (!file) return
    const source = await askText('导入行情', '数据来源（如：某终端导出 2026-10-16）', { value: file.name, area: false })
    if (source === null) return
    const r = await act('market.import', { data: await toB64(file), source })
    if (r) { toast(`已导入 ${r.imported} 行${r.skipped ? `，跳过 ${r.skipped} 行` : ''}`, 'ok'); hooks.refresh() }
  },
})

// ───────── 资料库 ─────────
VIEWS.knowledge = v => {
  const d = D()
  const mount = S.kb.mount || d.mounts[0]?.id
  const m = d.mounts.find(x => x.id === mount)
  const q = S.kb.q.trim()
  const files = S.files.filter(f => f.mountId === mount && (!q || f.name.includes(q) || f.rel.includes(q)))
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>资料库</h1><p>NAS、本地文件夹、模板、历史项目与项目工作区统一索引；PDF / Word / PPT / Excel 自动解析文字。只显示你有权访问的资料。</p></div>
    ${can('material.upload') ? `<button class="btn pri" data-act="kb-upload" data-m="${m?.readonly ? 'm_up' : mount}">${icon('upload', 14)}上传</button>` : ''}</div>
    <div class="mounts">${d.mounts.map(x => `<button class="${x.id === mount ? 'on' : ''}" data-act="kb-mount" data-id="${x.id}"><span class="dot ${x.online ? 'ok' : 'bad'}"></span>${esc(x.name)}<span class="dim">${S.files.filter(f => f.mountId === x.id).length}</span></button>`).join('')}</div>
    <div class="filters" style="margin-top:10px"><div class="q">${icon('search', 14)}<input class="input" id="kq" value="${esc(S.kb.q)}" placeholder="按文件名过滤；全文检索请用顶部搜索"></div>${m ? `<span class="dim mono" style="font-size:11.5px">${esc(m.path ?? '')}</span><button class="btn sm" data-act="rescan" data-id="${m.id}">重新扫描</button>` : ''}</div>
    ${files.length ? `<div class="tablebox"><table class="t"><thead><tr><th>文件</th><th>公司</th><th>密级</th><th>页数/字数</th><th>大小</th><th>更新</th></tr></thead><tbody>${files.slice(0, 400).map(f => `<tr class="click" data-act="file" data-id="${f.id}"><td><div class="row">${ficon(f.ext, true)}<span class="ell" title="${esc(f.rel)}">${esc(f.rel)}</span>${f.scanned ? '<span class="tag amber">扫描件</span>' : ''}</div></td><td>${esc(f.company ?? '')}</td><td>${levelTag(f.level)}</td><td class="dim">${f.pages ? `${f.pages} 页` : ''}${f.chars ? ` ${f.chars} 字` : ''}</td><td class="dim">${(f.size / 1024).toFixed(0)} KB</td><td class="dim">${ymd(f.mtime)}</td></tr>`).join('')}</tbody></table></div>` : empty('没有文件')}</div>`
  const kq = $('#kq')
  kq.addEventListener('input', () => { clearTimeout(kq._t); kq._t = setTimeout(() => { S.kb.q = kq.value; hooks.refresh(); const n = $('#kq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length) }, 250) })
}
Object.assign(ACT, {
  'kb-mount': el => { S.kb.mount = el.dataset.id; hooks.refresh() },
  'kb-upload': async el => {
    const files = await pick()
    const r = files.length ? await dialog(`<h3>上传 ${files.length} 个文件</h3><label class="f">密级<select class="select" name="level">${opts(LEVELS.map((l, i) => [i, l]), '', '按目录规则自动判定')}</select></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">上传</button></div>`) : null
    if (!r) return
    for (const file of files) await act('kb.upload', { mountId: el.dataset.m, name: file.name, data: await toB64(file), level: r.level === '' ? undefined : Number(r.level) }, `已上传 ${file.name}`)
    hooks.reload()
  },
})

// ───────── 模板与规范 ─────────
VIEWS.templates = v => {
  const tpl = S.files.filter(f => f.mountId === 'm_tpl')
  const std = tpl.filter(f => f.rel.startsWith('标准文书/'))
  const hist = tpl.filter(f => f.rel.startsWith('历史成果/'))
  const other = tpl.filter(f => !std.includes(f) && !hist.includes(f))
  const wt = D().workTypes
  const sec = (title, desc, list) => `<div class="box" style="margin-bottom:12px"><h3>${title}</h3><div class="dim" style="font-size:12.5px;margin-bottom:8px">${desc}</div>${list.map(f => `<div class="li2" data-act="file" data-id="${f.id}">${ficon(f.ext, true)}<span class="grow ell">${esc(f.name)}</span><span class="dim">${ymd(f.mtime)}</span></div>`).join('') || empty('暂无')}</div>`
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>模板与规范</h1><p>标准文书按固定模板填充（不调用模型）；研究类成果由 AI 参考历史成果的结构与写作规范决定框架。模板放在「模板与规范」挂载目录中即可生效。</p></div>${can('material.upload') ? `<button class="btn" data-act="kb-upload" data-m="m_tpl">${icon('upload', 14)}上传模板</button>` : ''}</div>
    ${sec('标准文书模板（Word，{{字段}} 占位）', 'NDA、框架协议、交易文件等：系统识别模板中的 {{字段}}，用项目与公司库数据填充；缺失字段标注【待补充：字段】。', std)}
    ${sec('历史成果样本（已脱敏）', '研究类成果起草时，AI 读取同类历史成果的章节结构和行文风格作为参考。', hist)}
    ${sec('写作规范与其他', '写作规范.md 会作为所有 AI 起草的风格约束。', other)}
    <div class="box"><h3>工作类型与输出格式</h3><div class="tablebox"><table class="t"><thead><tr><th>工作</th><th>类型</th><th>格式</th></tr></thead><tbody>${Object.entries(wt).map(([k, w]) => `<tr><td>${esc(k)}</td><td>${esc({ standard: '标准文书', extract: '结构化提取', research: '研究成果', table: '表格', meeting: '会议纪要' }[w.kind] ?? '研究成果')}</td><td>${esc((w.format ?? 'docx').toUpperCase())}</td></tr>`).join('')}</tbody></table></div></div></div>`
}
