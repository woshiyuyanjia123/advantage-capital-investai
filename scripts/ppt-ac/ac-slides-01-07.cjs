const path = require('node:path');
const { C, FONT, ASSET_DIR, addHeader, addCard } = require('./ac-theme.cjs');

function buildAcSlides01To07(pres) {
  // P01: Cover
  const s1 = pres.addSlide();
  s1.background = { color: C.darkBg };
  s1.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.65, y: 0.6, w: 3.65, h: 0.4, rectRadius: 0.06,
    fill: { color: C.darkCard }, line: { color: '9A6B1E', width: 1 },
  });
  s1.addText('一级市场机构 SaaS · 桌面/Web 双模 v3.2.3', {
    x: 0.65, y: 0.6, w: 3.65, h: 0.4, fontFace: FONT.cn, fontSize: 11.5, bold: true,
    color: 'E8CA96', align: 'center', valign: 'middle', margin: 0,
  });
  s1.addText('优势资本 · 智能投研工作台', {
    x: 0.65, y: 1.25, w: 5.35, h: 0.72, fontFace: FONT.cn, fontSize: 29, bold: true, color: C.white, margin: 0,
  });
  s1.addText('全景业务能力、受控工作流与开箱落地指南', {
    x: 0.65, y: 2.02, w: 5.35, h: 0.46, fontFace: FONT.cn, fontSize: 16.5, bold: true, color: '92D4B5', margin: 0,
  });
  s1.addText('底稿溯源零编造 · 9 类投研成果自动落盘\n8 阶段 OA 门禁表决 · 四层权限与密级分流', {
    x: 0.65, y: 2.64, w: 5.2, h: 0.76, fontFace: FONT.cn, fontSize: 13.5, color: 'D1DFD8', lineSpacingMultiple: 1.4, margin: 0,
  });
  [
    ['3 大核心界面', '项目总览 / 尽调工作台 / 阶段门禁'],
    ['9 类投研成果', '立项报告、异构PPTX、财务表、图谱'],
    ['4 层机构权限', '岗位 / 范围 / 操作 / 密级统一投影'],
  ].forEach(([k, v], i) => {
    const y = 3.68 + i * 1.02;
    s1.addShape(pres.shapes.RECTANGLE, { x: 0.65, y, w: 5.15, h: 0.86, fill: { color: C.darkCard }, line: { color: C.darkBorder, width: 0.9 } });
    s1.addText(k, { x: 0.85, y: y + 0.16, w: 1.75, h: 0.54, fontFace: FONT.cn, fontSize: 17.5, bold: true, color: 'E8CA96', margin: 0 });
    s1.addText(v, { x: 2.62, y: y + 0.22, w: 3.05, h: 0.42, fontFace: FONT.cn, fontSize: 12.8, color: C.white, margin: 0 });
  });
  s1.addImage({ path: path.join(ASSET_DIR, 'ac-hero-overview.png'), x: 6.02, y: 0.65, w: 6.66, h: 4.3 });
  s1.addShape(pres.shapes.RECTANGLE, { x: 6.02, y: 5.18, w: 6.66, h: 1.54, fill: { color: C.darkCard }, line: { color: C.darkBorder, width: 0.9 } });
  s1.addText('本手册涵盖四大模块：\n01 机构投研痛点与全生命周期总逻辑 (P02–P04)\n02 三大核心界面与 9 类成果编制详解 (P05–P10)\n03 四大一级市场投研工作流实战演示 (P11–P15)\n04 企业开箱体检、批量建号与多端协同 (P16–P20)', {
    x: 6.24, y: 5.3, w: 6.22, h: 1.3, fontFace: FONT.cn, fontSize: 12.2, color: 'DCE8E2', lineSpacingMultiple: 1.38, margin: 0,
  });

  // P02: Pain Points & Efficiency Chart
  const s2 = pres.addSlide();
  addHeader(s2, pres, '01 · 机构投研痛点与价值', '为什么一级市场投资机构需要“受控智能投研 + OA 门禁”一体化台？', '解决底稿散乱、模型编造财务数据、PPT 缺乏排版美感与投决流转脱节四大难题', 2);
  [
    ['底稿与成品混杂', '无关联公司项目易串入他项目机密；生成草稿回流污染原始证据池。', C.red],
    ['通用模型爱编数字', '财报与 BP 口径打架，模型常心算出错或编造行业增速与估值倍数。', C.gold],
    ['投研与 OA 两张皮', '报告写完还要手动导进 OA 填表催办，缺乏定稿锁定与表决留痕。', C.pine],
  ].forEach(([t, d, col], i) => {
    const y = 1.92 + i * 1.62;
    addCard(s2, pres, { x: 0.65, y, w: 5.55, h: 1.42, accent: col });
    s2.addText(t, { x: 0.92, y: y + 0.16, w: 5.05, h: 0.38, fontFace: FONT.cn, fontSize: 16, bold: true, color: C.ink, margin: 0 });
    s2.addText(d, { x: 0.92, y: y + 0.6, w: 5.05, h: 0.68, fontFace: FONT.cn, fontSize: 13, color: C.muted, lineSpacingMultiple: 1.32, margin: 0 });
  });
  addCard(s2, pres, { x: 6.45, y: 1.92, w: 6.23, h: 4.88 });
  s2.addText('单项目投研核心环节耗时对比（小时）', { x: 6.72, y: 2.1, w: 5.7, h: 0.38, fontFace: FONT.cn, fontSize: 15.5, bold: true, color: C.pine, margin: 0 });
  s2.addChart(pres.charts.BAR, [
    { name: '传统手工投研', labels: ['立项建档与工商核查', '百页BP/财报口径排错', '尽调报告与财务分析表', '异构路演PPTX制作', '投决催办与交接简报'], values: [4.5, 8.0, 14.0, 6.5, 2.5] },
    { name: '优势资本工作台', labels: ['立项建档与工商核查', '百页BP/财报口径排错', '尽调报告与财务分析表', '异构路演PPTX制作', '投决催办与交接简报'], values: [0.3, 1.2, 2.5, 0.8, 0.2] },
  ], {
    x: 6.62, y: 2.55, w: 5.9, h: 3.65, barDir: 'bar', barGrouping: 'clustered',
    chartColors: ['C2BBAE', C.pine], showLegend: true, legendPos: 'b',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11,
    catAxisLabelFontFace: FONT.cn, catAxisLabelFontSize: 11.5, valAxisHidden: true, valGridLine: { style: 'none' },
  });
  s2.addText('单项目从机会初筛到上会材料齐备，平均节省约 30 小时机械整理工时。', { x: 6.72, y: 6.3, w: 5.7, h: 0.34, fontFace: FONT.cn, fontSize: 12, bold: true, color: C.gold, margin: 0 });

  // P03: Flowchart 1 - Master Logic
  const s3 = pres.addSlide();
  addHeader(s3, pres, '01 · 核心思维流程图 ①', '全所投研一案到底总逻辑：从多源速采立项到投委会表决', '每一步均有权限隔离、底稿溯源与防覆盖护栏，AI 永不越权代人表决或推进阶段', 3);
  s3.addImage({ path: path.join(ASSET_DIR, 'ac-flow-master.png'), x: 0.65, y: 1.88, w: 12.03, h: 4.98 });

  // P04: 3 Core Interfaces Overview
  const s4 = pres.addSlide();
  addHeader(s4, pres, '02 · 极简三界面空间架构', '收敛为三大核心界面 + Ctrl+K 全局指令台，保留纸面/深色双主题', '支持 Windows / macOS 独立桌面端与浏览器 SaaS 访问，隐藏原生白边菜单', 4);
  [
    ['界面 01 · 投研项目总览', 'OA 待办门户与带材料立项', ['个人 OA 待办条（待表决/复核/推进）', '拖入 BP 自动识别简称行业轮次立项', '项目进度百分比与阶段节点展开', 'Ctrl+K 混合检索指令/项目/底稿'], C.pine],
    ['界面 02 · 尽调与研判工作台', '三栏溯源研判与成果编制', ['左栏：三工坊 + A/B/C 分级底稿舱', '中栏：项目隔离会话 + [n] 角标问答', '右栏：两阶段 Harness + 9 类成果', '右下：专属成果舱（无零散导出）'], C.gold],
    ['界面 03 · 阶段门禁与投决中心', '8 阶段流转与四层权限治理', ['精准报送匹配当前阶段同格式工作项', '企微/飞书/钉钉 30 秒节流一键催办', '全票/过半/三分之二投委表决', '一键生成《项目交接与上会简报》'], C.red],
  ].forEach(([tag, title, items, col], i) => {
    const x = 0.65 + i * 4.08;
    addCard(s4, pres, { x, y: 1.94, w: 3.86, h: 4.86, topBar: col });
    s4.addText(tag, { x: x + 0.24, y: 2.18, w: 3.38, h: 0.32, fontFace: FONT.cn, fontSize: 12.5, bold: true, color: col, margin: 0 });
    s4.addText(title, { x: x + 0.24, y: 2.52, w: 3.38, h: 0.46, fontFace: FONT.cn, fontSize: 18, bold: true, color: C.ink, margin: 0 });
    items.forEach((it, j) => {
      s4.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.22, y: 3.16 + j * 0.84, w: 3.42, h: 0.68, rectRadius: 0.05, fill: { color: C.paperBg }, line: { color: C.line, width: 0.7 } });
      s4.addText(it, { x: x + 0.36, y: 3.16 + j * 0.84, w: 3.16, h: 0.68, fontFace: FONT.cn, fontSize: 13, color: C.ink, valign: 'middle', margin: 0 });
    });
  });

  // P05: Screen 1 & Multi-Source Capture
  const s5 = pres.addSlide();
  addHeader(s5, pres, '02 · 三大界面详解（1/3）', '界面 01：OA 待办门户 + 多源速采与带材料一键立项', '打开首页先处理待办与表决，新项目直接拖入 BP 文件 10 秒完成建档入库', 5);
  [
    ['① 个人 OA 待办聚合条', '自动汇总“待我表决、待我复核、轮到我推进、我的待办任务”，点击直达对应项目门禁或工作台。', C.red],
    ['② 带材料一键快速立项', '拖入 BP 或项目材料，自动从文件名与正文识别企业简称、行业与轮次，一步完成建公司+建项目+入库。', C.pine],
    ['③ 多源底稿速采（防 SSRF）', '除本地文件外，支持粘贴访谈文本直存 .md 底稿，或安全抓取公开网页转 Markdown（内置内网 IP 拦截）。', C.gold],
    ['④ 无公司项目严格隔离', '无关联公司项目（companyId=null）强制隔离在专属目录，严禁串入其他项目机密底稿。', C.navy],
  ].forEach(([t, d, col], i) => {
    const x = 0.65 + (i % 2) * 6.12;
    const y = 1.94 + Math.floor(i / 2) * 2.42;
    addCard(s5, pres, { x, y, w: 5.9, h: 2.18, accent: col });
    s5.addText(t, { x: x + 0.26, y: y + 0.24, w: 5.4, h: 0.42, fontFace: FONT.cn, fontSize: 16, bold: true, color: C.ink, margin: 0 });
    s5.addText(d, { x: x + 0.26, y: y + 0.76, w: 5.4, h: 1.18, fontFace: FONT.cn, fontSize: 13, color: C.muted, lineSpacingMultiple: 1.38, margin: 0 });
  });

  // P06: Screen 2 Left & Center
  const s6 = pres.addSlide();
  addHeader(s6, pres, '02 · 三大界面详解（2/3）', '界面 02（左中栏）：A/B/C 证据分级 + 勾选底稿溯源问答', '允许手动取消全选（0 份底稿），系统绝不偷偷回勾；对话按“用户 + 项目”严格隔离', 6);
  [
    ['左栏：A/B/C 分级与三工坊', '• 上方固定 PPT 精修、文书双栏改写、录音转写三工坊\n• 下方原始底稿舱自动排除成品，支持一键“仅勾 A 级硬证据”\n• 行业研究与工商信息支持一键补入底稿库', C.pine],
    ['中栏：全景导读卡与溯源问答', '• 空对话展示底稿全景导读卡（汇总 A/B/C 级数量与缺口）\n• 事实与数字必带 [n] 角标，点击角标直接预览原文件\n• 每次回答下方动态生成 3 条紧扣争点的追问建议', C.gold],
  ].forEach(([t, d, col], i) => {
    const x = 0.65 + i * 6.12;
    addCard(s6, pres, { x, y: 1.96, w: 5.9, h: 4.82, topBar: col });
    s6.addText(t, { x: x + 0.26, y: 2.24, w: 5.4, h: 0.44, fontFace: FONT.cn, fontSize: 17, bold: true, color: C.ink, margin: 0 });
    s6.addText(d, { x: x + 0.26, y: 2.86, w: 5.4, h: 3.6, fontFace: FONT.cn, fontSize: 13.5, color: C.muted, lineSpacingMultiple: 1.5, margin: 0 });
  });

  // P07: Screen 2 Right - 9 Artifacts
  const s7 = pres.addSlide();
  addHeader(s7, pres, '02 · 三大界面详解（3/3）', '界面 02（右栏）：九类投研成果编制与异构矢量 PPTX 引擎', '支持调节目标页数（4–24）、配色方案（松绿/藏青/赭石）与篇幅详略，成品自动落盘项目文件夹', 7);
  [
    ['01 立项报告 / 投决建议书', 'DOCX · 含交易结构、核心风险与估值算式'],
    ['02 行业研究与竞品对比报告', 'DOCX · 对标市场空间、竞争格局与壁垒'],
    ['03 尽职调查报告（法务/财务）', 'DOCX · 逐项标注核查结论与待补充事项'],
    ['04 结构化财务指标分析表', 'XLSX · AI 综合分析表 + 原表 + 待核实项'],
    ['05 投委会路演汇报 PPTX', 'PPTX · 8 种内容块异构排版 + 原生矢量图表'],
    ['06 访谈纪要与行动清单', 'DOCX · 自动提炼决策事项、责任人与期限'],
    ['07 股权与关联方关系导图', 'HTML · 交互式股权穿透与实控人关系网'],
    ['08 投委模拟质询双人对谈', 'HTML · 模拟合伙人尖锐提问与答辩预演'],
    ['09 项目关键事实核验闪卡', 'HTML · 上会前核心财务与业务口径自测卡'],
  ].forEach(([t, d], i) => {
    const x = 0.65 + (i % 3) * 4.08;
    const y = 1.94 + Math.floor(i / 3) * 1.62;
    addCard(s7, pres, { x, y, w: 3.86, h: 1.42, accent: i === 4 ? C.gold : C.pine });
    s7.addText(t, { x: x + 0.22, y: y + 0.2, w: 3.48, h: 0.38, fontFace: FONT.cn, fontSize: 15, bold: true, color: C.ink, margin: 0 });
    s7.addText(d, { x: x + 0.22, y: y + 0.68, w: 3.48, h: 0.54, fontFace: FONT.cn, fontSize: 12.2, color: C.muted, margin: 0 });
  });
}

module.exports = { buildAcSlides01To07 };
