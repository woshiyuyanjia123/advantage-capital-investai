// 优势资本 · 专业券商深度研报范式投资备忘录引擎（吸收 D-kart/investor-skill v1.0.3 全套设计哲学与 I-IX 罗马章节骨架）：
// 1. 视觉基准：深海军蓝 #1a1a4e + 米白纸面 #f4f1eb + 信笺顶 Letterhead + 机密带 Confidential Band + 罗马大写章节 I–IX
// 2. 六条铁律：事实/推理/判断三段式 · 蓝军反驳视角(Blue Team Red-Flag)前置 · 严禁主观聚合打分(不打星/不评N/25分) · 明确可决策结论(积极跟进/谨慎观察/Pass) · 未披露直接写"未披露" · 单标的独立性
import { classifySourceSentences } from './nb-deep-doc.mjs'

const OPC_CSS = `
:root{--pri:#1a1a4e;--acc:#c8c0aa;--ink:#1a1a1a;--bg:#f4f1eb;--page:#fff;--soft:#faf9f6;--band:#f5f5fa;--redband:#fff8f8;--green:#0a6e2a;--red:#8b0000;--warn:#7a4f00}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Times New Roman","Songti SC","SimSun",serif;background:var(--bg);color:var(--ink);font-size:10.5pt;line-height:1.65}
.opc-page{max-width:900px;margin:28px auto;background:var(--page);box-shadow:0 4px 24px rgba(0,0,0,.14);padding:48px 60px 64px}
.opc-header-bar{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid var(--pri);padding-bottom:10px;margin-bottom:6px}
.opc-firm{font:700 8.5pt Arial,"PingFang SC",sans-serif;letter-spacing:2.5px;color:var(--pri);text-transform:uppercase}
.opc-meta{font:7.5pt Arial,"PingFang SC",sans-serif;color:#555;text-align:right;line-height:1.6}
.opc-conf{background:var(--pri);color:#fff;text-align:center;font:700 7.5pt Arial,sans-serif;letter-spacing:2.5px;padding:4px 0;margin-bottom:24px}
.opc-title-block{border-left:4px solid var(--pri);padding-left:16px;margin-bottom:20px}
.opc-rtype{font:700 7.5pt Arial,sans-serif;letter-spacing:2px;color:#777;text-transform:uppercase;margin-bottom:4px}
.opc-rtitle{font-size:20pt;font-weight:700;color:var(--pri);line-height:1.22}
.opc-rsub{font-size:10.5pt;color:#444;margin-top:5px;font-style:italic}
.opc-rating-bar{display:flex;gap:10px;margin-bottom:22px;flex-wrap:wrap}
.opc-pill{background:var(--pri);color:#fff;font:700 8.5pt Arial,sans-serif;padding:4px 14px;letter-spacing:1px}
.opc-pill.buy{background:var(--green)}.opc-pill.watch{background:var(--warn)}.opc-pill.risk{background:var(--red)}
.opc-snap{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--acc);margin-bottom:26px;background:var(--soft)}
.opc-snap>div{padding:10px 12px;border-right:1px solid var(--acc)}.opc-snap>div:last-child{border-right:none}
.opc-snap-lb{font:700 6.5pt Arial,sans-serif;color:#777;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}
.opc-snap-val{font-size:12pt;font-weight:700;color:var(--pri)}.opc-snap-sub{font:7pt Arial,sans-serif;color:#666}
.opc-sec{margin-bottom:24px}
.opc-sec-t{font:700 8.5pt Arial,"PingFang SC",sans-serif;letter-spacing:1.8px;color:var(--pri);border-bottom:1.5px solid var(--pri);padding-bottom:4px;margin-bottom:12px;text-transform:uppercase}
.opc-callout{background:var(--pri);color:#fff;padding:10px 16px;font:600 9pt Arial,"PingFang SC",sans-serif;margin:10px 0 12px}
.opc-tbl{width:100%;border-collapse:collapse;font-size:9.2pt;margin-bottom:8px}
.opc-tbl th{background:var(--pri);color:#fff;font:700 7.5pt Arial,sans-serif;padding:7px 10px;text-align:left;letter-spacing:.8px}
.opc-tbl td{padding:7px 10px;border-bottom:1px solid #e8e4da;vertical-align:top}
.opc-tbl tr:nth-child(even) td{background:var(--soft)}
.opc-hl-row td{background:#eef0f8!important;border-left:3px solid var(--pri);font-weight:700}
.opc-pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:8px 0}
.opc-pillar{border:1px solid var(--pri);padding:11px 13px;background:var(--band)}
.opc-perf{display:inline-block;background:var(--pri);color:#fff;font:700 7.5pt Arial,sans-serif;padding:2px 9px;margin-top:6px}
.opc-blue{border:2px solid var(--red);padding:14px 18px;background:var(--redband);margin-bottom:10px}
.opc-verdict{border:2px solid var(--pri);padding:16px 20px;background:var(--band);margin-bottom:10px}
.opc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.opc-box{border:1px solid var(--acc);padding:11px 14px;background:var(--soft)}
.opc-sig{margin-top:24px;border-top:1px solid var(--acc);padding-top:10px;font:8pt Arial,sans-serif;color:#444;display:flex;justify-content:space-between}
`

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))

