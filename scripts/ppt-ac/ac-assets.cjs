const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/ASUS/node_modules/playwright');
const { ASSET_DIR } = require('./ac-theme.cjs');

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;font-family:"Microsoft YaHei","PingFang SC",sans-serif;}
body{background:#FCFBF8;color:#1B1A17;}
.win{background:#FCFBF8;border:2px solid #2D5A4A;border-radius:10px;overflow:hidden;box-shadow:0 16px 36px rgba(16,35,28,.18);}
.top{background:#10231C;color:#F5F2EA;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-size:13px;}
.brand{font-weight:700;color:#E8CA96;letter-spacing:.5px;}
.tabs span{padding:4px 10px;border-radius:4px;margin:0 3px;font-size:12px;color:#B8C7BF;}
.tabs span.on{background:#2D5A4A;color:#FFF;font-weight:700;}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;}
.b-red{background:#FBECE9;color:#B03A2E;border:1px solid #E2A9A3;}
.b-gold{background:#FAF2E4;color:#9A6B1E;border:1px solid #DFC28F;}
.b-pine{background:#E5EFEA;color:#2D5A4A;border:1px solid #A8CBB9;}
.canvas{width:1160px;height:480px;background:#FFFFFF;border:2px solid #D8D4C8;border-radius:12px;padding:22px 26px;display:flex;flex-direction:column;justify-content:space-between;}
.node{border-radius:10px;padding:14px 16px;border:2px solid #2D5A4A;background:#FFF;}
.n-pine{background:#E5EFEA;border-color:#2D5A4A;}
.n-gold{background:#FAF2E4;border-color:#9A6B1E;}
.n-red{background:#FBECE9;border-color:#B03A2E;}
.n-dark{background:#10231C;border-color:#10231C;color:#FFF;}
.t{font-size:17px;font-weight:800;margin-bottom:5px;}
.d{font-size:13.5px;line-height:1.45;color:#4A473F;}
.n-dark .d{color:#D3E0DA;}
.arr{font-size:26px;font-weight:900;color:#2D5A4A;display:flex;align-items:center;justify-content:center;}
.tag{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;margin-bottom:6px;}
`;

const ASSETS = [
  {
    name: 'ac-hero-overview.png', w: 960, h: 620,
    html: `<div style="padding:18px;background:#10231C;width:960px;height:620px;display:flex;flex-direction:column;gap:14px;">
      <div class="win" style="border-color:#446B5B;">
        <div class="top"><span class="brand">AC · 优势资本智能投研工作台 v3.2.3</span><div class="tabs"><span class="on">① 投研项目总览</span><span>② 尽调与研判工作台</span><span>③ 阶段门禁与投决</span></div><span style="color:#8FD1B2;font-size:12px;">Ctrl+K 全局指令 | 密级路由已就绪</span></div>
        <div style="padding:14px;display:grid;grid-template-columns:1.1fr 1.5fr 1.1fr;gap:12px;background:#FCFBF8;">
          <div style="background:#FFF;border:1px solid #D8D4C8;padding:12px;border-radius:6px;">
            <div style="font-weight:700;font-size:13px;color:#2D5A4A;margin-bottom:8px;">原始底稿舱（严格隔离成品）</div>
            <div style="font-size:12px;padding:6px;background:#E5EFEA;border-radius:4px;margin-bottom:6px;">☑ <span class="badge b-pine">A级</span> 审计报告及银行流水.pdf</div>
            <div style="font-size:12px;padding:6px;background:#FAF2E4;border-radius:4px;margin-bottom:6px;">☑ <span class="badge b-gold">B级</span> 客户访谈与对账单.docx</div>
            <div style="font-size:12px;padding:6px;background:#F5F2EB;border-radius:4px;margin-bottom:8px;">☐ <span class="badge b-red">C级</span> BP商业计划书_衡远储能.pptx</div>
            <div style="font-size:11px;color:#5F5B52;border-top:1px dashed #D8D4C8;padding-top:8px;">支持文件拖拽 / 粘贴文本 / 网页防SSRF速采</div>
          </div>
          <div style="background:#FFF;border:1px solid #D8D4C8;padding:12px;border-radius:6px;">
            <div style="font-weight:700;font-size:13px;color:#2D5A4A;margin-bottom:8px;">勾选底稿溯源问答 · 数字零编造</div>
            <div style="font-size:12px;line-height:1.6;background:#F8F6F0;padding:10px;border-left:3px solid #2D5A4A;margin-bottom:8px;">
              经比对勾选底稿：审计口径 2025 年营收为 <b>1.86 亿元</b> <b>[1]</b>，较 BP 预测口径 2.40 亿元存在 <b>22.5% 差异</b>；前五大客户集中度 68.4% <b>[2]</b>。本轮估值 12.0 亿元对应 PS 为 <b>6.45x</b>。
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="badge b-pine">财务口径差异排查</span><span class="badge b-gold">天眼查工商穿透</span><span class="badge b-red">模拟投委会质询</span>
            </div>
          </div>
          <div style="background:#FFF;border:1px solid #D8D4C8;padding:12px;border-radius:6px;">
            <div style="font-weight:700;font-size:13px;color:#2D5A4A;margin-bottom:8px;">受控成套制作 & 专属成果舱</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:8px;">
              <div style="padding:6px;background:#F1EEE6;border-radius:4px;font-weight:700;">立项报告.docx</div>
              <div style="padding:6px;background:#F1EEE6;border-radius:4px;font-weight:700;">异构路演PPTX</div>
              <div style="padding:6px;background:#F1EEE6;border-radius:4px;font-weight:700;">财务分析表.xlsx</div>
              <div style="padding:6px;background:#E5EFEA;border-radius:4px;font-weight:700;color:#2D5A4A;">关系图谱.html</div>
            </div>
            <div style="font-size:11px;padding:7px;background:#2D5A4A;color:#FFF;border-radius:4px;text-align:center;font-weight:700;">红蓝军互校 0 异常 · 一键报送投决</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#183329;border:1px solid #2E5748;border-radius:8px;padding:14px;color:#F3EFE6;">
          <div style="color:#E8CA96;font-size:12px;font-weight:700;margin-bottom:4px;">底座一 · 机构 OA 待办与 8 阶段门禁</div>
          <div style="font-size:12px;color:#C4D2CB;line-height:1.5;">待表决、待复核、轮到我推进一屏聚合；企微/飞书/钉钉 30 秒节流一键催办。</div>
        </div>
        <div style="background:#183329;border:1px solid #2E5748;border-radius:8px;padding:14px;color:#F3EFE6;">
          <div style="color:#E8CA96;font-size:12px;font-weight:700;margin-bottom:4px;">底座二 · 受控 Harness 与 9 类成果</div>
          <div style="font-size:12px;color:#C4D2CB;line-height:1.5;">两阶段先审方案再编译；Agent×Agent 红蓝互校，未核数字自动重写并阻断报送。</div>
        </div>
        <div style="background:#183329;border:1px solid #2E5748;border-radius:8px;padding:14px;color:#F3EFE6;">
          <div style="color:#E8CA96;font-size:12px;font-weight:700;margin-bottom:4px;">底座三 · 四层权限与密级路由</div>
          <div style="font-size:12px;color:#C4D2CB;line-height:1.5;">岗位/范围/操作/密级四层隔离；云端 Key 自动适配或本地 Carbon/Ollama 兜底。</div>
        </div>
      </div>
    </div>`
  },
  {
    name: 'ac-flow-master.png', w: 1160, h: 480,
    html: `<div class="canvas">
      <div style="display:grid;grid-template-columns:220px 44px 235px 44px 280px 44px 235px;align-items:center;height:365px;">
        <div class="node n-pine">
          <span class="tag" style="background:#2D5A4A;color:#FFF;">起点 · 多源速采立项</span>
          <div class="t">拖入 BP / 粘贴 / 抓网页</div>
          <div class="d">• 自动识别企业简称、行业与轮次<br>• 一步完成建公司+建项目+入库<br>• 自动隔离无关联公司项目底稿</div>
        </div>
        <div class="arr">➜</div>
        <div class="node n-gold">
          <span class="tag" style="background:#9A6B1E;color:#FFF;">研判 · 勾选底稿与核查</span>
          <div class="t">A/B/C 分级 + 工商补底稿</div>
          <div class="d">• 一键仅勾 A 级审计/流水硬证据<br>• 对接天眼查自动补齐工商核查<br>• 按项目+用户隔离对话，带 [n] 角标</div>
        </div>
        <div class="arr">➜</div>
        <div class="node n-pine" style="border-width:2.5px;">
          <span class="tag" style="background:#2D5A4A;color:#FFF;">编制 · 两阶段受控 Harness</span>
          <div class="t">先审方案 → 红蓝互校 → 成稿</div>
          <div class="d">1. 输出《制作方案》供投资经理微调<br>2. 深入档运行正反方交叉挑刺<br>3. 编译 9 类真实 Office 文件 + 核对数字</div>
        </div>
        <div class="arr">➜</div>
        <div class="node n-dark">
          <span class="tag" style="background:#E8CA96;color:#10231C;">终点 · 门禁与投决</span>
          <div class="t">精准报送 + 投委表决</div>
          <div class="d">• 匹配当前阶段同格式工作项<br>• 定稿锁定防误改（409 护栏）<br>• AI 永不代人表决或推进阶段</div>
        </div>
      </div>
      <div style="background:#F1EEE6;border-radius:8px;padding:10px 16px;font-size:13.5px;font-weight:700;color:#2D5A4A;">
        核心架构原则：所有成果自动落盘项目专属目录（无零散导出按钮），从底稿入库到投委会表决形成完整可审计闭环。
      </div>
    </div>`
  },
  {
    name: 'ac-flow-harness.png', w: 1160, h: 480,
    html: `<div class="canvas">
      <div style="display:grid;grid-template-columns:230px 46px 310px 46px 245px 46px 180px;align-items:center;height:365px;">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="node n-pine">
            <div class="t">① 勾选底稿与项目字段</div>
            <div class="d">仅读取用户勾选的 fileIds，绝不混入未勾选或他项目底稿</div>
          </div>
          <div class="node n-gold">
            <div class="t">② 密级与模型路由</div>
            <div class="d">按密级自动路由云端 Key 或本机 Carbon/Ollama，受限则诚实标“底稿摘编”</div>
          </div>
        </div>
        <div class="arr">➜</div>
        <div class="node" style="border-color:#2D5A4A;border-width:2.5px;">
          <span class="tag" style="background:#2D5A4A;color:#FFF;">受控两阶段编排（Fast / Balanced / Deep）</span>
          <div class="t">阶段一：输出《制作方案》人工确认</div>
          <div class="d" style="margin-bottom:10px;">列出核心投资逻辑、数据缺口与每份成果侧重，支持律师/经理修改指令。</div>
          <div class="t">阶段二：红蓝军互校 + 异构编译</div>
          <div class="d">深入档自动运行多智能体交叉核对，PPTX 采用 8 种内容块异构矢量排版。</div>
        </div>
        <div class="arr">➜</div>
        <div class="node n-red">
          <span class="tag" style="background:#B03A2E;color:#FFF;">checkNumbers 数字护栏</span>
          <div class="t">逐数字核对原稿出处</div>
          <div class="d">• 发现无出处且无算式数字 → <b>自动提示重写 1 次</b><br>• 仍未核实 → <b>标红并阻断报送</b></div>
        </div>
        <div class="arr">➜</div>
        <div class="node n-dark" style="height:240px;display:flex;flex-direction:column;justify-content:center;">
          <div class="t" style="color:#E8CA96;font-size:18px;">合格成果入舱</div>
          <div class="d" style="margin-top:8px;">RichDeck 受 409 防误覆盖保护，可直接报送至投决工作项</div>
        </div>
      </div>
      <div style="background:#FBECE9;border:1px solid #E2ABA4;border-radius:8px;padding:10px 16px;font-size:13.5px;font-weight:700;color:#B03A2E;">
        事实铁律：测算必须写明算式，缺失信息诚实标注「待补充 / 未核实」，严禁编造财务数据、套话或主观评星。
      </div>
    </div>`
  },
  {
    name: 'ac-flow-oa-gate.png', w: 1160, h: 480,
    html: `<div class="canvas">
      <div style="display:grid;grid-template-columns:155px repeat(4,1fr);gap:10px;font-size:14px;font-weight:800;text-align:center;color:#2D5A4A;padding-bottom:6px;border-bottom:2px solid #D8D4C8;">
        <div>岗位 / 阶段</div><div>机会与立项</div><div>尽职调查</div><div>投委会决策</div><div>交割与投后退出</div>
      </div>
      <div style="display:grid;grid-template-columns:155px repeat(4,1fr);gap:10px;align-items:center;">
        <div class="node n-pine" style="padding:10px;text-align:center;"><div class="t" style="font-size:15px;margin:0;">投资经理 / 分析师</div></div>
        <div class="node" style="padding:10px;"><div class="d">拖入 BP 一键立项，速采行业研报与工商底稿</div></div>
        <div class="node" style="padding:10px;"><div class="d">勾选 A 级财报生成《尽调报告》与《财务分析表》</div></div>
        <div class="node" style="padding:10px;"><div class="d">精准报送成套材料至投决工作项，发起上会</div></div>
        <div class="node" style="padding:10px;"><div class="d">生成《项目交接简报》与投后季度跟踪台账</div></div>
      </div>
      <div style="display:grid;grid-template-columns:155px repeat(4,1fr);gap:10px;align-items:center;">
        <div class="node n-gold" style="padding:10px;text-align:center;"><div class="t" style="font-size:15px;margin:0;">风控 / 法务 / 财务</div></div>
        <div class="node" style="padding:10px;background:#F9F8F4;"><div class="d">核查立项合规性与行业准入红线</div></div>
        <div class="node" style="padding:10px;"><div class="d">独立复核财务口径差异与法律条款风险</div></div>
        <div class="node" style="padding:10px;"><div class="d">在门禁中心签署专业复核意见或退回补充</div></div>
        <div class="node" style="padding:10px;"><div class="d">交割前先决条件会签与退出合规确认</div></div>
      </div>
      <div style="display:grid;grid-template-columns:155px repeat(4,1fr);gap:10px;align-items:center;">
        <div class="node n-dark" style="padding:10px;text-align:center;"><div class="t" style="font-size:15px;margin:0;color:#E8CA96;">智能投研引擎</div></div>
        <div class="node n-pine" style="padding:10px;"><div class="d"><b>自动：</b>识别企业简称行业 + 隔离无公司底稿</div></div>
        <div class="node n-pine" style="padding:10px;"><div class="d"><b>自动：</b>红蓝互校 + 数字核验 + 缺失标待补充</div></div>
        <div class="node n-pine" style="padding:10px;"><div class="d"><b>自动：</b>OA 待办聚合 + 企微/飞书 30 秒节流催办</div></div>
        <div class="node n-pine" style="padding:10px;"><div class="d"><b>自动：</b>版本快照留痕 + 定稿锁定防静默回退</div></div>
      </div>
      <div style="display:grid;grid-template-columns:155px repeat(4,1fr);gap:10px;align-items:center;">
        <div class="node n-red" style="padding:10px;text-align:center;"><div class="t" style="font-size:15px;margin:0;">合伙人 / 投委会</div></div>
        <div class="node n-red" style="padding:10px;"><div class="d"><b>拍板：</b>审批立项准入，决定是否投入尽调资源</div></div>
        <div class="node n-red" style="padding:10px;"><div class="d"><b>拍板：</b>审阅尽调结论，确认是否具备上会条件</div></div>
        <div class="node n-red" style="padding:10px;"><div class="d"><b>拍板：</b>全票/过半/三分之二表决（AI 永不代投）</div></div>
        <div class="node n-red" style="padding:10px;"><div class="d"><b>拍板：</b>批准交易交割、退出方案与归档结项</div></div>
      </div>
    </div>`
  }
];

async function renderAcAssets() {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ deviceScaleFactor: 3 });
  for (const item of ASSETS) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: item.w, height: item.h });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${item.html}</body></html>`);
    await page.screenshot({ path: path.join(ASSET_DIR, item.name) });
    await page.close();
  }
  await browser.close();
}

module.exports = { renderAcAssets };
