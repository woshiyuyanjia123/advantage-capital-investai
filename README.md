# 优势资本 · 智能投研工作台（AC Investment SaaS · Agentic Harness & DSH 插件版 v4.0）

本项目是面向一级市场股权投资机构的 **生产级智能投研与全周期流程治理系统**，提供 **Agentic Harness 插件版**、**macOS / Windows 独立桌面安装包** 与 **本地/机构私有模型混合服务**。系统内置 **Harness 受控思考与操作编排引擎（`core/nb-harness.mjs`）**、**Agent × Agent 三侧实时并发互校（`core/nb-agent-mesh.mjs`）** 与 **原文逐数字溯源核验（`core/nb-ground.mjs`）**，通过操作能力可控地调用全套 9 大类投研材料制作管线并闭环报送阶段门禁。

---

## 一、核心工程演进与多仓库架构融合（Architecture & Provenance）

1. **全生命周期门禁治理（借鉴 `cheng241105-gif/ai-investment-management`）**
   - 覆盖“项目线索 → 立项准备 → 立项会 → 尽职调查 → 投资决策（IC）→ 协议交割 → 投后赋能 → 退出归档” 8 大阶段门禁（Stage Gate）与 15 岗位四层权限矩阵；
   - 基于中英字符视觉宽度的行高估算与长表跨页表头重复算法（`core/office.mjs`）。
2. **零构建 SQLite 快照共核与宿主协议适配（借鉴 `evanzhu0105-ship-it/InvestAI-Desktop`）**
   - `core/`（SQLite 全版本快照、四层权限 `org.mjs`、生命周期 `lifecycle.mjs`、会议转写 `meetings.mjs`）与 `lib/`（Cordis 插件宿主与 `@deepseek-ai/dsh-agent-adapter-core` 工具注册）；
   - 工具调用多轮思维链（`reasoning_content`）保真回传、流式 `finish_reason` 零挂起释放、永久配置错误与瞬时限流精准分流。
3. **企业级扩展与机构投研规范融合**
   - **`YFGaia/dify-plus` 企业配额与机构模板治理**（`core/nb-dify-plus.mjs`）：月度调用预算账本、密钥脱敏与高频机构工作流排序；
   - **`bdim404/tianyancha-dify-plugin` 商事司法穿透**（`core/nb-tianyancha.mjs`）：一键生成工商、股权、实控人、司法涉诉七维穿透底稿并自动评级为 **A级·强公信**；
   - **`garrettqmd/Multimodal-AI-Work-Assistant` 多模态语音四路路由**（`core/nb-voice-router.mjs`）：本地离线语音转写并自动分流至问答、尽调纪要、风险标记或材料编制；
   - **`D-kart/investor-skill` 九章券商级 IC 备忘录**（`core/nb-equity-memo.mjs`）：零主观打星、内嵌跨源矛盾对质表与动态估值/MOIC 敏感性滑块沙盘。

---

## 二、Agentic Harness：可控思考与操作调用制作引擎（`core/nb-harness.mjs`）

系统将 **Harness 的操作编排能力** 与 **Studio 9 大类投研材料编译能力** 深度贯通，告别黑盒一次性盲写：

1. **三档可控思考深度（Controllable Thinking）**
   - `fast`（快速直出）：轻量底稿盘点后直接调度编译器；
   - `balanced`（均衡校验）：两阶段思考规划 + 原文数字核对；
   - `deep`（五步深度反思 + 红蓝军互校 + 自愈重编）：先盘点 **A/B/C 证据信用等级** → 预判 BP 与审计/合同跨源矛盾 → 定制每件材料的专属指令与规格 → 顺序调度制作 → 二进制/XML 解压质检（不达标自动触发修正重编）。
