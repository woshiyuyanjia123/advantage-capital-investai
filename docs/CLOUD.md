# 云服务器部署、权限管理与信息同步

本机桌面应用和云服务器运行的是同一套程序（`core/`），区别只在启动方式：云服务器用多人登录模式（`node server.mjs`），每个人用自己的账号登录，权限按岗位分四层（功能、数据范围、业务操作、敏感信息），全部在服务端判定。

## 1. 部署

### Docker（推荐）

```bash
cp .env.example .env              # 填写 DEEPSEEK_API_KEY 等
docker compose up -d --build      # 数据在 ./data（SQLite + 资料文件），密钥在 ./secrets
docker compose exec investai cat /data/initial-credentials.txt   # 首次启动生成的账号与随机初始密码
```

### 直接运行（Node ≥ 22.13）

```bash
npm install --omit=dev
HOST=127.0.0.1 PORT=4310 INVESTAI_DATA=/srv/investai/data INVESTAI_SECRETS=/srv/investai/secrets.json \
  INVESTAI_TRUST_PROXY=1 node server.mjs
```

### HTTPS 反向代理（必须）

服务本身只讲 HTTP，对外必须经 HTTPS 反向代理，服务只监听本机或内网地址。Caddy 示例（自动申请证书）：

```
invest.example.com {
  reverse_proxy 127.0.0.1:4310
}
```

Nginx 需转发 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto`。经 HTTPS 访问时登录 Cookie 自动加 `Secure`。

| 环境变量 | 作用 |
|---|---|
| `HOST` / `PORT` | 监听地址与端口（默认 127.0.0.1:4310；Docker 内为 0.0.0.0） |
| `INVESTAI_DATA` | 数据目录（SQLite、资料、成果文件、`initial-credentials.txt`） |
| `INVESTAI_SECRETS` | 密钥文件（DeepSeek、智堡、推送、统一登录、设备令牌），权限 600，不进数据库 |
| `INVESTAI_TRUST_PROXY=1` | 部署在反向代理后设置：从 `X-Forwarded-For` 取真实来源地址（登录锁定与审计用）。没有代理时不要设置，否则来源地址可被伪造 |
| `DEEPSEEK_API_KEY` | 外部模型；也可在「系统配置 → AI 策略与模型」中填写 |
| `INVESTAI_DEMO_ACCOUNTS=1` | 使用公开的演示密码（仅演示环境；正式部署**不要**设置） |

单个服务进程独占数据库文件，不要让多台服务器共享同一个数据目录；多地办公通过同一个云端服务访问，或用下文的信息同步。

## 2. 权限管理（云服务器上生效）

| 能力 | 说明 | 配置位置 |
|---|---|---|
| 四层权限 | 功能 / 数据范围 / 业务操作 / 敏感字段与资料密级，AI 继承当前用户权限 | 系统配置 → 岗位权限、组织与人员 |
| 初始密码 | 每个账号随机生成，写入 `initial-credentials.txt`（600）；**首次登录必须改成自己的密码**，改密前只能查看状态、改密码、退出 | 系统配置 → 云端与安全 |
| 管理员重置密码 | 对方原有登录立即失效，下次登录须修改 | 组织与人员 → 编辑人员 |
| 会话 | 存在服务端数据库（只存哈希），重启不掉线；闲置超时（默认 120 分钟）与最长有效期（默认 12 小时） | 云端与安全 |
| 登录保护 | 同一账号 + 来源地址连续输错（默认 5 次）锁定（默认 15 分钟）；失败与成功都记入审计 | 云端与安全 |
| 在线会话 | 管理员查看谁在线（来源地址、浏览器、最近活动）并可强制退出 | 云端与安全 |
| 统一登录 | OAuth2 + PKCE 对接企业身份系统 | 系统配置 → 集成 |
| 审计 | 所有数据变更可追溯、可回滚；登录、下载、导出、密钥变更另记安全事件 | 审计与回滚 |

新增权限项 `sync.manage`（管理云端同步与设备令牌），默认只给系统管理员。演示账号与各岗位权限对照见 [accounts/InvestAI-演示账号与权限.xlsx](accounts/InvestAI-演示账号与权限.xlsx)。

## 3. 信息同步（预留）

用于：多个办公室的桌面应用、BI 报表、备份程序从云端服务器获取数据。设计原则：**同步出去的数据和这个人在界面上看到的完全一致**，不会因为走同步通道而多看到什么。

### 设备令牌

- 云端管理员在「系统配置 → 云端与安全 → 设备令牌」签发，选择**代表哪个人员**（令牌的数据权限等同此人）、权限范围与有效期（最长 730 天）。
- 令牌形如 `iai_` + 48 位十六进制，只显示一次；服务端只存 SHA-256 哈希。可随时吊销；人员停用后其令牌同时失效。
- 令牌**只能调用同步接口**，不能登录界面或调用其他业务接口。

### 接口（协议版本 1）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/investai?op=sync.status` | GET | 协议版本、同步角色、当前变更序号、令牌代表的人员 |
| `/api/investai?op=sync.pull&since=<序号>&limit=<1-1000>` | GET | 增量拉取。返回 `{ protocol, cursor, more, changes: [{ seq, coll, id, rev, doc } \| { seq, coll, id, removed: true }] }` |
| `/api/investai?op=sync.push` | POST | **预留**，当前返回 501 |

请求头：`Authorization: Bearer iai_…`。服务端须在「云端与安全 → 信息同步」把本机角色设为「作为云端服务器」，否则 `sync.pull` 返回 409。

拉取规则：

- 变更序号来自数据库的历史表（每次写入都有序号），客户端保存 `cursor`，下次从它继续；`more: true` 表示还有下一页。
- 同一记录只返回当前状态一次；`removed: true` 表示该记录已删除**或令牌所属人员已无权查看**（权限收回），客户端应删除本地副本。
- 可同步的集合：项目、公司库、成果（元数据，不含正文）、会议（不含逐字稿）、任务、决策表决、流程、业务类型、部门、人员（不含密码）、岗位权限（仅对有人员管理权限者）。密码哈希、会话、设备令牌、密钥、审计日志不同步。
- 项目与公司字段按令牌所属人员的敏感字段权限脱敏（与界面相同的投影 `core/projection.mjs`）。

```bash
curl -H "Authorization: Bearer $TOKEN" "https://invest.example.com/api/investai?op=sync.pull&since=0&limit=200"
```

### 客户端（预留）

本机「云端与安全 → 信息同步」可设为「作为客户端」，填写云端地址并保存设备令牌（存本机密钥文件），「测试连接」会验证地址与令牌。自动定时拉取、写回云端（`sync.push`，含冲突处理：以云端为准）留待云服务器上线后实现，接口与配置项已就位，见 [adr/0005-cloud-sync.md](adr/0005-cloud-sync.md)。

## 4. 上线检查清单

- [ ] 经 HTTPS 访问，服务只监听本机或内网地址；设置 `INVESTAI_TRUST_PROXY=1`
- [ ] 未设置 `INVESTAI_DEMO_ACCOUNTS`；`initial-credentials.txt` 分发后删除
- [ ] 按实际组织调整人员、部门与岗位权限；停用不用的演示账号
- [ ] 「云端与安全」中确认闲置超时、锁定策略、密码位数
- [ ] 定期备份数据目录（SQLite 为 WAL 模式，备份前用 `sqlite3 investai.sqlite ".backup backup.sqlite"` 或停服复制）
- [ ] 如需统一登录，在「集成」中配置并测试
