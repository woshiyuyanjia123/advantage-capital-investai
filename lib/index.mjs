// DSH 宿主侧插件：注册 /api/investai 路由，支持 DSH 宿主模型 + 本地离线 API + 云端自定义 API
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createCore } from '../core/index.mjs'
import { dshLlm } from '../core/ai.mjs'
import { createHybridCloudLlm } from '../core/nb-api.mjs'
import { registerTools } from '../core/tools.mjs'

export const name = 'investai-desktop'
export const inject = ['connection']

export function apply(ctx, config = {}) {
  const dir = config.dataDir ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'investai')
  let llm = null
  ctx.inject(['llm'], c => {
    llm = c.llm
    c.effect(() => () => { llm = null }, 'investai: llm')
  })
  let core = null
  const baseDsh = dshLlm(() => llm, () => core?.db.get('settings', 'main')?.models?.external)
  const hybrid = createHybridCloudLlm({ dshAdapter: baseDsh })
  const ready = createCore({ dir, mode: 'dsh', llm: hybrid(() => core?.db.get('settings', 'main')) })
    .then(c => (core = c))
  ready.catch(e => console.error('[investai] 启动失败', e))

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/investai',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async request => (await ready).handle(request),
  }), 'investai: /api/investai')

  ctx.inject(['tools'], c => registerTools(c, () => ready))
  ctx.effect(() => () => { void core?.close() }, 'investai: flush')
}
