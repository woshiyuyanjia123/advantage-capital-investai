#!/usr/bin/env node
// InvestAI 服务（Node ≥ 22.13，内置 SQLite）。与 DSH 插件、独立桌面版共用 core/ 与 app/。
//   node server.mjs --desktop           本机单用户（无登录），http://127.0.0.1:4310
//   node server.mjs                     多人登录（SaaS）；初始密码见数据目录 initial-credentials.txt
//   DEEPSEEK_API_KEY=... node server.mjs   外部模型使用 DeepSeek（也可在「系统配置 → AI 策略与模型」中填写）
// 路由：/ 前端 · /api/investai 接口 · /fill/<token> 外部填报页 · /sso/login、/sso/callback 统一登录
import { join, resolve } from 'node:path'
import { startServer } from './core/http.mjs'

// 命令行参数等价于环境变量：--desktop --data <目录> --port <端口>
const argv = process.argv.slice(2)
const arg = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined }
if (arg('desktop')) process.env.INVESTAI_MODE = 'desktop'
if (typeof arg('data') === 'string') process.env.INVESTAI_DATA = arg('data')
if (typeof arg('port') === 'string') process.env.PORT = arg('port')

const server = await startServer({
  dir: resolve(process.env.INVESTAI_DATA ?? join(process.cwd(), 'data')),
  desktop: process.env.INVESTAI_MODE === 'desktop',
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 4310),
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await server.close(); process.exit(0) })
