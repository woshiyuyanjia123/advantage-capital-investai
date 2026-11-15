const path = require('node:path');
const { C, FONT, ASSET_DIR, addHeader, addCard } = require('./ac-theme.cjs');

function buildAcSlides08To14(pres) {
  // P08: Flowchart 2 - Harness & Anti-Hallucination
  const s8 = pres.addSlide();
  addHeader(s8, pres, '02 · 核心思维流程图 ②', '受控两阶段 Harness 与数字核验逻辑：如何杜绝 AI 瞎编财务数据？', '先审方案再编译，深入档自动运行红蓝互校，未核实数字自动重写并阻断报送', 8);
  s8.addImage({ path: path.join(ASSET_DIR, 'ac-flow-harness.png'), x: 0.65, y: 1.88, w: 12.03, h: 4.98 });

  // P09: Screen 3 - Governance, 409 Lock & OA Nudge
  const s9 = pres.addSlide();
  addHeader(s9, pres, '02 · 三大界面详解（门禁与安全）', '界面 03：8 阶段门禁、定稿锁定保护与四层机构权限治理', 'AI 永不代人表决、定稿或推进阶段；RichDeck 含原生图表受 409 防误覆盖保护', 9);
  [
    ['精准报送不串阶段', '报送成果时按当前阶段匹配同格式工作项，绝不塞入首项或覆盖历史已定稿（final）成果。', C.pine],
    ['一键催办与 30 秒节流', '支持站内通知 + 企微/飞书/钉钉 Webhook 一键催办，内置 30 秒冷却节流防刷屏。', C.gold],
    ['四层权限与密级分流', '功能/数据范围/业务操作/敏感字段四层隔离；云端 Key 自动适配或本机 Carbon/Ollama 兜底。', C.red],
    ['行内真 AI 溯源改写', '双栏精修选中段落注入勾选底稿做真 AI 改写，校验 aiWrite 权限，无模型如实报错不拼假文案。', C.navy],
  ].forEach(([t, d, col], i) => {
    const x = 0.65 + (i % 2) * 6.12;
    const y = 1.94 + Math.floor(i / 2) * 2.42;
    addCard(s9, pres, { x, y, w: 5.9, h: 2.18, accent: col });
    s9.addText(t, { x: x + 0.26, y: y + 0.24, w: 5.4, h: 0.42, fontFace: FONT.cn, fontSize: 16, bold: true, color: C.ink, margin: 0 });
    s9.addText(d, { x: x + 0.26, y: y + 0.76, w: 5.4, h: 1.18, fontFace: FONT.cn, fontSize: 13, color: C.muted, lineSpacingMultiple: 1.38, margin: 0 });
  });

  // P10: Flowchart 3 - OA Swimlane
  const s10 = pres.addSlide();
  addHeader(s10, pres, '03 · 核心思维流程图 ③', '机构角色协作泳道图：投资经理、风控法务、AI 引擎与投委会分工', '明确“机器做整理与核验、专业岗做复核、合伙人做表决”的四轨协同边界', 10);
  s10.addImage({ path: path.join(ASSET_DIR, 'ac-flow-oa-gate.png'), x: 0.65, y: 1.88, w: 12.03, h: 4.98 });

  // P11-P14: 4 Investment Workflows
  const drawWf = (slide, tag, title, sub, pageNo, steps, leftNote, rightNote, col) => {
    addHeader(slide, pres, tag, title, sub, pageNo);
    steps.forEach(([num, st, body], i) => {
      const x = 0.65 + i * 3.06;
      addCard(slide, pres, { x, y: 1.94, w: 2.84, h: 3.16, topBar: col });
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.18, y: 2.16, w: 0.92, h: 0.34, rectRadius: 0.05, fill: { color: col }, line: { color: col, width: 0 } });
      slide.addText(num, { x: x + 0.18, y: 2.16, w: 0.92, h: 0.34, fontFace: FONT.en, fontSize: 11.5, bold: true, color: C.white, align: 'center', valign: 'middle', margin: 0 });
      slide.addText(st, { x: x + 0.18, y: 2.64, w: 2.48, h: 0.44, fontFace: FONT.cn, fontSize: 15.5, bold: true, color: C.ink, margin: 0 });
      slide.addText(body, { x: x + 0.18, y: 3.18, w: 2.48, h: 1.72, fontFace: FONT.cn, fontSize: 12.6, color: C.muted, lineSpacingMultiple: 1.35, margin: 0 });
      if (i < 3) slide.addText('➜', { x: x + 2.84, y: 3.25, w: 0.22, h: 0.4, fontFace: FONT.cn, fontSize: 15, bold: true, color: col, align: 'center', margin: 0 });
    });
    addCard(slide, pres, { x: 0.65, y: 5.34, w: 5.9, h: 1.44, fill: C.pineLight, border: C.pine });
    slide.addText(leftNote, { x: 0.88, y: 5.48, w: 5.45, h: 1.16, fontFace: FONT.cn, fontSize: 12.8, color: C.pine, lineSpacingMultiple: 1.35, margin: 0 });
    addCard(slide, pres, { x: 6.78, y: 5.34, w: 5.9, h: 1.44, fill: C.goldLight, border: C.gold });
    slide.addText(rightNote, { x: 7.0, y: 5.48, w: 5.45, h: 1.16, fontFace: FONT.cn, fontSize: 12.8, color: C.ink, lineSpacingMultiple: 1.35, margin: 0 });
  };

  drawWf(pres.addSlide(), '03 · 工作流演示 ①（项目初筛与立项）', 'BP 快速立项工作流：10 分钟从收到 BP 到输出《立项建议书》', '适用场景：投资经理每日初筛大量项目 BP，快速判断行业匹配度与核心估值合理性', 11, [
    ['STEP 01', '拖入 BP 一键建项目', '首页拖入 BP 文件 → 自动识别企业简称、所属行业与融资轮次 → 一步建档入库。'],
    ['STEP 02', '工商穿透与行业补底稿', '工作台一键触发天眼查工商核查 + 速采行业研报，自动补充股权与涉诉底稿。'],
    ['STEP 03', '导读卡排查口径水分', '点击“BP 预测与客观证据差异排查”，带 [n] 角标列出未核实假设与缺口。'],
    ['STEP 04', '出立项报告并报送审批', '选立项制作包先审方案再编译 → 报送至“立项准备”工作项提请合伙人审批。'],
  ], '【输入材料】\n项目 BP.pptx、创始人访谈速记、公开行业研报链接。', '【交付成果】\n立项建议书.docx、工商核查底稿、立项路演PPTX。', C.pine);

  drawWf(pres.addSlide(), '03 · 工作流演示 ②（深度尽职调查）', '尽调与财务口径核验工作流：严守 A 级审计证据与数字零编造', '适用场景：立项通过后，结合审计报告、银行流水与访谈笔录开展严谨财务/业务尽调', 12, [
    ['STEP 01', '一键“仅勾 A 级硬证据”', '在左栏排除 C 级 BP 宣传口径，仅勾选审计报告、银行流水、完税证明等 A 级证据。'],
    ['STEP 02', '生成 AI 结构化财务表', '运行 authorTable 生成含 [n] 引用的“综合指标分析”Sheet + 原表 + 待核实项。'],
    ['STEP 03', '深入档红蓝军交叉挑刺', 'Harness 深入档自动模拟反方质疑，checkNumbers 核对所有数字，异常自动重写。'],
    ['STEP 04', '双栏精修与定稿锁定', '在文书工坊基于勾选底稿做行内溯源改写，风控复核后锁定为 final 防覆盖。'],
  ], '【核心防错机制】\n审计口径优先于 BP；无出处数字阻断报送，缺项诚实标注「待补充 / 未核实」。', '【交付成果】\n尽职调查报告.docx、财务指标分析表.xlsx、风险排查清单。', C.gold);

  drawWf(pres.addSlide(), '03 · 工作流演示 ③（投委会决策上会）', '投决上会工作流：异构路演 PPTX + 模拟质询 + OA 表决留痕', '适用场景：尽调收口后准备投委会汇报材料，并完成多维表决与交割前会签', 13, [
    ['STEP 01', '制作异构矢量投决 PPT', '采用 8 种内容块与原生图表自动排版投决汇报 PPTX（含 409 防误覆盖锁）。'],
    ['STEP 02', '模拟投委会尖锐质询', '生成双人质询对谈稿与核验闪卡，提前演练估值逻辑、退出路径与对赌条款。'],
    ['STEP 03', '一键催办投委与风控', '在门禁中心向未表决投委发送企微/飞书催办通知（30 秒冷却防打扰）。'],
    ['STEP 04', '投委表决与交割会签', '按全票/过半/三分之二规则人工表决，留痕归档，AI 永不代人投票或推进。'],
  ], '【治理边界】\n投委会表决与阶段推进严格由真人完成，系统自动记录审批意见与版本快照。', '【交付成果】\n投委会路演PPTX、模拟质询对谈稿.html、投决会议纪要。', C.navy);

  drawWf(pres.addSlide(), '03 · 工作流演示 ④（投后跟踪与交接）', '投后跟踪与项目交接工作流：多源速采季报 + 一键交接简报', '适用场景：已投项目季度经营跟踪、投后团队交接或退出前材料梳理', 14, [
    ['STEP 01', '速采被投企业季报新闻', '粘贴被投企业季度经营数据或抓取公开新闻/公告，自动清洗转为 Markdown 底稿。'],
    ['STEP 02', '对比立项预测与实际达成', '勾选立项尽调底稿与最新季报，一键对比营收、毛利与现金流达成偏差。'],
    ['STEP 03', '生成《项目交接简报》', '门禁中心点击一键生成交接与上会简报，自动汇总待办、风险与历史定稿。'],
    ['STEP 04', '退出决策与全案归档', '形成退出决策汇报包并完成归档确认，所有历史版本保留在 SQLite 快照中。'],
  ], '【连续性价值】\n投前尽调假设与投后实际经营在同一项目舱内持续对照，避免人员变动导致记忆断层。', '【交付成果】\n项目交接简报.docx、投后季度跟踪台账.xlsx。', C.red);
}

module.exports = { buildAcSlides08To14 };
