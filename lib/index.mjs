// DSH 宿主侧插件：注册 /api/investai 精确 Fetch 路由（web 与桌面 Electron 载体都可用），
// 复用 DSH 已配置的模型（ctx.llm），并向 DSH 会话提供 investai_* 工具。
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createCore } from '../core/index.mjs'
import { dshLlm } from '../core/ai.mjs'
import { registerTools } from '../core/tools.mjs'

export const name = 'investai-desktop'
export const inject = ['connection']

export function apply(ctx, config = {}) {
  // 数据跟随 DSH 的主目录（DSH_HOME，默认 ~/.dsh）：用自定义 DSH_HOME 运行的另一套 DSH 不会读写默认那一份
  const dir = config.dataDir ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'investai')
  let llm = null
  ctx.inject(['llm'], c => {
    llm = c.llm
    c.effect(() => () => { llm = null }, 'investai: llm')
  })
  let core = null
  const ready = createCore({ dir, mode: 'dsh', llm: dshLlm(() => llm, () => core?.db.get('settings', 'main')?.models?.external) })
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
