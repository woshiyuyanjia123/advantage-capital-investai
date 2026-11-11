// 模型适配器：DSH 宿主模型（ctx.llm）/ OpenAI 兼容接口（DeepSeek 官方、本机 Ollama 等）。
// 统一能力：info() 状态、models() 列表、stream() 纯文本流、turn() 带工具的一轮对话。
// 调用参数 reasoning：'off' | 'low' | 'high' | 'max'，DeepSeek 官方接口据此开关思考模式；其他接口忽略。
import { randomUUID } from 'node:crypto'

// DeepSeek 官方模型 ID（api-docs.deepseek.com，2026-10）：deepseek-flash = V4.1 Flash；deepseek-v4-flash 为兼容旧名；
// deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用。注意没有「deepseek-v4.1-flash」这个 ID（会返回 400 Model Not Exist）。
export const DEFAULT_MODEL = 'deepseek-flash'
export const DEEPSEEK_MODELS = [{ model: 'deepseek-flash', name: 'DeepSeek V4.1 Flash（推荐）' }, { model: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }]
const LEGACY = { 'deepseek-v4.1-flash': 'deepseek-flash', 'deepseek-chat': 'deepseek-flash', 'deepseek-reasoner': 'deepseek-flash' }
/** 旧版本保存过的错误 / 已停用的模型名，换成当前可用的 ID。 */
export const normalizeModel = m => LEGACY[m] ?? m
export const PREFERRED = ['deepseek-flash', 'deepseek-v4.1-flash', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat']
const TRUNCATED = '\n\n> 输出达到长度上限，已截断。'

export function dshLlm(getLlm, getChoice) {
  let cache = null
  const resolve = async () => {
    if (cache && Date.now() - cache.at < 60000 && cache.key === JSON.stringify(getChoice())) return cache.value
    const llm = getLlm()
    let value = { ok: false, note: 'DSH 模型服务未就绪' }
    if (llm) {
      const choice = getChoice()
      if (choice?.provider && choice?.model) value = { ok: true, ...choice }
      else {
        value = { ok: false, note: 'DSH 尚未配置模型供应商（在 DSH 设置 → 模型 中添加）' }
        // 优先 DeepSeek V4.1 Flash，其次 V4 Flash，再其次第一个可用模型
        const all = []
        for (const p of llm.listProviders()) for (const m of await llm.listModels(p.id).catch(() => [])) all.push({ provider: p.id, model: m.id })
        const pick = PREFERRED.map(id => all.find(m => m.model === id)).find(Boolean) ?? all[0]
        if (pick) value = { ok: true, ...pick }
      }
    }
    if (value.ok) value.label = `DSH · ${value.model}`
    cache = { at: Date.now(), key: JSON.stringify(getChoice()), value }
    return value
  }
  return {
    kind: 'dsh',
    info: resolve,
    async models() {
      const llm = getLlm()
      if (!llm) return []
      const out = []
      for (const p of llm.listProviders()) for (const m of await llm.listModels(p.id).catch(() => [])) out.push({ provider: p.id, model: m.id, name: m.name ?? m.id })
      return out
    },
    /** 一轮带工具的对话：messages 为中性格式，返回文本、推理与工具调用。 */
    async turn({ system, messages, tools, signal, maxTokens = 3000, onText }) {
      const info = await resolve()
      if (!info.ok) throw new Error(info.note)
      const src = { kind: 'plugin', plugin: 'investai-desktop' }
      const wire = messages.map(m => m.role === 'user' ? { id: randomUUID(), role: 'user', content: [{ type: 'text', text: m.text }], source: src }
        : m.role === 'assistant' ? { id: randomUUID(), role: 'assistant', content: [...(m.reasoning ? [{ type: 'reasoning', text: m.reasoning }] : []), ...(m.text ? [{ type: 'text', text: m.text }] : []), ...(m.toolCalls ?? []).map(c => ({ type: 'tool-call', id: c.id, name: c.name, arguments: c.arguments }))], source: { kind: 'model', provider: info.provider, model: info.model, ...(m.replay !== undefined ? { replayState: m.replay } : {}) } }
        : { id: randomUUID(), role: 'user', content: [{ type: 'tool-result', toolCallId: m.toolCallId, content: [{ type: 'text', text: m.text }] }], source: { kind: 'tool', callId: m.toolCallId } })
      const out = { text: '', reasoning: '', toolCalls: [], replay: undefined }
      for await (const ev of getLlm().stream({ provider: info.provider, model: info.model, system, messages: wire, tools: tools.map(({ name, description, parameters }) => ({ name, description, parameters })), maxTokens, signal })) {
        if (ev.type === 'text-delta') { out.text += ev.text; onText?.(ev.text) }
        else if (ev.type === 'block-end' && ev.block?.type === 'reasoning') out.reasoning = ev.block.text
        else if (ev.type === 'block-end' && ev.block?.type === 'tool-call') out.toolCalls.push({ id: ev.block.id, name: ev.block.name, arguments: ev.block.arguments })
        else if (ev.type === 'finish') {
          out.replay = ev.replayState
          if (ev.reason?.kind && !['stop', 'max-tokens', 'tool-calls'].includes(ev.reason.kind)) throw new Error(ev.reason.failure?.message ?? `模型调用中止：${ev.reason.kind}`)
        }
      }
      return out
    },
    async *stream({ system, user, signal, maxTokens = 4000 }) {
      const info = await resolve()
      if (!info.ok) throw new Error(info.note)
      const message = { id: randomUUID(), role: 'user', content: [{ type: 'text', text: user }], source: { kind: 'plugin', plugin: 'investai-desktop' } }
      for await (const ev of getLlm().stream({ provider: info.provider, model: info.model, system, messages: [message], maxTokens, signal })) {
        if (ev.type === 'text-delta') yield ev.text
        else if (ev.type === 'finish' && ev.reason?.kind === 'max-tokens') yield TRUNCATED
        else if (ev.type === 'finish' && ev.reason?.kind && !['stop', 'max-tokens'].includes(ev.reason.kind)) {
          throw new Error(ev.reason.failure?.message ?? `模型调用中止：${ev.reason.kind}`)
        }
      }
    },
  }
}

/**
 * 模型接口错误。permanent = 配置类问题（Key 无效、余额不足、模型名不存在、请求格式错误），重试无用，需要改配置；
 * 其余（限流、服务繁忙、网络中断、超时）是暂时性的，下次照常调用。
 */
function apiError(status, body) {
  let msg = body
  try { msg = JSON.parse(body).error?.message ?? body } catch { /* 非 JSON 错误页 */ }
  const hint = { 401: 'API Key 无效', 402: '账户余额不足', 422: '请求参数错误', 429: '请求过于频繁', 503: '服务繁忙' }[status] ?? (/model not exist/i.test(msg) ? '模型名不存在' : '')
  return Object.assign(new Error(`模型接口返回 ${status}${hint ? `（${hint}）` : ''}：${String(msg).slice(0, 200)}`), { status, permanent: [400, 401, 402, 403, 404, 422].includes(status) })
}

const RETRY = [429, 500, 502, 503, 504]
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
})

