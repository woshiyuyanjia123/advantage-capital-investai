// 模型适配器：DSH 宿主模型（ctx.llm）/ OpenAI 兼容接口（DeepSeek 官方、本机 Ollama 等）。
// 统一能力：info() 状态、models() 列表、stream() 纯文本流、turn() 带工具的一轮对话。
import { randomUUID } from 'node:crypto'

export const PREFERRED = ['deepseek-v4.1-flash', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat']

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
        else if (ev.type === 'finish' && ev.reason?.kind === 'max-tokens') yield '\n\n> 输出达到长度上限，已截断。'
        else if (ev.type === 'finish' && ev.reason?.kind && !['stop', 'max-tokens'].includes(ev.reason.kind)) {
          throw new Error(ev.reason.failure?.message ?? `模型调用中止：${ev.reason.kind}`)
        }
      }
    },
  }
}

export function openaiLlm({ baseURL, apiKey, model }) {
  const ok = Boolean(baseURL && model)
  const host = ok ? new URL(baseURL).host : ''
  return {
    kind: 'openai',
    info: async () => ok ? { ok: true, provider: host, model, label: `${host} · ${model}` } : { ok: false, note: '未配置模型：设置 DEEPSEEK_API_KEY 或 INVESTAI_LLM_BASE_URL' },
    models: async () => ok ? [{ provider: host, model, name: model }] : [],
    async turn({ system, messages, tools, signal, maxTokens = 3000, onText }) {
      const wire = [{ role: 'system', content: system }, ...messages.map(m => m.role === 'user' ? { role: 'user', content: m.text }
        : m.role === 'assistant' ? { role: 'assistant', content: m.text || null, ...(m.reasoning ? { reasoning_content: m.reasoning } : {}), ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}) }
        : { role: 'tool', tool_call_id: m.toolCallId, content: m.text })]
      const r = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, stream: true, max_tokens: maxTokens, messages: wire, tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }),
      })
      if (!r.ok) throw new Error(`模型接口返回 ${r.status}：${(await r.text()).slice(0, 200)}`)
      const out = { text: '', reasoning: '', toolCalls: [] }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue
          let delta
          try { delta = JSON.parse(line.slice(5)).choices?.[0]?.delta } catch { continue }
          if (!delta) continue
          if (delta.content) { out.text += delta.content; onText?.(delta.content) }
          if (delta.reasoning_content) out.reasoning += delta.reasoning_content
          for (const tc of delta.tool_calls ?? []) {
            const slot = (out.toolCalls[tc.index ?? 0] ??= { id: '', name: '', arguments: '' })
            if (tc.id) slot.id = tc.id
            if (tc.function?.name) slot.name += tc.function.name
            if (tc.function?.arguments) slot.arguments += tc.function.arguments
          }
        }
      }
      out.toolCalls = out.toolCalls.filter(Boolean)
      return out
    },
    async *stream({ system, user, signal, maxTokens = 4000 }) {
      const r = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, stream: true, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      })
      if (!r.ok) throw new Error(`模型接口返回 ${r.status}：${(await r.text()).slice(0, 200)}`)
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
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') return
          try { const t = JSON.parse(data).choices?.[0]?.delta?.content; if (t) yield t } catch { /* 忽略心跳行 */ }
        }
      }
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
 * 环境变量里的 Key 优先；密钥文件每 5 秒最多读取一次。
 */
export function secretLlm({ readSecrets, secretKey = 'deepseekApiKey', envKey = '', baseURL = 'https://api.deepseek.com', model = 'deepseek-v4.1-flash' }) {
  let cached = { at: 0, key: envKey, adapter: null }
  async function current() {
    if (envKey) return cached.adapter ??= openaiLlm({ baseURL, apiKey: envKey, model })
    if (Date.now() - cached.at > 5000) {
      const key = String((await readSecrets().catch(() => ({})))[secretKey] ?? '')
      if (key !== cached.key || !cached.adapter) cached = { at: Date.now(), key, adapter: key ? openaiLlm({ baseURL, apiKey: key, model }) : null }
      else cached.at = Date.now()
    }
    return cached.adapter
  }
  const none = { ok: false, note: '未配置 DeepSeek API Key：在「系统配置 → AI 策略与模型」中填写' }
  return {
    kind: 'openai',
    info: async () => (await current())?.info() ?? none,
    models: async () => (await current())?.models() ?? [],
    async turn(opts) { const a = await current(); if (!a) throw new Error(none.note); return a.turn(opts) },
    async *stream(opts) { const a = await current(); if (!a) throw new Error(none.note); yield* a.stream(opts) },
  }
}
