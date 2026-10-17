#!/usr/bin/env node
// InvestAI 独立 SaaS 服务（Node ≥ 22.5，内置 SQLite）。与 DSH 插件共用 core/ 与 app/。
//   node server.mjs                     默认 http://127.0.0.1:4310
//   DEEPSEEK_API_KEY=... node server.mjs                     外部模型使用 DeepSeek（默认 deepseek-v4.1-flash）
//   本地模型（Ollama 等）在「系统设置 → 模型与路由」中配置，仅允许本机回环地址。
// 路由：/ 前端 · /api/investai 接口 · /fill/<token> 外部填报页 · /sso/login、/sso/callback 统一登录
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createCore } from './core/index.mjs'
import { openaiLlm } from './core/llm.mjs'
import { hashPassword } from './core/api.mjs'

// 命令行参数等价于环境变量：--desktop --data <目录> --port <端口>
const argv = process.argv.slice(2)
const arg = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined }
if (arg('desktop')) process.env.INVESTAI_MODE = 'desktop'
if (typeof arg('data') === 'string') process.env.INVESTAI_DATA = arg('data')
if (typeof arg('port') === 'string') process.env.PORT = arg('port')
const dir = resolve(process.env.INVESTAI_DATA ?? join(process.cwd(), 'data'))
const apiKey = process.env.INVESTAI_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ''
const baseURL = process.env.INVESTAI_LLM_BASE_URL ?? (apiKey ? 'https://api.deepseek.com' : '')
const model = process.env.INVESTAI_LLM_MODEL ?? (baseURL.includes('deepseek') ? 'deepseek-v4.1-flash' : '')

// INVESTAI_MODE=desktop：本机单用户演示（无登录、可切换演示身份），强制只监听 127.0.0.1
const desktop = process.env.INVESTAI_MODE === 'desktop'
let credentials = null
const core = await createCore({
  dir, mode: desktop ? 'desktop' : 'saas', llm: apiKey || baseURL ? openaiLlm({ baseURL, apiKey, model }) : undefined,
  // 首次启动为演示账号生成随机密码，只写入本机文件（权限 600），不内置共享密码。
  onSeed(db) {
    if (desktop) return
    credentials = db.all('users').map(u => {
      const password = randomBytes(6).toString('base64url')
      db.putQuiet('users', { ...u, pw: hashPassword(password) })
      return `${u.username}\t${password}\t${u.name}（${u.title}）`
    })
  },
})
if (credentials) {
  const file = join(dir, 'initial-credentials.txt')
  await writeFile(file, `账号\t初始密码\t身份\n${credentials.join('\n')}\n`, { mode: 0o600 })
  console.log(`[investai] 已创建演示账号，初始密码见 ${file}`)
}

const host = desktop ? '127.0.0.1' : (process.env.HOST ?? '127.0.0.1')
const port = Number(process.env.PORT ?? 4310)
const LIMIT = 80 * 1024 * 1024

function send(res, response) {
  return response.arrayBuffer().then(buf => { res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(buf)) })
}
const redirect = (res, location, headers = {}) => { res.writeHead(302, { location, ...headers }); res.end() }

const server = createServer(async (req, res) => {
  try {
    const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host ?? `${host}:${port}`}`
    const url = new URL(req.url ?? '/', origin)
    if (url.pathname === '/') return redirect(res, '/api/investai?asset=index.html')
    const fillMatch = /^\/fill\/([A-Za-z0-9_-]{20,64})$/.exec(url.pathname)
    if (fillMatch) return redirect(res, `/api/investai?asset=fill.html#${fillMatch[1]}`)
    if (url.pathname === '/sso/login') {
      try { return redirect(res, core.sso.loginUrl(`${origin}/sso/callback`)) } catch (e) { res.writeHead(e.status ?? 500, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(e.message) }
    }
    if (url.pathname === '/sso/callback') {
      try {
        const user = await core.sso.callback(url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '')
        core.db.putQuiet('audit', { id: randomBytes(6).toString('hex'), at: Date.now(), user: user.name, action: '登录', target: '统一登录' })
        return redirect(res, '/api/investai?asset=index.html', { 'set-cookie': core.handle.ssoSession(user) })
      } catch (e) { res.writeHead(e.status ?? 500, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(`统一登录失败：${e.message}`) }
    }
    if (url.pathname !== '/api/investai') { res.writeHead(404); res.end('not found'); return }
    const chunks = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > LIMIT) { res.writeHead(413); res.end(); return }
      chunks.push(c)
    }
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    await send(res, await core.handle(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) })))
  } catch (e) {
    console.error('[investai]', e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})
server.listen(port, host, () => {
  const { port: p } = server.address()
  console.log(`[investai] ${desktop ? '本机演示' : 'SaaS'} 已启动 http://${host}:${p}  数据目录 ${dir}  外部模型 ${model ? `${baseURL} · ${model}` : '未配置（离线引擎 / 可配置本地模型）'}`)
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await core.close(); process.exit(0) })
