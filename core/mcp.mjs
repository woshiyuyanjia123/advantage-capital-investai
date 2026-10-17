// 最小 MCP stdio 客户端：用于可选的 toolknit 连接器（默认关闭）。
// toolknit-desktop 为 PolyForm Noncommercial 许可：本系统不打包其代码；由管理员自行安装、确认授权后启用。
import { spawn } from 'node:child_process'

export async function connectMcp(command, args = [], { env, timeoutMs = 20000 } = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  let buf = ''
  let seq = 0
  const pending = new Map()
  const fail = err => { for (const [, p] of pending) p.reject(err); pending.clear() }
  child.on('error', fail)
  child.on('exit', code => fail(new Error(`MCP 进程退出（${code}）`)))
  child.stdout.on('data', d => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      const p = msg.id !== undefined && pending.get(msg.id)
      if (!p) continue
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(msg.error.message ?? 'MCP 错误')) : p.resolve(msg.result)
    }
  })
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`MCP 请求超时：${method}`)) }, timeoutMs)
    pending.set(id, { resolve: v => { clearTimeout(t); resolve(v) }, reject: e => { clearTimeout(t); reject(e) } })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'investai-desktop', version: '2.0.0' } })
    notify('notifications/initialized', {})
    const { tools = [] } = await request('tools/list', {})
    return {
      server: init?.serverInfo ?? {},
      tools,
      call: async (name, args) => {
        const r = await request('tools/call', { name, arguments: args })
        return (r?.content ?? []).map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n') || JSON.stringify(r)
      },
      close: () => { try { child.kill() } catch { /* 已退出 */ } },
    }
  } catch (e) { child.kill(); throw e }
}