/** SSE 流：逐条产出 JSON 事件；流中途返回 error 对象时抛错（以前会被当作空回答静默吞掉）。 */
async function* sse(r) {
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line.startsWith('data:')) continue // 空行与 「: keep-alive」心跳
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      let ev
      try { ev = JSON.parse(data) } catch { continue }
      if (ev.error) throw Object.assign(new Error(`模型接口中途出错：${String(ev.error.message ?? JSON.stringify(ev.error)).slice(0, 200)}`), { permanent: false })
      yield ev
    }
  }
}

/**
 * OpenAI 兼容接口。dialect 为 'deepseek'（默认按域名判断）时按 DeepSeek 官方协议：
 *  · 思考模式默认开启，max_tokens 同时计入思维链与正文 → 每次调用显式传 thinking / reasoning_effort
 *  · 带 tools 的多轮请求，历史 assistant 消息都要带 reasoning_content，否则返回 400
 */
export function openaiLlm({ baseURL, apiKey, model, dialect, retryDelay = 1000 }) {
  const ok = Boolean(baseURL && model)
  const host = ok ? new URL(baseURL).host : ''
  const deepseek = (dialect ?? (/(^|\.)deepseek\.com$/.test(ok ? new URL(baseURL).hostname : '') ? 'deepseek' : '')) === 'deepseek'
  const label = deepseek && host.endsWith('deepseek.com') ? `DeepSeek · ${model}` : `${host} · ${model}`
  // reasoning_effort 只有 low / high / max（api-docs.deepseek.com），其他写法一律按 high
  const thinking = reasoning => !deepseek ? {} : reasoning === 'off' || reasoning === 'none' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'enabled' }, reasoning_effort: ['low', 'high', 'max'].includes(reasoning) ? reasoning : 'high' }
  // 限流 / 服务繁忙 / 网络错误在开始输出前最多重试 2 次；配置类错误立即返回
  async function post(body, signal) {
    for (let attempt = 0; ; attempt++) {
      let r
      try {
        r = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST', signal,
          headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model, stream: true, ...body }),
        })
      } catch (e) {
        if (signal?.aborted || attempt >= 2) throw Object.assign(e, { permanent: false })
        await sleep(retryDelay * 2 ** attempt, signal)
        continue
      }
      if (r.ok) return r
      const err = apiError(r.status, await r.text())
      if (!RETRY.includes(r.status) || attempt >= 2) throw err
      await sleep(retryDelay * 2 ** attempt, signal)
    }
  }
  return {
    kind: 'openai',
    info: async () => ok ? { ok: true, provider: host, model, label } : { ok: false, note: '未配置模型：设置 DEEPSEEK_API_KEY 或 INVESTAI_LLM_BASE_URL' },
    models: async () => ok ? [{ provider: host, model, name: model }] : [],
    async turn({ system, messages, tools = [], signal, maxTokens = 3000, reasoning = 'high', onText }) {
      const wire = [{ role: 'system', content: system }, ...messages.map(m => m.role === 'user' ? { role: 'user', content: m.text }
        : m.role === 'assistant' ? { role: 'assistant', content: m.text || null, ...(deepseek || m.reasoning ? { reasoning_content: m.reasoning ?? '' } : {}), ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}) }
        : { role: 'tool', tool_call_id: m.toolCallId, content: m.text })]
      const r = await post({ max_tokens: maxTokens, messages: wire, ...(tools.length ? { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}), ...thinking(reasoning) }, signal)
      const out = { text: '', reasoning: '', toolCalls: [], finish: null }
      for await (const ev of sse(r)) {
        const choice = ev.choices?.[0]
        if (!choice) continue
        const delta = choice.delta ?? {}
        if (delta.content) { out.text += delta.content; onText?.(delta.content) }
        if (delta.reasoning_content) out.reasoning += delta.reasoning_content
        for (const tc of delta.tool_calls ?? []) {
          const slot = (out.toolCalls[tc.index ?? 0] ??= { id: '', name: '', arguments: '' })
          if (tc.id) slot.id = tc.id
          if (tc.function?.name) slot.name += tc.function.name
          if (tc.function?.arguments) slot.arguments += tc.function.arguments
        }
        if (choice.finish_reason) { out.finish = choice.finish_reason; if (choice.finish_reason !== 'length') break }
      }
      r.body?.cancel?.().catch(() => {})
      out.toolCalls = out.toolCalls.filter(Boolean)
      if (out.finish === 'length') {
        if (!out.text && !out.toolCalls.length) throw Object.assign(new Error('模型输出达到长度上限：思考阶段已用完额度，没有产出正文'), { permanent: false })
        out.text += TRUNCATED
        onText?.(TRUNCATED)
      }
      return out
    },
    async *stream({ system, user, signal, maxTokens = 4000, reasoning = 'high' }) {
      const r = await post({ max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...thinking(reasoning) }, signal)
      let any = false
      for await (const ev of sse(r)) {
        const choice = ev.choices?.[0]
        const t = choice?.delta?.content
        if (t) { any = true; yield t }
        if (choice?.finish_reason === 'length') {
          if (!any) throw Object.assign(new Error('模型输出达到长度上限：思考阶段已用完额度，没有产出正文'), { permanent: false })
          yield TRUNCATED
          break
        }
        if (choice?.finish_reason) break
      }
      r.body?.cancel?.().catch(() => {})
    },
  }
}


