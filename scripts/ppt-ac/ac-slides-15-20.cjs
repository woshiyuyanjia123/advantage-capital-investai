const { C, FONT, addHeader, addCard } = require('./ac-theme.cjs');

function buildAcSlides15To20(pres) {
  // P15: Jargon to Plain Chinese for Investment Team
  const s15 = pres.addSlide();
  addHeader(s15, pres, '04 · 零门槛沟通与带教指南', '给投资经理与合伙人的一句话大白话对照表（新人带教直接照念）', '去掉技术词汇，用一级市场日常尽调与上会动作讲清楚每个功能的作用', 15);
  const rows = [
    [
      { text: '系统能力', options: { bold: true, fill: { color: C.pine }, color: C.white } },
      { text: '底层机制', options: { bold: true, fill: { color: C.pine }, color: C.white } },
      { text: '投资团队一听就懂的大白话说明', options: { bold: true, fill: { color: C.pine }, color: C.white } },
    ],
    ['勾选底稿问答', 'fileIds 注入与项目隔离', '你勾哪几份财报和访谈，AI 就只看这几份，绝不把别的项目或没核实的 BP 混进来。'],
    ['两阶段 Harness', '先出方案再红蓝互校', '像带分析师写报告：先让他交一页提纲，你确认重点后再成套写，写完还自己挑一遍错。'],
    ['checkNumbers 核验', '逐数字回查与重写阻断', '报告里只要出现原底稿没有的数字，系统自动标红逼它重写，对不上就不让报送上会。'],
    ['RichDeck 保护', '409 防误覆盖校验', '右栏排好的精致图文路演 PPT，防止在左上角简易编辑框里不小心点保存给覆盖掉。'],
    ['密级路由与提示', 'sensitiveLevel 与本地兜底', '机密底稿默认受保护；配好云端 Key 可直接用，若管理员锁死仅走本地会标黄提醒。'],
  ];
  s15.addTable(rows, {
    x: 0.65, y: 1.94, w: 12.03, colW: [2.2, 2.85, 6.98],
    fontFace: FONT.cn, fontSize: 12.5, color: C.ink,
    border: { type: 'solid', pt: 0.7, color: C.line },
    fill: { color: C.cardBg }, margin: [8, 10, 8, 10], valign: 'middle',
  });

  // P16: 5-Min Live Demo Script
  const s16 = pres.addSlide();
  addHeader(s16, pres, '04 · 5 分钟现场演示剧本', '向合伙人或新同事演示优势资本工作台：照着这 3 步做', '先用内置项目现场跑出对比结果，再展示 OA 门禁与开箱向导', 16, true);
  [
    ['第 1 分钟 · 秀速采立项', '把一份 BP 拖进首页 → 1 秒自动识别企业简称、行业与轮次并建好项目专属文件夹。'],
    ['第 3 分钟 · 秀仅勾 A 级纠偏', '进工作台点“仅勾 A 级硬证据”问营收 → 立刻指出审计口径与 BP 的差异并带 [1] 角标。'],
    ['第 5 分钟 · 秀异构 PPT 与门禁', '右栏一键生成带原生图表的投决 PPT，切到第三界面演示精准报送、催办与交接简报。'],
  ].forEach(([t, d], i) => {
    const y = 2.04 + i * 1.52;
    s16.addShape(pres.shapes.RECTANGLE, { x: 0.65, y, w: 12.03, h: 1.28, fill: { color: C.darkCard }, line: { color: C.darkBorder, width: 1 } });
    s16.addText(t, { x: 0.92, y: y + 0.22, w: 3.3, h: 0.4, fontFace: FONT.cn, fontSize: 16, bold: true, color: 'E8CA96', margin: 0 });
    s16.addText(d, { x: 4.35, y: y + 0.24, w: 8.05, h: 0.8, fontFace: FONT.cn, fontSize: 13.5, color: C.white, lineSpacingMultiple: 1.35, margin: 0 });
  });

  // P17: Enterprise Onboarding Wizard & Bulk User Import
  const s17 = pres.addSlide();
  addHeader(s17, pres, '05 · 企业开箱落地向导', '新机构接手怎么 10 分钟上线？6 项开箱体检 + CSV 批量建号', '顶栏菜单直达「企业开箱落地向导」，无需改代码即可完成团队与模型配置', 17);
  [
    ['6 项开箱就绪度体检', '自动检测：模型连通性、本机 Carbon/Ollama 状态、密级策略、天眼查配置、共享底稿盘权限、团队账号完备度。', C.pine],
    ['Excel/CSV 粘贴批量建号', '直接粘贴花名册，自动建部门、识别中文复合岗位（如“风控+法务”）、SaaS 模式生成随机高强密码并设首次改密。', C.gold],
    ['API Key 智能清洗与路由', '粘贴 Key 自动剥离 Bearer、引号与零宽字符；支持从自定义网关一键切回 auto，无云端 Key 时本机 Carbon 独立兜底。', C.navy],
    ['天眼查与企微/飞书配置', '填入天眼查 Token 即解锁工商一键补底稿；配置群机器人 Webhook 即解锁门禁页面一键催办通知。', C.red],
  ].forEach(([t, d, col], i) => {
    const x = 0.65 + (i % 2) * 6.12;
    const y = 1.94 + Math.floor(i / 2) * 2.42;
    addCard(s17, pres, { x, y, w: 5.9, h: 2.18, accent: col });
    s17.addText(t, { x: x + 0.26, y: y + 0.24, w: 5.4, h: 0.42, fontFace: FONT.cn, fontSize: 16, bold: true, color: C.ink, margin: 0 });
    s17.addText(d, { x: x + 0.26, y: y + 0.76, w: 5.4, h: 1.18, fontFace: FONT.cn, fontSize: 13, color: C.muted, lineSpacingMultiple: 1.38, margin: 0 });
  });

  // P18: Architecture & Quality Assurance
  const s18 = pres.addSlide();
  addHeader(s18, pres, '05 · 工程底座与质量保障', '双模统一架构：零构建前端 + Node 内置 SQLite + Electron 桌面端', 'v3.2.3 已通过 85 项自动化单元测试与 127 项全生命周期 SaaS 验收', 18);
  [
    ['双模运行形态', '• 独立桌面端：Windows / macOS 安装包，隐藏原生菜单\n• DSH 插件 & Web SaaS：浏览器直连局域网/云端协同\n• 共用 core/index.mjs 组合根，逻辑 100% 一致', C.pine],
    ['全量自动化守护', '• 85 项自动化测试（含 F1–F6 与 U1–U6 企业级回归）\n• 317+ 前端动作零死按钮静态扫描\n• 127 项全生命周期验收脚本（npm run verify）', C.gold],
  ].forEach(([t, d, col], i) => {
    const x = 0.65 + i * 6.12;
    addCard(s18, pres, { x, y: 1.96, w: 5.9, h: 4.82, topBar: col });
    s18.addText(t, { x: x + 0.26, y: 2.24, w: 5.4, h: 0.44, fontFace: FONT.cn, fontSize: 17, bold: true, color: C.ink, margin: 0 });
    s18.addText(d, { x: x + 0.26, y: 2.86, w: 5.4, h: 3.6, fontFace: FONT.cn, fontSize: 13.5, color: C.muted, lineSpacingMultiple: 1.55, margin: 0 });
  });

  // P19: Daily Shortcut & Cheat Sheet
  const s19 = pres.addSlide();
  addHeader(s19, pres, '05 · 高频快捷键与日常操作卡', '每天上班必用的 4 个快捷动作，1 分钟形成肌肉记忆', '用好 Ctrl+K 指令台与仅勾 A 级筛选，投研效率提升 5 倍以上', 19);
  [
    ['Ctrl+K / ⌘K', '全局快捷指令台', '无输入时展示高频动作与活跃项目，输入关键词混合检索项目、底稿与命令，键盘回车直达。'],
    ['仅勾 A 级', '硬证据一键过滤', '做财务口径核对与写尽调结论前先点一下，排除 C 级 BP 宣传材料干扰。'],
    ['先审方案', '两阶段 Harness', '成套出稿前先花 30 秒看一遍《制作方案》并补充投资经理指令，成稿一次到位。'],
    ['一键催办', 'OA 门禁协同', '上会前在第三界面一键催办未表决投委，会后一键生成交接简报留痕。'],
  ].forEach(([k, t, d], i) => {
    const x = 0.65 + (i % 2) * 6.12;
    const y = 1.94 + Math.floor(i / 2) * 2.42;
    addCard(s19, pres, { x, y, w: 5.9, h: 2.18, accent: C.pine });
    s19.addText(`${k}  |  ${t}`, { x: x + 0.26, y: y + 0.22, w: 5.4, h: 0.42, fontFace: FONT.cn, fontSize: 16, bold: true, color: C.pine, margin: 0 });
    s19.addText(d, { x: x + 0.26, y: y + 0.76, w: 5.4, h: 1.18, fontFace: FONT.cn, fontSize: 13, color: C.muted, lineSpacingMultiple: 1.38, margin: 0 });
  });

  // P20: Closing
  const s20 = pres.addSlide();
  addHeader(s20, pres, '06 · 今日落地行动清单', '优势资本 · 智能投研工作台：今日 4 步即可全面投产', '仓库地址：github.com/woshiyuyanjia123/advantage-capital-investai', 20, true);
  [
    ['01  打开桌面端 / SaaS', '双击桌面「优势资本 智能投研」图标启动，确认顶栏无黄色密级告警。'],
    ['02  跑一遍开箱体检', '在右上菜单打开「企业开箱落地向导」，批量导入团队账号并配置群催办 Webhook。'],
    ['03  拖入 1 个在谈项目', '把在谈项目的 BP 与财报拖入首页快速立项，体验 A 级证据问答与财务表生成。'],
    ['04  走通 1 次投决门禁', '将成果报送至对应阶段工作项，体验红蓝军核验、催办提醒与交接简报生成。'],
  ].forEach(([t, d], i) => {
    const x = 0.65 + (i % 2) * 6.12;
    const y = 1.96 + Math.floor(i / 2) * 2.08;
    s20.addShape(pres.shapes.RECTANGLE, { x, y, w: 5.9, h: 1.84, fill: { color: C.darkCard }, line: { color: C.darkBorder, width: 1 } });
    s20.addText(t, { x: x + 0.26, y: y + 0.2, w: 5.38, h: 0.4, fontFace: FONT.cn, fontSize: 16, bold: true, color: 'E8CA96', margin: 0 });
    s20.addText(d, { x: x + 0.26, y: y + 0.7, w: 5.38, h: 0.94, fontFace: FONT.cn, fontSize: 12.8, color: 'DCE8E2', lineSpacingMultiple: 1.36, margin: 0 });
  });
  s20.addShape(pres.shapes.RECTANGLE, { x: 0.65, y: 6.26, w: 12.03, h: 0.58, fill: { color: C.pine }, line: { color: '92D4B5', width: 0.9 } });
  s20.addText('优势资本 · 智能投研工作台  |  让每一份投资决策都有据可查、有迹可循', {
    x: 0.65, y: 6.26, w: 12.03, h: 0.58, fontFace: FONT.cn, fontSize: 14.5, bold: true, color: C.white, align: 'center', valign: 'middle', margin: 0,
  });
}

module.exports = { buildAcSlides15To20 };