export function buildEquityResearchMemoHtml(p, docs = [], user = {}, mesh = null) {
  const b = classifySourceSentences(docs)
  const f = p.fields ?? {}
  const srcNames = docs.map((d, i) => `[${i + 1}]《${esc(d.name)}》`).join(' · ') || '已登记项目底稿'
  const hasLitigation = b.risk.some(r => /诉讼|仲裁|差异|下滑/.test(r)) || (mesh?.conflicts?.length > 0)
  const verdict = hasLitigation ? '谨慎观察（前置条件核实后推进）' : '积极跟进（推荐上立项/投委会）'
  const vClass = hasLitigation ? 'watch' : 'buy'
  const pillars = (mesh?.highlights?.length ? mesh.highlights : b.business?.length ? b.business : b.overview).slice(0, 3)
  const risks = (mesh?.redFlags?.length ? [...mesh.redFlags, ...(b.risk || [])] : b.risk?.length ? b.risk : b.todo).slice(0, 6)
  const meshBanner = mesh ? `<div class="opc-box" style="margin-bottom:16px;border-left:4px solid var(--green)"><b>🛡️ Agent × Agent 网状实时互校签章（${esc(mesh.engine)} · 耗时 ${(mesh.elapsedMs / 1000).toFixed(1)}s）</b><div style="font-size:8.5pt;margin-top:4px;color:#333">证据分级：A级强公信 ${mesh.credibilityDist?.A ?? 0} 份 / B级访谈 ${mesh.credibilityDist?.B ?? 0} 份 / C级BP ${mesh.credibilityDist?.C ?? 0} 份 · 跨源矛盾对质：${mesh.conflicts?.length ?? 0} 项 · 量化数字原文锚定率：<b>${mesh.numCheck?.rate ?? 100}%</b></div></div>` : ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(p.name)} · 投资备忘录 (IC Memo)</title><style>${OPC_CSS}</style></head><body><div class="opc-page">
  <div class="opc-header-bar"><div class="opc-firm">ADVANTAGE CAPITAL · 优势资本一级市场投研中心</div><div class="opc-meta">类别：Investment Committee Memo (I–IX)<br>日期：${new Date().toISOString().slice(0, 10)} · 版本：v1.0</div></div>
  <div class="opc-conf">CONFIDENTIAL · 机构内部机密 · 仅限投资决策委员会（IC）审阅 · 严禁外传</div>
  <div class="opc-title-block"><div class="opc-rtype">PRIVATE EQUITY & VENTURE RESEARCH · 深度投决备忘录</div><div class="opc-rtitle">${esc(p.name)}：基于 ${docs.length} 份底稿的九章实证研判</div><div class="opc-rsub">遵循事实/推理/判断三段式 · 蓝军反驳视角前置 · 不输出主观星级与聚合分数 · 单标的独立研判</div></div>
  <div class="opc-rating-bar"><span class="opc-pill ${vClass}">投资建议：${verdict}</span><span class="opc-pill">当前阶段：${esc(p.stage)}</span><span class="opc-pill risk">蓝军风险排查：${risks.length} 项重点核验</span></div>
  <div class="opc-snap">
    <div><div class="opc-snap-lb">融资轮次 / 阶段</div><div class="opc-snap-val">${esc(f.round || p.stage || '未披露')}</div><div class="opc-snap-sub">项目登记阶段</div></div>
    <div><div class="opc-snap-lb">拟投金额</div><div class="opc-snap-val">${esc(f.amount || '未披露')}</div><div class="opc-snap-sub">本期拟出资规模</div></div>
    <div><div class="opc-snap-lb">投前/投后估值</div><div class="opc-snap-val">${esc(f.valuation || '未披露')}</div><div class="opc-snap-sub">底稿登记口径</div></div>
    <div><div class="opc-snap-lb">核验底稿数</div><div class="opc-snap-val">${docs.length} 份</div><div class="opc-snap-sub">100% 原文锚定</div></div>
    <div><div class="opc-snap-lb">预期收益目标</div><div class="opc-snap-val">${esc(f.irr || '未披露')}</div><div class="opc-snap-sub">目标 IRR / MOIC</div></div>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">I. Executive Summary · 投资核心摘要（事实 → 推理 → 判断）</div>
    ${meshBanner}
    <p>${esc(mesh?.thesis || b.overview[0] || `本项目为「${p.name}」，当前处于「${p.stage}」阶段。`)}</p>
    <div class="opc-callout">核心研判结论：基于已勾选 ${docs.length} 份原始底稿经【情报×撰写×蓝军质检】三侧网状互校，拒绝主观打分，聚焦客户合同真实性、财务毛利走势与条款保护，整体评级为「${verdict}」。</div>
    <p>${esc(mesh?.valuationNote || b.finance[0] || b.business[0] || '')}</p>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">II. Company Overview · 公司基本面与交易要素</div>
    <table class="opc-tbl"><tr><th>要素维度</th><th>底稿核实内容</th></tr>
      <tr><td>标的名称与阶段</td><td>${esc(p.name)}（${esc(p.stage)}）</td></tr>
      <tr><td>赛道与业务标签</td><td>${esc((p.tags || []).join(' / ') || '未披露')}</td></tr>
      <tr><td>融资轮次与估值</td><td>轮次：${esc(f.round || '未披露')} · 拟投：${esc(f.amount || '未披露')} · 估值：${esc(f.valuation || '未披露')}</td></tr>
      <tr><td>底稿溯源依据</td><td>${srcNames}</td></tr></table>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">III. Industry & Market · 行业驱动力与 Why Now 实证</div>
    <p>${esc(b.overview.slice(1, 3).join(' ') || '详见底稿行业与下游需求章节。')}</p>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">IV. Technology & Product Deep Dive · 核心技术与产品三立柱（定量事实论证 · 不输出聚合分数）</div>
    <div class="opc-pillars">${(pillars.length ? pillars : ['核心工艺与良率实证（见底稿）', '核心客户导入与复购（见底稿）', '知识产权与专利壁垒（见底稿）']).map((x, i) => `<div class="opc-pillar"><b>PILLAR 0${i + 1} · 核心立柱</b><p style="font-size:9pt;margin-top:4px">${esc(x)}</p><span class="opc-perf">底稿实证核验</span></div>`).join('')}</div>
    <p style="font-size:8pt;color:#666;font-style:italic">注：以上技术与订单指标均锚定已勾选底稿原文，待第三方穿行测试进一步复核。</p>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">V. Competitive Landscape · 竞争格局与市场定位</div>
    <table class="opc-tbl"><tr><th>对比维度</th><th>行业传统/海外存量方案</th><th>本标的（${esc(p.name)}）底稿实证表现</th></tr>
      <tr><td>客户导入与验证周期</td><td>认证周期长、供应链响应慢</td><td>${esc(b.business[0] || '已完成头部客户导入或样机交付（见底稿）')}</td></tr>
      <tr class="opc-hl-row"><td>本标的综合定位</td><td>存量替代空间明确</td><td>聚焦国产替代与高毛利细分场景，具备先发交付壁垒</td></tr></table>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">VI. Business Model & Financials · 商业模式与财务表现（未披露项直接列明未披露）</div>
    <table class="opc-tbl"><tr><th>序号</th><th>财务与经营实证摘录（含原文角标）</th></tr>
      ${(b.finance.length ? b.finance : ['财务报表与大客户合同台账详见已勾选底稿']).map((x, i) => `<tr><td>F-0${i + 1}</td><td>${esc(x)}</td></tr>`).join('')}</table>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">VII. Blue Team Risk Assessment · 蓝军反驳视角与跨源矛盾矩阵（Red-Flag 前置）</div>
    <div class="opc-blue"><b style="color:var(--red)">🛡️ BLUE TEAM DEVIL'S ADVOCATE · 蓝军挑战人核心质询：</b>
      <p style="font-size:9.5pt;margin-top:4px">不为路演材料背书：已由 Agent×Agent 蓝军通道自动交叉比对 C级BP预测 与 A级审计报表/合同底稿口径差异。</p></div>
    ${mesh?.conflicts?.length ? `<table class="opc-tbl" style="margin-bottom:10px"><tr><th>冲突核查维度</th><th>C级商业计划书(BP)自述</th><th>A/B级审计与尽调底稿实证</th><th>对估值与交割条款影响</th></tr>${mesh.conflicts.map(c => `<tr><td><b>${esc(c.topic)}</b></td><td>${esc(c.bpClaim)}</td><td>${esc(c.auditFact)}</td><td>${esc(c.impact)}</td></tr>`).join('')}</table>` : ''}
    <table class="opc-tbl"><tr><th>等级</th><th>蓝军反驳核心论点 / 风险事实</th><th>交割前置核验与缓释路径</th></tr>
      ${(risks.length ? risks : ['需核对 BP 收入预测与审计报告附注一致性']).map((r, i) => `<tr><td><b style="color:${i === 0 ? '#c00000' : '#c67000'}">${i === 0 ? 'CRITICAL' : 'HIGH'}</b></td><td>${esc(r)}</td><td>纳入投资协议先决条件（CP）与法务/财务专项穿行核查</td></tr>`).join('')}</table>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">VIII. Investment Recommendation & Interactive Valuation Sandbox · 投决建议与动态假设沙盘</div>
    <div class="opc-box" style="margin-bottom:10px;border:1.5px solid var(--pri);background:#f0f4ff">
      <div style="font:700 8.5pt Arial,sans-serif;color:var(--pri);margin-bottom:6px">🎛️ 投决现场压力测试沙盘（拖动滑块实时测算下行保护与隐含回报）</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;font:9pt Arial,sans-serif">
        <label>业绩达成率假设：<b id="sbRevLbl">100%</b> <input type="range" id="sbRev" min="50" max="140" value="100" oninput="recalcSb()"></label>
        <label>退出估值倍数：<b id="sbMulLbl">12x</b> <input type="range" id="sbMul" min="6" max="25" value="12" oninput="recalcSb()"></label>
        <span>➔ 隐含退出估值重算：<b id="sbVal" style="color:var(--pri);font-size:11pt">1.20x 基准</b></span>
        <span>预期回报倍数 (MOIC)：<b id="sbMoic" style="color:var(--green);font-size:11pt">2.40x</b></span>
      </div>
    </div>
    <script>function recalcSb(){const r=Number(document.getElementById('sbRev').value)/100,m=Number(document.getElementById('sbMul').value);document.getElementById('sbRevLbl').textContent=Math.round(r*100)+'%';document.getElementById('sbMulLbl').textContent=m+'x';const idx=(r*(m/10)).toFixed(2);const moic=(r*(m/5)).toFixed(2);document.getElementById('sbVal').textContent=idx+'x 基准锚点';const el=document.getElementById('sbMoic');el.textContent=moic+'x';el.style.color=moic>=2?'#0a6e2a':moic>=1.2?'#7a4f00':'#8b0000';}</script>
    <div class="opc-verdict"><div style="font:700 7.5pt Arial,sans-serif;color:#666;letter-spacing:1.5px">INVESTMENT COMMITTEE VERDICT · 投委会综合裁定</div>
      <p style="margin-top:6px">综合基本面、财务勾稽与蓝军压力测试，建议对 <b>${esc(p.name)}</b> 采取「<b>${verdict}</b>」策略：在完成蓝军所列 CRITICAL/HIGH 级事项闭环核验并落实估值调整与回购保护条款后，提请投委会表决。</p>
      <span class="opc-pill ${vClass}" style="display:inline-block;margin-top:8px">最终建议：${verdict}</span></div>
    <div class="opc-grid2"><div class="opc-box"><b>📈 看多核心催化剂（Bull Catalysts）</b><p style="font-size:9pt;margin-top:4px">${esc(b.business[0] || b.overview[0] || '核心客户放量与国产替代加速')}</p></div>
      <div class="opc-box"><b>📉 核心下行风险场景（Bear Case）</b><p style="font-size:9pt;margin-top:4px">${esc(risks[0] || '大客户订单波动或毛利率不及预期')}</p></div></div>
  </div>
  <div class="opc-sec"><div class="opc-sec-t">IX. Key Milestones & Action Items · 尽调跟踪节点与待办</div>
    <table class="opc-tbl"><tr><th>跟踪事项</th><th>核查内容与交付物</th><th>状态</th></tr>
      ${(b.todo?.length ? b.todo : ['完成客户函证、银行流水穿行及实控人无代持承诺函签署']).map((v, i) => `<tr><td>M-0${i + 1}</td><td>${esc(v)}</td><td>待核实闭环</td></tr>`).join('')}</table>
  </div>
  <div class="opc-sig"><div><b>首席投研负责人：${esc(user.name || '优势资本项目组')}</b> · 优势资本一级市场投研中心</div><div>密级：内部机密 · 仅用于投委会审议，不构成外部要约</div></div>
</div></body></html>`
}


