// 深蓝科技网格发布会级 PPT 视觉渲染引擎（对标信奇维创 Agent 集群发布会 5 大经典版式：深蓝网格底图 + 青色发光顶边卡 + 底部金句条）
const FONT = 'Microsoft YaHei'

export function addDarkKeynoteFrame(pptx, sl, bgImg, { secNo = '01', secTag = '核心洞察', rightTag = 'ADVANTAGE CAPITAL', title = '', subtitle = '', logicLabel = '核心逻辑', logicText = '', quote = '', pageNo = 2 }) {
  sl.addImage({ data: bgImg, x: 0, y: 0, w: 13.33, h: 7.5 })
  sl.addShape(pptx.ShapeType.rect, { x: 0.62, y: 0.42, w: 0.28, h: 0.06, fill: { color: '00D4FF' } })
  sl.addText(`${secNo}  ${secTag}`, { x: 0.96, y: 0.32, w: 4.5, h: 0.26, fontSize: 10.5, bold: true, color: '38BDF8', fontFace: FONT })
  sl.addText(rightTag, { x: 8.5, y: 0.28, w: 4.1, h: 0.24, fontSize: 9, align: 'right', color: '94A3B8', fontFace: FONT })
  sl.addText('AC / 优势资本', { x: 10.2, y: 0.52, w: 2.4, h: 0.32, fontSize: 13, bold: true, align: 'right', color: 'E2E8F0', fontFace: FONT })
  sl.addText(String(title), { x: 0.6, y: 0.72, w: 11.2, h: 0.56, fontSize: 24, bold: true, color: 'FFFFFF', fontFace: FONT })
  sl.addText(String(subtitle), { x: 0.6, y: 1.32, w: 11.5, h: 0.34, fontSize: 11.5, color: '93C5FD', fontFace: FONT })
  if (logicText) {
    sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: 5.98, w: 12.13, h: 0.44, fill: { color: '0D1F42', transparency: 15 }, line: { color: '1E3A8A', pt: 0.8 } })
    sl.addText(logicLabel, { x: 0.78, y: 6.06, w: 1.2, h: 0.28, fontSize: 10, bold: true, color: '38BDF8', fontFace: FONT })
    sl.addText(String(logicText), { x: 2.0, y: 6.06, w: 10.5, h: 0.28, fontSize: 10, color: 'E2E8F0', fontFace: FONT })
  }
  sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: 6.56, w: 0.08, h: 0.42, fill: { color: '00D4FF' } })
  sl.addText(String(quote || '带源、成体系、可编辑——从“能看”直接跨到“能交”。'), { x: 0.82, y: 6.55, w: 11.2, h: 0.44, fontSize: 14.5, bold: true, color: 'FFFFFF', fontFace: FONT })
  sl.addText('ADVANTAGE CAPITAL · AI INVESTMENT OS', { x: 0.6, y: 7.12, w: 5, h: 0.22, fontSize: 8, color: '64748B', fontFace: FONT })
  sl.addText(String(pageNo), { x: 11.8, y: 7.1, w: 0.9, h: 0.24, fontSize: 9.5, bold: true, align: 'right', color: '94A3B8', fontFace: FONT })
}

