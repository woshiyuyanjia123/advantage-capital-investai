// HTTP 服务：命令行（server.mjs）与独立桌面版（desktop/）共用。
//   desktop：本机单用户（无登录、可切换演示身份），只监听 127.0.0.1
//   saas：多人登录；没有密码的账号会生成随机初始密码，写入数据目录 initial-credentials.txt（权限 600）
//         demoAccounts：改用 fixtures/demo-accounts.json 中的固定演示密码（与 docs/accounts 下的 Excel 一致），仅供演示
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCore } from './index.mjs'
import { openaiLlm, secretLlm, normalizeModel, DEFAULT_MODEL } from './llm.mjs'
import { createHybridCloudLlm, readDshLocalDeepSeekKey, readLocalCarbonConfig } from './nb-api.mjs'
import { readSecrets } from './notify.mjs'
import { hashPassword } from './api.mjs'

const LIMIT = 80 * 1024 * 1024
export const DEMO_ACCOUNTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'demo-accounts.json')

/** 启动服务，返回 { url, port, core, close }。port 传 0 表示由系统分配空闲端口（桌面版用，避免与其他程序冲突）。 */
export async function startServer({ dir, desktop = false, demoAccounts = false, host = '127.0.0.1', port = 4310, env = process.env, log = console.log } = {}) {
  const explicitURL = env.INVESTAI_LLM_BASE_URL
  const envKey = env.INVESTAI_LLM_API_KEY || env.DEEPSEEK_API_KEY || ''
  const dshKey = readDshLocalDeepSeekKey()
  const baseURL = explicitURL ?? 'https://api.deepseek.com'
  const isDs = /(^|\.)deepseek\.com(\/|$|:)/i.test(baseURL)
  const model = isDs ? normalizeModel(env.INVESTAI_LLM_MODEL ?? DEFAULT_MODEL) : (env.INVESTAI_LLM_MODEL ?? '')
  // 指定了自定义接口地址时按环境变量直连；否则优先使用 DeepSeek 官方 API（环境变量 > 界面保存的密钥 > 本机 DSH 密钥），均未配置时再用本机 Carbon 网关兜底
  let core = null
  const chosen = () => { const m = env.INVESTAI_LLM_MODEL ? '' : core?.db.get('settings', 'main')?.models?.external?.model; return /^deepseek-/.test(m ?? '') ? m : undefined }
  const baseCloud = explicitURL ? openaiLlm({ baseURL, apiKey: envKey || dshKey, model }) : secretLlm({ readSecrets, envKey, fallbackKey: dshKey, baseURL, model, getModel: chosen })
  const carbon = !explicitURL && !env.INVESTAI_LLM_MODEL ? readLocalCarbonConfig() : null
  const fallbackAdapter = carbon ? openaiLlm({ baseURL: carbon.baseURL, apiKey: carbon.apiKey, model: carbon.model }) : null
  const llm = createHybridCloudLlm({ dshAdapter: baseCloud, fallbackAdapter, readSecretsFn: readSecrets })(() => core?.db.get('settings', 'main'))
  core = await createCore({ dir, mode: desktop ? 'desktop' : 'saas', llm })

  if (!desktop) {
    // 只给还没有密码的账号设置；已有密码（包括用户自己改过的）一律不覆盖
    const demo = demoAccounts ? new Map(JSON.parse(await readFile(DEMO_ACCOUNTS, 'utf8')).accounts.map(a => [a.username, a.password])) : new Map()
    const lines = core.db.all('users').filter(u => !u.disabled && !u.pw).map(u => {
      const password = demo.get(u.username) ?? randomBytes(9).toString('base64url')
      // 随机生成的初始密码首次登录须修改；公开的演示密码不强制（多人轮流体验同一账号）
      const mustChange = !demo.has(u.username) && (core.db.get('settings', 'main')?.security?.forceChangeGenerated ?? true)
      core.db.putQuiet('users', { ...u, pw: hashPassword(password), mustChange })
      return `${u.username}\t${password}\t${u.name}（${u.title}）`
    })
    if (lines.length) {
      const file = join(dir, 'initial-credentials.txt')
      const prev = await readFile(file, 'utf8').catch(() => '')
      await writeFile(file, `${prev || '账号\t初始密码\t身份\n'}${prev ? `# ${new Date().toLocaleString('zh-CN')} 补充生成\n` : ''}${lines.join('\n')}\n`, { mode: 0o600 })
      log(`[investai] 已为 ${lines.length} 个账号生成初始密码，见 ${file}`)
    }
    if (demoAccounts) log('[investai] ⚠ 已启用演示账号（固定密码公开在仓库中），仅用于演示，不要用于正式部署')
  }

  const bindHost = desktop ? '127.0.0.1' : host
  const trustProxy = env.INVESTAI_TRUST_PROXY === '1'
  const send = (res, response) => response.arrayBuffer().then(buf => { res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(buf)) })
  const redirect = (res, location, headers = {}) => { res.writeHead(302, { location, ...headers }); res.end() }

  const server = createServer(async (req, res) => {
    try {
      const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host ?? `${bindHost}:${port}`}`
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
          return redirect(res, '/api/investai?asset=index.html', { 'set-cookie': core.handle.ssoSession(user, new Request(url)) })
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
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && k !== 'x-investai-client') headers.set(k, v)
      // 来源地址（登录锁定、审计用）：部署在反向代理后设置 INVESTAI_TRUST_PROXY=1，取 X-Forwarded-For 的第一个地址
      const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
      headers.set('x-investai-client', forwarded || req.socket.remoteAddress || '')
      await send(res, await core.handle(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) })))
    } catch (e) {
      console.error('[investai]', e)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, bindHost, resolve) })
  const actual = server.address().port
  const url = `http://${bindHost}:${actual}`
  const info = await core.ai.status().catch(() => null)
  log(`[investai] ${desktop ? '本机' : 'SaaS'} 已启动 ${url}  数据目录 ${dir}  模型 ${info?.ok ? info.label : '未配置（离线引擎）'}`)
  return {
    url, port: actual, core,
    async close() { await new Promise(r => server.close(() => r())); await core.close() },
  }
}
