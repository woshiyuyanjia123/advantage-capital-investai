// DSH 宿主兼容：DSH 把插件请求的地址改写为 http://dsh.internal/…，桌面版页面来自 dsh-app:// 协议。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './helpers.mjs'
const { crossSite } = await import('../core/api.mjs')

const post = (headers, url = 'http://dsh.internal/api/investai?op=task.add') => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' })

test('D1 DSH 改写请求地址后，同源写操作仍被接受（网页版与桌面版）', () => {
  assert.equal(crossSite(post({ origin: 'http://127.0.0.1:4620', host: '127.0.0.1:4620', 'sec-fetch-site': 'same-origin' })), false, 'dsh web')
  assert.equal(crossSite(post({ origin: 'dsh-app://dsh', 'sec-fetch-site': 'same-origin' })), false, 'dsh 桌面版')
  assert.equal(crossSite(post({ origin: 'http://127.0.0.1:4620', host: '127.0.0.1:4620' })), false, '没有 Sec-Fetch-Site 时按 Host 比较')
  assert.equal(crossSite(post({ origin: 'dsh-app://dsh' })), false, '桌面版：没有 Sec-Fetch-Site 时按 dsh-app 协议识别')
})

test('D2 真正的跨站写请求仍被拒绝', () => {
  assert.equal(crossSite(post({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })), true)
  assert.equal(crossSite(post({ origin: 'https://evil.example', host: '127.0.0.1:4620' })), true)
  assert.equal(crossSite(post({ origin: 'null' })), true)
  assert.equal(crossSite(post({ origin: 'http://127.0.0.1:9999', 'sec-fetch-site': 'same-site' })), true, '同站不同源也拒绝')
})

test('D3 以 DSH 的方式转发请求，写接口可用', async () => {
  const t = await boot()
  try {
    const r = await t.core.handle(post({ origin: 'http://127.0.0.1:4620', host: '127.0.0.1:4620', 'sec-fetch-site': 'same-origin' }, 'http://dsh.internal/api/investai?op=notification.read'))
    assert.equal(r.status, 200, await r.clone().text())
  } finally { await t.close() }
})

test('D4 插件数据跟随 DSH_HOME；经 DSH 注册的路由可读写', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = await mkdtemp(join(tmpdir(), 'investai-dshhome-'))
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const disposers = []
  let route = null
  const ctx = {
    inject: () => {},
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d) },
    connection: { fetch: { register: r => { route = r; return () => { route = null } } } },
  }
  try {
    const plugin = await import('../lib/index.mjs')
    plugin.apply(ctx)
    assert.equal(route.path, '/api/investai')
    const get = await route.fetch(new Request('http://dsh.internal/api/investai?op=state'))
    assert.equal(get.status, 200)
    assert.equal((await get.json()).mode, 'dsh')
    const post = await route.fetch(new Request('http://dsh.internal/api/investai?op=notification.read', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'dsh-app://dsh', 'sec-fetch-site': 'same-origin' }, body: '{}' }))
    assert.equal(post.status, 200)
    assert.ok(existsSync(join(home, 'investai', 'investai.sqlite')), '数据写在 DSH_HOME/investai')
  } finally {
    for (const d of disposers.reverse()) await d()
    if (prev === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = prev
  }
})
