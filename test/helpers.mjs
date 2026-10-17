// 测试夹具：在临时目录启动完整后端（本机演示模式），通过同一个 HTTP 接口（产品的真实 seam）调用。
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.INVESTAI_SECRETS ??= join(await mkdtemp(join(tmpdir(), 'investai-test-secrets-')), 'secrets.json')
delete process.env.DEEPSEEK_API_KEY
const { createCore } = await import('../core/index.mjs')
const { createWisburg } = await import('../core/wisburg.mjs')

/** 外部模型探针：记录发给它的全部内容。 */
export function probeModel() {
  const seen = []
  return {
    seen,
    adapter: {
      kind: 'probe', info: async () => ({ ok: true, label: '探针外部模型' }), models: async () => [],
      async *stream(o) { seen.push(JSON.stringify(o)); yield '## 结论\n探针输出。' },
      async turn(o) { seen.push(JSON.stringify(o.messages)); return { text: '探针回答', reasoning: '', toolCalls: [], replay: null } },
    },
  }
}

export async function boot({ llm } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'investai-test-'))
  const offline = createWisburg({ fetchImpl: async () => new Response('{}', { status: 503 }), base: 'https://offline.invalid' })
  const core = await createCore({ dir: join(dir, 'data'), mode: 'desktop', llm, wisburg: offline, autostart: false })
  await core.ready
  const userId = name => core.db.one('users', u => u.username === name)?.id
  const as = name => { core.db.putQuiet('kvstate', { id: 'persona', userId: userId(name) }) }
  async function call(name, op, body, { query = '', headers = {} } = {}) {
    if (name) as(name)
    const r = await core.handle(new Request(`http://127.0.0.1/api/investai?op=${op}${query}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }))
    const ct = r.headers.get('content-type') ?? ''
    return { status: r.status, body: ct.includes('json') ? await r.json() : null }
  }
  const project = name => core.db.one('projects', p => p.name.includes(name))
  const user = name => core.db.get('users', userId(name))
  const wait = async id => { for (;;) { const j = core.ai.poll(id); if (j.status !== 'running') return j; await new Promise(r => setTimeout(r, 100)) } }
  return { core, call, project, user, userId, wait, close: () => core.close() }
}
