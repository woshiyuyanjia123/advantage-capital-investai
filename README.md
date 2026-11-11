# NotebookLM × WorkBuddy 企业 FDE 项目管理工作台 (DSH 插件 & 双平台桌面版 v3.0)

本项目将 **Google NotebookLM（Gemini Notebook）的三栏源依据生产力范式** 与 **企业 FDE（Forward-Deployed Engineer）全流程投研/项目管理、四层权限治理及本地/离线 API 架构** 深度融合，提供 **DeepSeek Harness (DSH) 插件版**、**macOS / Windows 独立桌面安装包** 与 **本地/云端混合服务**。

---

## 一、两大基线仓库与开源项目借鉴对照（Architecture & Provenance）

本项目在架构演进中系统性吸收并重构了以下开源与内部基线项目的核心能力：

### 1. 借鉴自 `cheng241105-gif/ai-investment-management`
- **全生命周期项目治理与档案模型（Investment Dossier）**：吸收其从“项目线索 → 立项准备 → 立项会 → 尽调 → 投委会 → 协议交割 → 投后赋能 → 退出归档”的阶段门禁（Stage Gate）与 RACI 责任编排思想。
- **视觉高度估算 PPT 自动分页引擎（`desktop-v2.4.1`）**：合入其 `core/office.mjs` 中基于汉字/英文字符视觉宽度的行高计算与长表格跨页表头重复算法，彻底解决长报告转 PPT 时只保留前 12 行或文字溢出页面的问题。
- **桌面单机模式权限体验优化**：吸取其 2.4.1 修复经验，在桌面/插件单机模式下允许当前操作人直接配置与测试本地/外部模型 API，无需切回系统管理员账号。

### 2. 借鉴自 `evanzhu0105-ship-it/InvestAI-Desktop` 及 `PR #1 (5ab645c)`
- **零构建 ES Module + SQLite 全历史快照共核架构**：沿用其高内聚的 `core/`（SQLite 版本库、四层权限 `org.mjs`、成果版本生命周期 `lifecycle.mjs`、会议转写 `meetings.mjs`）与 `lib/`（DSH Cordis 插件宿主桥接）。
- **PR #1 (`fix/deepseek-integration`) DeepSeek 协议与稳定性修复**：
  - 默认模型 ID 规范化为官方 `deepseek-flash`（自动将旧配置中的 `deepseek-v4.1-flash` / `deepseek-chat` 映射为有效 ID）；
  - 按任务类型显式控制 `thinking` 与 `reasoning_effort`（大纲规划关闭思考防截断，长文起草开启 `high` 并将 `max_tokens` 提升至 `32000`）；
  - 带工具调用的多轮对话强制回传 `reasoning_content`，并将近期对话作为背景文本传入，避免拒绝指令后引发后续轮次 HTTP 400；
  - 区分永久配置错误（401/402/404）与暂时性网络/限流错误（429/5xx），避免单次超时导致模型被连带离线 5 分钟。

### 3. 借鉴并嵌入的第三方开源工作流项目
- **`likaku/Mck-ppt-design-skill`（Apache-2.0，已嵌入 `vendor/mck-ppt-design-skill`）**：借鉴其麦肯锡咨询级 Action Title（结论先行标题）、封面三大核心指标卡、三栏金字塔执行摘要、底栏来源溯源规范，并结合 `core/nb-ppt-pro.mjs` 的 1280×720 多图层高清渐变几何纹理画布，使生成的每一份 `.pptx` 兼具专业审美与 **≥ 3.2 MB** 的印刷级图文品质。
- **`dataelement/dsh-desktop` & `zarazhangrui/beautiful-html-templates`（MIT）**：对齐 DSH Desktop 插件装载契约（`cordis.patch.yml` + `@deepseek-ai/dsh-client-ui-*` 槽位注入）。

---

## 二、原创三界面产品架构（NotebookLM × 企业 FDE 全流程闭环）

1. **第一界面：`① 项目书架 (图2风格)` (`app/views/nb-shelf.js`)**
   - 顶部展示 **5 大精选行业智库与方法论笔记本**（PE/VC 硬科技尽调、产业基金资本招商、审计 vs BP 冲突核验、投委会 IC 范式、投后退出控制）；
   - 下方展示 **最近打开过的项目笔记本网格**：轻点任意项目卡片即原位展开 **全流程总进度百分比（`overallPct%`）+ 阶段准入进度百分比（`curStagePct%`）**，右侧紧邻 **插件提交通道** 与 **打开项目专属文件夹** 入口。
