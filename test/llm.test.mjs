// DeepSeek 接入的回归测试：用本机模拟服务按官方文档（api-docs.deepseek.com，2026-10）的协议校验请求，不需要真实 Key。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { boot, probeModel } from './helpers.mjs'
import { openaiLlm, secretLlm, complete, DEFAULT_MODEL, parseApiKeyInput, sanitizeApiKey, normalizeBaseURL } from '../core/llm.mjs'
import { createHybridCloudLlm, quickConnectApi } from '../core/nb-api.mjs'

// 模拟服务：按 plan 依次回放响应（status + SSE 事件），记录收到的请求体
let server
let base
const seen = []
let plan = []
before(async () => {
  server = createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    seen.push(JSON.parse(body))
    const step = plan.shift() ?? { events: [{ content: 'ok' }, { finish: 'stop' }] }
    if (step.status) { res.writeHead(step.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: step.message ?? 'error' } })) }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(': keep-alive\n\n')
    for (const e of step.events) res.write(`data: ${JSON.stringify(e.error ? { error: e.error } : { choices: [{ index: 0, delta: e.finish ? {} : { ...(e.content ? { content: e.content } : {}), ...(e.reasoning ? { reasoning_content: e.reasoning } : {}), ...(e.tool ? { tool_calls: [e.tool] } : {}) }, finish_reason: e.finish ?? null }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { server.closeAllConnections(); server.close() })
const ds = (o = {}) => openaiLlm({ baseURL: base, apiKey: 'sk-test', model: DEFAULT_MODEL, dialect: 'deepseek', retryDelay: 5, ...o })
const reset = steps => { seen.length = 0; plan = steps }

test('L1 默认模型是 DeepSeek 官方 ID deepseek-flash；旧版保存的 deepseek-v4.1-flash 自动换成 deepseek-flash', async () => {
  assert.equal(DEFAULT_MODEL, 'deepseek-flash')
  reset([])
  const legacy = secretLlm({ readSecrets: async () => ({ deepseekApiKey: 'sk-test' }), baseURL: base, dialect: 'deepseek', getModel: () => 'deepseek-v4.1-flash' })
  await complete(legacy, { system: 's', user: 'u', reasoning: 'off' })
  assert.equal(seen[0].model, 'deepseek-flash')
})

test('L2 DeepSeek 每次调用显式控制思考模式；非 DeepSeek 接口（本地 Ollama 等）不传这些参数', async () => {
  reset([])
  await complete(ds(), { system: 's', user: 'u', reasoning: 'off' })
  await complete(ds(), { system: 's', user: 'u', reasoning: 'low' })
  await complete(ds({ dialect: '' }), { system: 's', user: 'u', reasoning: 'off' })
  assert.deepEqual(seen[0].thinking, { type: 'disabled' })
  assert.equal(seen[0].reasoning_effort, undefined)
  assert.deepEqual(seen[1].thinking, { type: 'enabled' })
  assert.equal(seen[1].reasoning_effort, 'low')
  assert.equal(seen[2].thinking, undefined)
})

test('L3 达到长度上限：有正文时标注已截断；思考阶段就用完额度时报错（交给调用方回落），不当作空回答', async () => {
  reset([{ events: [{ content: '第一段' }, { finish: 'length' }] }, { events: [{ reasoning: '思考……' }, { finish: 'length' }] }])
  assert.match(await complete(ds(), { system: 's', user: 'u' }), /第一段[\s\S]*已截断/)
  await assert.rejects(complete(ds(), { system: 's', user: 'u' }), /思考阶段已用完额度/)
})

test('L4 带工具的多轮：assistant 消息都带 reasoning_content（DeepSeek 缺了返回 400）；没有工具时不传 tools', async () => {
  reset([{ events: [{ reasoning: '想一想' }, { tool: { index: 0, id: 'c1', type: 'function', function: { name: 'list_projects', arguments: '{}' } } }, { finish: 'tool_calls' }] }])
  const a = ds()
  const tools = [{ name: 'list_projects', description: 'd', parameters: { type: 'object', properties: {} } }]
  const r1 = await a.turn({ system: 's', messages: [{ role: 'user', text: 'q' }], tools })
  assert.equal(r1.reasoning, '想一想')
  assert.equal(r1.toolCalls[0].name, 'list_projects')
  await a.turn({ system: 's', messages: [{ role: 'user', text: 'q' }, { role: 'assistant', text: '', reasoning: r1.reasoning, toolCalls: r1.toolCalls }, { role: 'tool', toolCallId: 'c1', text: '[]' }, { role: 'assistant', text: '答' }, { role: 'user', text: 'q2' }], tools })
  const asst = seen[1].messages.filter(m => m.role === 'assistant')
  assert.equal(asst.length, 2)
  assert.ok(asst.every(m => typeof m.reasoning_content === 'string'))
  assert.equal(asst[0].reasoning_content, '想一想')
  await a.turn({ system: 's', messages: [{ role: 'user', text: 'q' }], tools: [] })
  assert.equal(seen[2].tools, undefined)
})

test('L5 服务繁忙 / 限流会重试；Key 无效、模型名不存在不重试，标为配置问题', async () => {
  reset([{ status: 503, message: 'Server busy' }, { events: [{ content: '好' }, { finish: 'stop' }] }])
  assert.equal(await complete(ds(), { system: 's', user: 'u' }), '好')
  assert.equal(seen.length, 2)
  reset([{ status: 400, message: 'Model Not Exist' }])
  const e = await complete(ds(), { system: 's', user: 'u' }).catch(x => x)
  assert.equal(seen.length, 1)
  assert.equal(e.permanent, true)
  assert.match(e.message, /模型名不存在/)
  reset([{ events: [{ content: '半句' }, { error: { message: 'internal error' } }] }])
  await assert.rejects(complete(ds(), { system: 's', user: 'u' }), /中途出错/)
})

test('L6 一次暂时性失败不会让之后 5 分钟都走离线引擎；配置类错误会，改了 Key / 模型设置后立即恢复', async () => {
  const t = await boot({ llm: probeModel().adapter })
  try {
    const label = '探针外部模型'
    t.core.ai.noteFailure(label, Object.assign(new Error('模型接口返回 503（服务繁忙）'), { status: 503, permanent: false }))
    assert.equal((await t.core.ai.status()).cloud.ok, true)
    assert.match((await t.core.ai.status()).cloud.lastError, /503/)
    t.core.ai.noteFailure(label, Object.assign(new Error('模型接口返回 401（API Key 无效）'), { status: 401, permanent: true }))
    assert.equal((await t.core.ai.status()).cloud.ok, false)
    const m = t.core.db.get('settings', 'main').models
    const r = await t.call('admin', 'settings.update', { section: 'models', value: { mode: m.mode, sensitiveLevel: m.sensitiveLevel } })
    assert.equal(r.status, 200)
    assert.equal((await t.core.ai.status()).cloud.ok, true)
  } finally { await t.close() }
})

test('L7 智能体把最近对话作为背景文字带上，不以 assistant 消息回放（被拒绝指令留下的回复曾导致 DeepSeek 400）', async () => {
  const probe = probeModel()
  const t = await boot({ llm: probe.adapter })
  try {
    await t.call('zhangwei', 'chat', { text: '帮我表决通过衡远储能立项' })
    const r = await t.call('zhangwei', 'chat', { text: '衡远储能现在在哪个阶段？' })
    await t.wait(r.body.job.id)
    const messages = JSON.parse(probe.seen.at(-1))
    assert.equal(messages.length, 1)
    assert.equal(messages[0].role, 'user')
    assert.match(messages[0].text, /最近的对话[\s\S]*用户：帮我表决[\s\S]*助手：[\s\S]*本轮问题[\s\S]*在哪个阶段/)
    assert.equal(messages[0].text.match(/在哪个阶段/g).length, 1)
  } finally { await t.close() }
})

test('L8 API Key 与 Base URL 清洗校验：兼容粘贴附带 Bearer/引号/中文备注，拦截非法密钥与填反字段，杜绝 ByteString 请求头崩溃', async () => {
  assert.equal(parseApiKeyInput('  sk-abc1234567890def  '), 'sk-abc1234567890def')
  assert.equal(parseApiKeyInput('Bearer "sk-abc1234567890def"\u200B'), 'sk-abc1234567890def')
  assert.equal(parseApiKeyInput('sk-80fc34b1d7094b72bae8aa8ab758989a 我的key'), 'sk-80fc34b1d7094b72bae8aa8ab758989a')
  assert.equal(parseApiKeyInput('https://api.deepseek.com'), null)
  assert.equal(parseApiKeyInput('完全无效中文内容'), null)
  assert.equal(sanitizeApiKey('完全无效中文内容'), '')

  assert.equal(normalizeBaseURL('https://api.deepseek.com/chat/completions/'), 'https://api.deepseek.com')
  assert.equal(normalizeBaseURL('api.deepseek.com/v1/'), 'https://api.deepseek.com/v1')
  assert.equal(normalizeBaseURL('127.0.0.1:11434/v1/'), 'http://127.0.0.1:11434/v1')
  assert.equal(normalizeBaseURL('sk-80fc34b1d7094b72bae8aa8ab758989a'), null)

  const badKeyLlm = openaiLlm({ baseURL: base, apiKey: '无效中文密钥', model: DEFAULT_MODEL })
  assert.equal((await badKeyLlm.info()).ok, false)
  await assert.rejects(complete(badKeyLlm, { system: 's', user: 'u' }), /API Key 格式不正确/)

  reset([])
  const dirtyKeyLlm = openaiLlm({ baseURL: `${base}/chat/completions`, apiKey: '「Bearer sk-clean1234567890」 备注', model: DEFAULT_MODEL })
  assert.equal((await dirtyKeyLlm.info()).ok, true)
  await complete(dirtyKeyLlm, { system: 's', user: 'u', reasoning: 'off' })
  assert.equal(seen.length, 1)
})

test('L9 路由与网关隔离：界面保存的密钥优先于兜底网关，不把 deepseek-flash 误发到 Carbon；DSH 模式下填 Key 自动切自定义并修正模型名', async () => {
  const prevDsKey = process.env.DEEPSEEK_API_KEY
  const prevLlmKey = process.env.INVESTAI_LLM_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.INVESTAI_LLM_API_KEY
  try {
    let savedSecrets = {}
    const readSec = async () => savedSecrets
    const baseCloud = secretLlm({ readSecrets: readSec, baseURL: base, model: DEFAULT_MODEL, dialect: 'deepseek' })
    let fallbackCalled = 0
    const carbonFallback = {
      kind: 'openai',
      info: async () => ({ ok: true, provider: '127.0.0.1:8046', model: 'gemini-4-carbon-medium', label: 'Carbon · medium' }),
      models: async () => [],
      async *stream() { fallbackCalled++; yield 'carbon-ok' },
      async turn() { fallbackCalled++; return { text: 'carbon-ok', reasoning: '', toolCalls: [] } },
    }
    let settings = { models: { mode: 'hybrid', external: { approved: true, source: 'auto', model: 'deepseek-flash' } } }
    const hybrid = createHybridCloudLlm({ dshAdapter: baseCloud, fallbackAdapter: carbonFallback, readSecretsFn: readSec, readDshKeyFn: () => '' })(() => settings)

    // 未配置 DeepSeek Key 时才走 Carbon 兜底，且不会把 deepseek-flash 发给 Carbon
    assert.equal((await hybrid.info()).label, 'Carbon · medium')
    assert.equal(await complete(hybrid, { system: 's', user: 'u' }), 'carbon-ok')
    assert.equal(fallbackCalled, 1)

    // 保存 DeepSeek Key 并刷新后，立即切回 DeepSeek 官方接口，不再误走 Carbon
    savedSecrets = { deepseekApiKey: 'sk-user1234567890', customApiKey: 'sk-user1234567890' }
    hybrid.refresh()
    reset([])
    assert.match((await hybrid.info()).label, /deepseek-flash/)
    await complete(hybrid, { system: 's', user: 'u', reasoning: 'off' })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].model, 'deepseek-flash')
    assert.equal(fallbackCalled, 1)

    // DSH 模式下粘贴 Key 且下拉框停留在 magpie 路由模型时，自动切 custom 并将 DeepSeek 接口模型修正为 deepseek-flash
    const t = await boot({ llm: probeModel().adapter })
    try {
      await assert.rejects(
        quickConnectApi({ db: t.core.db, ai: t.core.ai, mode: 'dsh' }, { id: 'admin', name: '管理员' }, { customBaseURL: 'sk-wrongplace123456', test: false }),
        /请勿在此处填写 API Key/,
      )
      await quickConnectApi(
        { db: t.core.db, ai: t.core.ai, mode: 'dsh' },
        { id: 'admin', name: '管理员' },
        { source: 'auto', model: 'group/ds-free-first', customBaseURL: 'https://api.siliconflow.cn/v1', customModel: 'Qwen/Qwen2.5-72B', test: false },
      )
      const ext = t.core.db.get('settings', 'main').models.external
      assert.equal(ext.source, 'custom')
      assert.equal(ext.customBaseURL, 'https://api.siliconflow.cn/v1')
      assert.equal(ext.customModel, 'Qwen/Qwen2.5-72B')
    } finally { await t.close() }
  } finally {
    if (prevDsKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = prevDsKey
    if (prevLlmKey === undefined) delete process.env.INVESTAI_LLM_API_KEY; else process.env.INVESTAI_LLM_API_KEY = prevLlmKey
  }
})