2. **先审批蓝图、可微调编辑、再受控执行**
   - 支持 **「① 生成可控思考蓝图」**：向操作人透明展示思考链（`thinkingTrace`）、证据缺口（`gaps`）与每件材料的制作指令、页数与目标体积，允许人工在线增删调整后再点击执行；
   - 支持 **「⚡ 一键思考并制作全套材料」**：内置 **投决会全套（IC 备忘录 + 路演 PPT + 深度尽调 Word + 财务对质台账 XLSX）**、**立项会标准包**、**尽调穿透核验包** 三套机构预设，自动携带天眼查穿透并在质检通过后一键报送当前阶段对应工作项。
3. **三端操作能力全开放**
   - **宿主会话工具（`core/tools.mjs`）**：向外部 Harness 会话注册 `investai_harness_plan`、`investai_harness_execute`、`investai_studio_make`、`investai_tianyancha_enrich` 等操作工具；
   - **内置智能体（`core/agent.mjs`）**：在授权级别下可直接调用 `harness_plan`、`harness_execute`、`studio_make` 完成成套材料交付；
   - **工作台可视化操控舱（`app/views/nb-workspace.js`）**：右栏内置 **「🧠 Harness 可控思考制作舱」**，实时追踪每一步操作状态与质检结果。

---

## 三、三界面一级市场机构产品架构

1. **第一界面：`投研项目总览`（`app/views/nb-shelf.js`）**
   - 顶部陈列 5 大优势资本方法论智库；下方展示在管项目组合网格，展开全周期总进度（`overallPct%`）、当前阶段完成度、快速报送通道与项目专属档案室。
2. **第二界面：`尽调与研判工作台`（`app/views/nb-workspace.js`）**
   - **左栏（纯净底稿池 + A/B/C 证据信用徽章）**：严格隔离原始底稿与生成产物，支持上传底稿、天眼查穿透与访谈纪要；
   - **中栏（底稿溯源深度研判 + 红蓝军跨源矛盾对质雷达）**：实时流式带 `[n]` 角标问答，附带 3 张阶段化追问建议卡；
   - **右栏（Harness 可控思考制作舱 + 9 宫格成果中心 + 右下角已编制成果直览）**：支持双轨高审美 PPT（麦肯锡咨询 6 版式 + 深蓝科技网格发布会 5 版式，单份 `≥ 3MB`）、九章 IC 备忘录、深度尽调 Word、5-Sheet 财务对质台账 XLSX 等 9 类成果；所有成果自动落盘项目档案室并陈列于右下角，支持 **0.1s 应用内全格式解压直览**、原文逐数字核对签章与一键报送阶段复核。
3. **第三界面：`阶段门禁与投决中心`（`app/views/nb-flow-board.js` + `core/nb-flow-board.mjs`）**
   - 左栏选用已编制成果（精准映射对应 `workType` 工作项，不重复冗余建版）直交或微调报送；中栏管控 8 大阶段门禁与定稿；右栏支持 15 岗位视角切换、四层权限透视与投决表决。
   - 顶栏支持 **深色 / 浅色双主题一键切换** 与沉浸式 **⚙️ 设置与帮助** 菜单。

---

## 四、macOS 与 Windows 双平台安装与构建指南

| 维度 | macOS (`arm64` / `x64`) | Windows 10 / 11 (`x64`) |
|---|---|---|
| **Harness 插件一键挂载** | `sh scripts/install-mac.sh` | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-win.ps1` |
| **源码启动独立桌面端** | `npm install && npm run desktop` | `npm install && npm run desktop` |
| **打包独立桌面安装程序** | `cd desktop && npm install && npm run dist:mac` | `cd desktop && npm install && npm run dist:win` |
| **本地离线语音引擎配置** | `sh scripts/setup-asr.sh` | `powershell -ExecutionPolicy Bypass -File .\scripts\setup-asr.ps1` |

### 自动化验收测试套件（27 项全链路测试）
```bash
npm test
node --test test/dsh.test.mjs test/lifecycle.test.mjs test/llm.test.mjs test/notebook.test.mjs test/studio-quality.test.mjs test/harness.test.mjs test/saas-e2e.test.mjs
```