2. **第二界面：`② Notebook 制作台 (图1风格)` (`app/views/nb-workspace.js`)**
   - **左栏（来源勾选 + 左下角项目专属文件夹产出池）**：支持 `+ 添加来源`、`+ 创建笔记` 与复选框精准挑选资料（`S.ctx.fileIds`）；彻底移除繁琐的“导出/下载”按钮，每个项目自动生成配套专属文件夹（`项目专属文件夹/<项目名>_<ID>/`），所有生成的成品自动落盘并实时陈列在左下角；
   - **中栏（带角标源依据问答 + 3 张智能追问卡片）**：每次问答后自动给出 3 张针对当前阶段与已勾选资料的「下一步适合怎么办」追问卡片，底部实时显示 `N 个来源`；
   - **右栏（Studio 9 宫格 + 笔记五维看板）**：严格基于左栏勾选资料定向制作 **演示文稿 PPT、深度报告 Word、音频概览、视频概览、思维导图、闪卡、测验、信息图、数据表格 XLSX**，并提供本地逐页 PPT / Word / 录音转文字修改工坊。
3. **第三界面：`③ 流程提交与权限看板` (`app/views/nb-flow-board.js` + `core/nb-flow-board.mjs`)**
   - **优于传统企业 OA 的槽位式协同**：左栏直接选用图1左下角专属夹中的任意成品，支持 **零修改原件直交** 或 **人工轻微修改后自主提交** 到任意流程节点；
   - **中栏完整企业项目阶段流水线**：可视化全部阶段、必做成果、责任人与定稿人，支持一键入槽、送审、定稿；
   - **右栏四层权限实时矩阵与岗位胶囊切换器**：实时透视数据范围、密级上限、业务操作权、敏感字段脱敏状态，支持一键切换岗位视角并完成阶段门禁表决。

---

## 三、macOS 与 Windows 双平台完整区分与安装构建指南

| 维度 | macOS (Apple Silicon `arm64` / Intel `x64`) | Windows 10 / 11 (`x64`) |
|---|---|---|
| **独立桌面安装包** | `DSH-NotebookLM-FDE-Setup-3.0.0-mac-arm64.dmg` / `mac-x64.dmg` | `DSH-NotebookLM-FDE-Setup-3.0.0-win-x64.exe` (NSIS 安装程序) |
| **DSH 插件一键安装脚本** | `sh scripts/install-mac.sh` | `powershell -ExecutionPolicy Bypass -File scripts\install-win.ps1` |
| **本地录音转写引擎安装** | `sh scripts/setup-asr.sh` (`bin/python`) | `powershell -ExecutionPolicy Bypass -File scripts\setup-asr.ps1` (`Scripts\python.exe`) |
| **本机 Office 检出唤起方式** | `open <工作副本路径>`（调用 macOS Microsoft Office / WPS / Keynote） | `explorer.exe <工作副本路径>`（调用 Windows Office / WPS，防路径空格转义） |
| **应用数据与项目专属夹默认路径** | Standalone: `~/Library/Application Support/dsh-notebooklm-fde`<br>DSH 插件: `~/.dsh/investai/workspace/项目专属文件夹/` | Standalone: `%APPDATA%\dsh-notebooklm-fde`<br>DSH 插件: `%USERPROFILE%\.dsh\investai\workspace\项目专属文件夹\` |
| **桌面打包命令** | `cd desktop && npm run dist:mac` | `cd desktop && npm run dist:win` |

### 1. macOS 端快速安装与运行
```bash
# 方式 A：安装到 macOS 的 DeepSeek Harness (DSH Desktop / Web)
sh scripts/install-mac.sh

# 方式 B：源码直接启动本地桌面模式
npm install
npm run desktop

# 方式 C：在 macOS 上打包 DMG 安装包
cd desktop && npm install && npm run dist:mac
```
> **macOS 首次打开提示**：若遇到 Gatekeeper 提示“无法验证开发者”，请在终端执行 `xattr -cr "/Applications/DSH NotebookLM FDE.app"` 后打开。

### 2. Windows 端快速安装与运行
```powershell
# 方式 A：一键挂载到 Windows 的 DeepSeek Harness (desktop & web profiles)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-win.ps1