export function renderDarkKeynoteBody(pptx, sl, i, s, cards, kpis) {
  const modes = ['three_col_hero', 'four_col_pipeline', 'hub_quad_tags', 'a2a_network_compare', 'five_layer_stack']
  const m = modes.includes(s.keynoteMode) ? s.keynoteMode : modes[i % modes.length]
  if (m === 'three_col_hero') {
    cards.slice(0, 3).forEach((c, idx) => {
      const cx = 0.6 + idx * 4.12
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: 1.82, w: 3.88, h: 3.95, fill: { color: '102044', transparency: 14 }, line: { color: '1E3A8A', pt: 0.8 } })
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: 1.82, w: 3.88, h: 0.05, fill: { color: '00D4FF' } })
      sl.addText(c.tag || `0${idx + 1} · 核心指标`, { x: cx + 0.22, y: 2.0, w: 3.4, h: 0.26, fontSize: 9.5, bold: true, color: '38BDF8', fontFace: FONT })
      sl.addText(kpis[idx]?.val || `${idx + 1}00%`, { x: cx + 0.22, y: 2.32, w: 3.4, h: 0.65, fontSize: 26, bold: true, color: 'FFFFFF', fontFace: FONT })
      sl.addText(c.heading, { x: cx + 0.22, y: 3.02, w: 3.4, h: 0.34, fontSize: 12, bold: true, color: '93C5FD', fontFace: FONT })
      sl.addShape(pptx.ShapeType.rect, { x: cx + 0.22, y: 3.42, w: 3.4, h: 0.01, fill: { color: '1E3A8A' } })
      sl.addText(`■  ${c.body}`, { x: cx + 0.22, y: 3.55, w: 3.4, h: 2.0, fontSize: 10.2, color: 'E2E8F0', valign: 'top', fontFace: FONT })
    })
    return
  }
  if (m === 'four_col_pipeline') {
    cards.slice(0, 4).forEach((c, idx) => {
      const cx = 0.6 + idx * 3.08
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: 1.82, w: 2.88, h: 3.1, fill: { color: '102044', transparency: 14 }, line: { color: '1E3A8A', pt: 0.8 } })
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: 1.82, w: 2.88, h: 0.05, fill: { color: '00D4FF' } })
      sl.addText(`0${idx + 1}`, { x: cx + 0.2, y: 1.98, w: 1, h: 0.26, fontSize: 10, bold: true, color: '38BDF8', fontFace: FONT })
      sl.addText(c.heading, { x: cx + 0.2, y: 2.28, w: 2.48, h: 0.38, fontSize: 12.5, bold: true, color: 'FFFFFF', fontFace: FONT })
      sl.addText(c.body, { x: cx + 0.2, y: 2.75, w: 2.48, h: 2.0, fontSize: 9.8, color: 'CBD5E1', valign: 'top', fontFace: FONT })
    })
    sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: 5.08, w: 12.13, h: 0.72, fill: { color: '0D1D3E' }, line: { color: '1E3A8A', pt: 0.8 } })
    ;['底稿发现', '多源抓取', '降噪清洗', '结构入库', '交叉核验', '反幻觉过滤', '底稿留痕', '投决归档'].forEach((st, si) => {
      sl.addShape(pptx.ShapeType.rect, { x: 0.78 + si * 1.48, y: 5.24, w: 1.25, h: 0.4, fill: { color: '162C5B' }, line: { color: '38BDF8', pt: 0.6 } })
      sl.addText(st, { x: 0.78 + si * 1.48, y: 5.28, w: 1.25, h: 0.32, fontSize: 9.5, bold: true, align: 'center', color: 'FFFFFF', fontFace: FONT })
    })
    return
  }
  renderDarkKeynoteRest(pptx, sl, m, s, cards, kpis)
}

