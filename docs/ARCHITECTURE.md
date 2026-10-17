# 架构（2.0）

```
┌ 前端 app/（零构建 ES 模块）────────────────────────────────────────────┐
│ app.js 外壳·路由·AI 面板 │ views/work.js 工作台/项目/任务/会议 │ views/project.js 项目详情·成果·表决·提取 │
│ views/data.js 提取中心/公司库/研究/资料/模板 │ views/admin.js 系统配置 │ fill.html 外部填报页     │
└──────────────── GET/POST /api/investai?op=… （同一套接口，服务端逐项校验权限）────────────────┘
┌ core/ ────────────────────────────────────────────────────────────────────────────────────┐
│ api.mjs     接口、会话、CSRF、视图裁剪（敏感字段脱敏）                                       │
│ org.mjs     四层权限：功能 / 数据范围 / 业务操作 / 敏感字段与密级；AI 参与级别；文本脱敏      │
│ workflow.mjs 流程定义（7 类业务）、阶段准入、决策节点（表决规则、回避、结果去向）、暂停/终止/退回 │
│ deliverables.mjs 成果与版本：真实 docx/pptx/xlsx、Office 工作副本、提交/定稿/撤回/恢复      │
│ ai.mjs      模型路由（外部/本地/混合/离线）、资料汇集、规划→起草两段式、引用核对、AI 预审   │
│ agent.mjs   智能体工具（按 AI 级别开放，无决策类工具）+ 可选 toolknit MCP 连接器           │
│ extract.mjs BP→项目信息表、财报→财务分析表、尽调→问题清单；来源页码、缺失、冲突、优先级    │
│ meetings.mjs + asr_worker.py 本机 faster-whisper 转写、术语校正、纪要与待办               │
│ fill.mjs 外部填报链接 │ sso.mjs OAuth2+PKCE │ notify.mjs 通知/推送/定时 │ market.mjs 行情公告 │
│ kb.mjs 资料库（挂载、索引、密级规则）│ office.mjs 渲染与解析 │ wisburg.mjs 智堡 │ llm.mjs 模型适配 │
│ db.mjs SQLite（node:sqlite，WAL）：docs + history（每次变更的前后快照，可回滚）             │
└────────────────────────────────────────────────────────────────────────────────────────────┘
宿主：lib/index.mjs（DSH 插件：fetch 路由 + 会话工具 + ctx.llm）· lib/client.js（主题、侧栏、常驻 iframe）· server.mjs（SaaS / 本机演示）
```

## 关键设计

**流程是数据，不是代码。** `workflows` 集合保存结构化定义（阶段、工作、决策节点、结果去向），项目绑定具体版本。发布新版本只影响新建项目。所有状态变化都经过 `workflow.mjs` 并写入历史。

**权限在服务端判定一次，AI 复用同一套。** `org.can/canOp/seesProject/canField/canLevel` 被接口层、资料库、提取、AI 汇集与智能体工具共同调用；AI 看到的资料就是该用户能看到的资料，敏感字段在进入模型前已脱敏。

**路由按密级，而不是按开关。** 每次 AI 调用先计算上下文最高密级，≥ 策略阈值（默认「机密」）只走本机模型；没有本机模型就用离线引擎（原文摘录 + 规则），保证不外发。外部模型调用失败会记录健康状态并自动回落。

**AI 只产出草稿。** 起草、提取、纪要都生成「待人工确认」的版本或记录；定稿、表决、推进阶段、入库确认需要对应的业务操作权限，且智能体没有这些工具。

**每个数字可追溯。** 起草时资料按编号 [n] 提供，生成后 `verifyCites` 把带引用的数字逐条与原文比对；提取结果保存原文片段与页码；公司库字段保存来源、确认人与时间。

**历史与回滚。** `db.put` 每次写入保存前后快照（history 表），任何项目、流程、设置、岗位都可以查看快照并回滚，回滚本身也是一条新记录。

## 外部依赖

| 依赖 | 用途 | 许可 |
|---|---|---|
| pdfjs-dist 4.10 | PDF 文字提取（含中文 CMap） | Apache-2.0 |
| exceljs 4.4 | Excel 读写 | MIT |
| pptxgenjs 3.12 | PPT 生成 | MIT |
| docx 9.5 | Word 生成 | MIT |
| faster-whisper 1.2 + small 模型（可选，独立 Python 环境） | 本机转写 | MIT |

Node 内置：`node:sqlite`、`node:crypto`、`node:zlib`（自研 zip 读写用于 docx 模板填充）。