# 方式 B：源码直接启动本地桌面模式
npm install
npm run desktop

# 方式 C：在 Windows 上打包 NSIS .exe 安装程序
cd desktop
npm install
npm run dist:win
```

### 3. 断网本地 API 与云端 API 连接
- 点击界面顶部胶囊 **「API 连接」**：
  - **断网本地模式**：选择「仅本地离线 API」，支持自动探测本机 `http://127.0.0.1:11434/v1` (Ollama)、`http://127.0.0.1:1234/v1` (LM Studio)、`http://127.0.0.1:8000/v1` (vLLM)，无本地模型时自动使用内置离线规则摘录引擎；
  - **云端 / DSH 模式**：支持复用 DSH 宿主模型或填写 `deepseek-flash` / `deepseek-v4-pro` 及任意 OpenAI 兼容接口密钥。

---

## 四、项目完整目录架构

```text
dsh-notebooklm-fde/
├── core/
│   ├── nb-api.mjs          # 本地离线 API (Ollama/LM Studio/vLLM) 探测与云端/DSH 混合路由
│   ├── nb-flow.mjs         # 全流程进度百分比计算与项目笔记管理
│   ├── nb-folder.mjs       # 每项目专属文件夹自动生成与成品落盘索引（无导出按钮设计）
│   ├── nb-ground.mjs       # 底稿整理（句子、表格、名称-数值对）与成品数字核对
│   ├── nb-author.mjs       # 模型撰稿：通读底稿定提纲，再分批撰写
│   ├── nb-deck.mjs         # 演示文稿：内容块自由组合的页面、离线摘编、pptx 渲染
│   ├── nb-interactive.mjs  # 导图、闪卡、测验、对谈稿、讲解分镜、一页速览
│   ├── nb-studio-gen.mjs   # Studio 9 宫格按勾选资料定向制作器 + 3 张智能追问建议生成
│   ├── nb-studio.mjs       # 左上 PPT/Word/录音转文字工坊与插件提交通道
│   ├── nb-flow-board.mjs   # 第三界面：左下角成品直交/微调自主提交与四层权限矩阵后端
│   ├── llm.mjs             # DeepSeek (deepseek-flash) 与 OpenAI 兼容协议适配（含 PR #1 修复）
│   ├── office.mjs          # Word/PPT/Excel 渲染与视觉高度估算自动分页引擎
│   ├── deliverables.mjs    # 成果版本控制与跨平台（macOS open / Windows explorer）本地检出
│   ├── org.mjs             # 企业四层权限（功能/数据范围/业务操作/敏感字段与密级）
│   └── workflow.mjs        # 7 大业务类型可配置阶段与门禁表决引擎
├── app/
│   ├── notebook.css        # 图2项目书架 + 图1三栏工作台 + 第三界面流程权限看板样式
│   └── views/
│       ├── nb-shelf.js         # 第一界面：图2精选智库横幅 + 最近项目笔记本（进度% + 插件提交）
│       ├── nb-workspace.js     # 第二界面：图1左栏勾选与左下角专属夹 + 中栏追问 + 右栏 Studio
│       ├── nb-flow-board.js    # 第三界面：左下角成品直交/微调自主提交 + 全流程四层权限看板
│       ├── nb-studio-ppt.js    # 本地 PPT 逐页可视化修改与本机 Office 检出工坊
│       ├── nb-studio-word.js   # 本地 Word 章节修改与模板填充工坊
│       └── nb-studio-audio.js  # 本地麦克风录音/离线 Whisper 转写与逐句校对工坊
├── vendor/
│   └── mck-ppt-design-skill/   # 嵌入的开源麦肯锡 62 种咨询版式工作流
├── desktop/                    # Electron 跨平台独立桌面壳（支持 macOS DMG 与 Windows NSIS EXE）
└── scripts/
    ├── install-mac.sh          # macOS 专属 DSH 插件挂载与卸载脚本
    ├── install-win.ps1         # Windows 专属 DSH 插件挂载与卸载脚本
    ├── setup-asr.sh            # macOS / Linux 本地 faster-whisper 转写环境部署
    └── setup-asr.ps1           # Windows 本地 faster-whisper 转写环境部署
```

