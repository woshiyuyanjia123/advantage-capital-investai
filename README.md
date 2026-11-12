# 优势资本 · 智能投研工作台

给一级市场投资机构用的项目管理软件：把一个项目的底稿放进来，就底稿提问，生成演示文稿、尽调报告、投委会备忘录、数据表，再把成品报送到阶段门禁里走审核。可以装成桌面应用（macOS、Windows），也可以作为 DeepSeek Harness（DSH）的插件运行。

当前版本 3.2.0。

## 安装

到仓库的 [Releases](https://github.com/woshiyuyanjia123/dsh-notebooklm-fde/releases) 页下载：

| 系统 | 文件 |
|---|---|
| macOS，Apple 芯片 | `InvestAI-3.2.0-mac-arm64.dmg` |
| macOS，Intel | `InvestAI-3.2.0-mac-x64.dmg` |
| Windows 10 / 11 | `InvestAI-3.2.0-win-x64.exe` |

安装包没有代码签名。macOS 第一次打开要在“应用程序”里右键点“打开”；Windows 弹出 SmartScreen 时点“更多信息”，再点“仍要运行”。

以前装过 InvestAI 的机器直接装新版，会覆盖旧程序，数据保留。数据在 macOS 的 `~/Library/Application Support/InvestAI`、Windows 的 `%APPDATA%\InvestAI`。

装好后从开始菜单或桌面的“优势资本 智能投研”打开。首次打开带三个示例项目，可以直接点着看。

## 连接模型

右上角“设置与帮助”里点“模型连接”。三种接法：

- DeepSeek：填 API Key。
- 其他兼容 OpenAI 接口的服务：填接口地址、模型名、API Key。
- 本机模型（Ollama、LM Studio 等）：填本机地址和模型名，底稿不出本机。

没有连接模型时软件照常能用：成品只摘编底稿原文，并在成品上标“底稿摘编”。

密级规则：底稿默认是机密级。机构设置里可以规定某个密级以上的底稿只能交给本机模型。在桌面版的连接窗口里选了云端模型，等于同意把底稿正文发给这个模型。

## 三个界面

- 项目总览：所有项目、各自的阶段和进度。
- 研判工作台：左边是底稿，中间就勾选的底稿提问（回答带来源编号），右边生成成品。
- 阶段门禁：每个阶段要交哪些工作成果、谁审、现在卡在哪。成品从工作台报送到这里。

## 成品是怎么写出来的

1. 整理底稿：把勾选的底稿拆成带编号的句子、表格和“名称：数值”条目。
2. 撰写：连了模型时，模型先通读底稿定提纲，再分批写正文；演示文稿每页用什么形式（表格、图表、要点、对比）由模型按内容决定。没有模型时只摘编底稿原文。
3. 核对：成品里出现的每个数字都和底稿对一遍。底稿里有的算一致，写明“测算”并给出算式的算测算，其余的列出来，在成品行上标“N 处数字待核对”。

成品上会写明是哪个模型写的，或者为什么没有调用模型。

## 成套制作

工作台右上角的“成套制作”一次生成几份材料。分两步：

1. 出方案。读底稿，说明底稿能回答什么、缺什么、每份材料侧重什么。看过、改过要求之后再执行。
2. 执行。按顺序生成每份材料，逐份质检（文件能打开、数字和底稿对得上），可以选择把合格的成品报送到当前阶段。

思考深度有三档：快速（不做模型规划）、标准（模型出方案）、深入（再加一轮交叉核对，找出不同底稿对同一指标说法不一致的地方；成品里有对不上的数字时让模型重写一次）。

DSH 会话和内置智能体也能调用这两步，工具名是 `investai_harness_plan` 和 `investai_harness_produce`。

## 其他功能

- 模板：一个模板是一种成品加一段编制要求，要求可以改了再生成。每人每月的调用次数从 0 开始按实际执行累计。
- 天眼查工商核查：填机构自己的开放平台 Token，查询工商基本信息并存为底稿。目前只接了这一个接口，司法、担保等维度没有接入。没填 Token 不会生成任何内容。
- 成品预览：点成品行在应用里看文字内容，也可以用本机的 Office 或 WPS 打开修改。
- 会议录音转写：需要先装本地转写引擎，见 `scripts/setup-asr.sh`、`scripts/setup-asr.ps1`。

## 从源码运行

需要 Node.js 22.13 以上。

```bash
npm install
npm run desktop
```

然后打开 http://127.0.0.1:4310 。多人登录模式用 `node server.mjs --demo-accounts`，演示账号在 `docs/accounts/` 下的 Excel 里。

作为 DSH 插件安装：macOS 运行 `sh scripts/install-mac.sh`，Windows 运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-win.ps1`。

打桌面安装包：

```bash
cd desktop
npm install
npm run dist:win
```

macOS 用 `npm run dist:mac`。推送 `v` 开头的标签时，GitHub Actions 会跑测试、打两个平台的安装包并挂到同名 Release 上。

## 测试

```bash
npm test
```

模型相关的测试用测试文件里起的本机假模型，不需要 API Key，也不会联网。

## 代码结构

| 目录 | 内容 |
|---|---|
| `app/` | 界面，原生 ES 模块，不需要构建 |
| `core/` | 后端：数据、权限、流程、成果编制 |
| `lib/` | DSH 插件入口 |
| `desktop/` | Electron 桌面版外壳和打包配置 |
| `test/` | 测试 |

成果编制相关的文件：`core/nb-ground.mjs`（整理底稿、核对数字）、`core/nb-author.mjs`（模型撰稿）、`core/nb-deck.mjs`（演示文稿）、`core/nb-interactive.mjs`（导图、闪卡等）、`core/nb-studio-gen.mjs`（入口）、`core/nb-harness.mjs`（成套制作）、`core/nb-agent-mesh.mjs`（交叉核对）。

## 已知的限制

- 底稿分级（A、B、C）只按文件名推定，不代表内容已经核实。
- 生成的 pptx 和 docx 在 WPS、PowerPoint、Keynote 里的字体回退没有逐一核对过。
- 应用里的成品预览只显示文字，版式要用本机程序打开看。