/** 收集完整文本（非流式场景：规划大纲、预审、结构化提取）。 */
export async function complete(adapter, opts) {
  let t = ''
  for await (const x of adapter.stream(opts)) t += x
  return t
}

/** 从模型输出中取第一个 JSON（容忍 ```json 包裹与前后说明文字）。 */
export function parseJson(text) {
  const s = String(text)
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = m ? m[1] : s.slice(Math.min(...['{', '['].map(c => s.indexOf(c)).filter(i => i >= 0)))
  try { return JSON.parse(raw) } catch {
    for (let end = raw.length; end > 0; end--) { const c = raw[end - 1]; if (c === '}' || c === ']') { try { return JSON.parse(raw.slice(0, end)) } catch { /* 继续缩短 */ } } }
    return null
  }
}

export const NONE = { kind: 'none', info: async () => ({ ok: false, note: '未配置模型' }), models: async () => [], async *stream() { throw new Error('未配置模型') } }

/**
 * 从本机密钥文件读取 API Key 的 OpenAI 兼容适配器（独立桌面版 / 服务端在界面里填写 DeepSeek Key 后即刻生效）。
 * 环境变量里的 Key 优先；密钥文件每 5 秒最多读取一次（refresh() 立即重读）。getModel 返回界面中选择的模型，未选择时用 model。
 */
export function secretLlm({ readSecrets, secretKey = 'deepseekApiKey', envKey = '', baseURL = 'https://api.deepseek.com', model = DEFAULT_MODEL, getModel, dialect }) {
  let cached = { at: 0, key: envKey, id: '', adapter: null }
  async function current() {
    let key = envKey || cached.key
    if (!envKey && Date.now() - cached.at > 5000) {
      key = String((await readSecrets().catch(() => ({})))[secretKey] ?? '')
      cached.at = Date.now()
    }
    const m = normalizeModel(getModel?.() || model)
    if (`${key}|${m}` !== cached.id) cached = { ...cached, key, id: `${key}|${m}`, adapter: key ? openaiLlm({ baseURL, apiKey: key, model: m, dialect }) : null }
    return cached.adapter
  }
  const none = { ok: false, note: '未配置 DeepSeek API Key：在「系统配置 → AI 策略与模型」中填写' }
  return {
    kind: 'openai',
    info: async () => (await current())?.info() ?? none,
    // 界面里可选的 DeepSeek 模型（与是否已填 Key 无关）
    models: async () => DEEPSEEK_MODELS.map(x => ({ provider: 'deepseek', ...x })),
    refresh() { cached.at = 0 },
    async turn(opts) { const a = await current(); if (!a) throw new Error(none.note); return a.turn(opts) },
    async *stream(opts) { const a = await current(); if (!a) throw new Error(none.note); yield* a.stream(opts) },
  }
}