function renderDarkKeynoteRest(pptx, sl, m, s, cards, kpis) {
  if (m === 'hub_quad_tags') {
    cards.slice(0, 4).forEach((c, idx) => {
      const cx = 0.6 + (idx % 2) * 6.22, cy = 1.82 + Math.floor(idx / 2) * 2.02
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: cy, w: 5.9, h: 1.85, fill: { color: '102044', transparency: 14 }, line: { color: '1E3A8A', pt: 0.8 } })
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: cy, w: 5.9, h: 0.05, fill: { color: '00D4FF' } })
      sl.addText(`0${idx + 1}  ${c.heading}`, { x: cx + 0.2, y: cy + 0.14, w: 5.4, h: 0.32, fontSize: 12, bold: true, color: 'FFFFFF', fontFace: FONT })
      sl.addText(c.body, { x: cx + 0.2, y: cy + 0.5, w: 5.4, h: 1.2, fontSize: 9.8, color: 'CBD5E1', valign: 'top', fontFace: FONT })
    })
    sl.addShape(pptx.ShapeType.rect, { x: 4.85, y: 3.3, w: 3.6, h: 0.9, fill: { color: '0A1938' }, line: { color: '00D4FF', pt: 1.5 } })
    sl.addText('智能投研集群中枢\n底稿提取 · 交叉核验 · 门禁协同', { x: 4.95, y: 3.36, w: 3.4, h: 0.78, fontSize: 10, bold: true, align: 'center', color: '38BDF8', fontFace: FONT })
    return
  }
  if (m === 'a2a_network_compare') {
    ;[0, 1].forEach(col => {
      const cx = 0.6 + col * 6.25
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: 1.82, w: 5.88, h: 3.95, fill: { color: '102044', transparency: 14 }, line: { color: '1E3A8A', pt: 0.8 } })
      sl.addShape(pptx.ShapeType.rect, { x: cx, y: 1.82, w: 5.88, h: 0.05, fill: { color: '00D4FF' } })
      const cA = cards[col * 2] || cards[0], cB = cards[col * 2 + 1] || cards[1]
      sl.addText(col === 0 ? 'PHASE A · 单点串联核查' : 'PHASE B · 多维网状交叉协同', { x: cx + 0.25, y: 2.0, w: 5.3, h: 0.26, fontSize: 9.5, bold: true, color: '38BDF8', fontFace: FONT })
      sl.addText(cA.heading, { x: cx + 0.25, y: 2.3, w: 5.3, h: 0.38, fontSize: 14, bold: true, color: 'FFFFFF', fontFace: FONT })
      sl.addText(`■ ${cA.body}\n\n■ ${cB?.body || ''}`, { x: cx + 0.25, y: 2.85, w: 5.3, h: 2.7, fontSize: 10.2, color: 'E2E8F0', valign: 'top', fontFace: FONT })
    })
    return
  }
  // five_layer_stack (Photo 5: 左五层解耦架构栈 + 右侧能力指标矩阵表)
  cards.slice(0, 4).forEach((c, idx) => {
    const cy = 1.82 + idx * 0.98
    sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: cy, w: 7.55, h: 0.86, fill: { color: '102044', transparency: 14 }, line: { color: '1E3A8A', pt: 0.8 } })
    sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: cy, w: 0.06, h: 0.86, fill: { color: '00D4FF' } })
    sl.addText(c.heading, { x: 0.82, y: cy + 0.12, w: 2.4, h: 0.6, fontSize: 11, bold: true, color: 'FFFFFF', fontFace: FONT })
    sl.addText(c.body, { x: 3.3, y: cy + 0.12, w: 4.7, h: 0.64, fontSize: 9.5, color: 'CBD5E1', valign: 'middle', fontFace: FONT })
  })
  sl.addShape(pptx.ShapeType.rect, { x: 8.4, y: 1.82, w: 4.33, h: 3.92, fill: { color: '102044', transparency: 14 }, line: { color: '1E3A8A', pt: 0.8 } })
  sl.addText('核心量化指标矩阵', { x: 8.65, y: 2.0, w: 3.8, h: 0.32, fontSize: 11.5, bold: true, color: '93C5FD', fontFace: FONT })
  kpis.slice(0, 3).forEach((k, ki) => {
    const ky = 2.52 + ki * 1.02
    sl.addText(String(k.label), { x: 8.65, y: ky, w: 2.2, h: 0.36, fontSize: 10.5, color: 'CBD5E1', fontFace: FONT })
    sl.addText(String(k.val), { x: 10.8, y: ky - 0.04, w: 1.7, h: 0.42, fontSize: 16, bold: true, align: 'right', color: 'FFFFFF', fontFace: FONT })
    sl.addShape(pptx.ShapeType.rect, { x: 8.65, y: ky + 0.48, w: 3.8, h: 0.01, fill: { color: '1E3A8A' } })
  })
}


