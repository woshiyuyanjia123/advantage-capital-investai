// 最小 Chrome DevTools 协议客户端：启动无头 Chrome，执行脚本、点击、截屏录制（Node ≥ 22 自带 WebSocket）。
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export async function launch({ width = 1920, height = 1080, port = 9333 } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'investai-chrome-'))
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--lang=zh-CN', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  let targets
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break } catch { /* 启动中 */ } await new Promise(r => setTimeout(r, 250)) }
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  const listeners = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    else if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn) }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
  const goto = async url => {
    await send('Page.navigate', { url })
    for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 150)); if (await evaluate('document.readyState').catch(() => '') === 'complete') return }
  }
  return { send, on, evaluate, goto, close: () => { try { ws.close() } catch {} proc.kill() } }
}
