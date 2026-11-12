// 优势资本智能投研：本地离线 API（Ollama/LM Studio/vLLM）与云端/DSH API 统一连接与探测
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { openaiLlm, complete, normalizeModel, DEFAULT_MODEL } from './llm.mjs'
import { writeSecret, readSecrets } from './notify.mjs'

export function readDshLocalDeepSeekKey() {
  try {
    const p = join(homedir(), '.dsh', '.credentials.yaml')
    if (!existsSync(p)) return ''
    const m = readFileSync(p, 'utf8').match(/DEEPSEEK_API_KEY:\s*([^\r\n]+)/)
    return m ? m[1].trim() : ''
  } catch { return '' }
}

export function readLocalCarbonConfig(tier = 'medium') {
  try {
    const p = join(homedir(), '.jeikcode', 'config.toml')
    if (!existsSync(p)) return null
    const txt = readFileSync(p, 'utf8')
    const baseURL = txt.match(/base_url\s*=\s*"([^"]+)"/)?.[1] || 'http://127.0.0.1:8046/v1'
    const apiKey = txt.match(/api_key\s*=\s*"([^"]+)"/)?.[1] || ''
    const model = tier === 'low' ? 'gemini-4-carbon-low' : tier === 'high' ? 'gemini-4-carbon-high' : 'gemini-4-carbon-medium'
    return apiKey ? { baseURL, apiKey, model } : null
  } catch { return null }
}

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i
const PRESETS = [
  { name: 'Carbon 高阶推理网关 (本机 8046)', baseURL: 'http://127.0.0.1:8046/v1' },
  { name: 'Ollama 本地离线', baseURL: 'http://127.0.0.1:11434/v1' },
  { name: 'LM Studio 本地离线', baseURL: 'http://127.0.0.1:1234/v1' },
  { name: 'vLLM / LocalAI 本地', baseURL: 'http://127.0.0.1:8000/v1' },
]

export async function probeLocalModels(customUrl = '') {
  const urls = [...new Set([customUrl.trim(), ...PRESETS.map(p => p.baseURL)].filter(u => LOOPBACK.test(u)))]
  const found = []
  for (const baseURL of urls) {
    try {
      const r = await fetch(`${baseURL.replace(/\/$/, '')}/models`, { signal: AbortSignal.timeout(1800) })
      if (!r.ok) continue
      const j = await r.json().catch(() => ({}))
      const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []
      for (const m of list) {
        const id = m.id ?? m.name
        if (id) found.push({ baseURL, model: String(id), label: `${baseURL} · ${id}` })
      }
    } catch { /* 本地端口未启动时静默跳过 */ }
  }
  return { presets: PRESETS, models: found }
}

export function createHybridCloudLlm({ dshAdapter, readSecretsFn = readSecrets }) {
  let custom = { at: 0, sig: '', adapter: null }
  async function customAdapter(ext) {
    const sec = Date.now() - custom.at < 4000 ? custom.sec : (custom.at = Date.now(), custom.sec = await readSecretsFn().catch(() => ({})))
    const key = String(sec?.customApiKey || sec?.deepseekApiKey || process.env.INVESTAI_LLM_API_KEY || process.env.DEEPSEEK_API_KEY || readDshLocalDeepSeekKey() || '').trim()
    const baseURL = String(ext?.customBaseURL || process.env.INVESTAI_LLM_BASE_URL || 'https://api.deepseek.com').trim()
    const model = normalizeModel(ext?.customModel || ext?.model || DEFAULT_MODEL)
    const isLocalCustom = LOOPBACK.test(baseURL)
    if (!key && !isLocalCustom) return null
    const sig = `${baseURL}|${model}|${key}`
    if (sig !== custom.sig) custom = { ...custom, sig, adapter: openaiLlm({ baseURL, apiKey: key, model }) }
    return custom.adapter
  }
  return (getSettings) => ({
    kind: 'hybrid-dsh',
    refresh() { custom.at = 0; custom.sig = '' },
    async info() {
      const ext = getSettings()?.models?.external ?? {}
      if (ext.source !== 'custom' && dshAdapter) {
        const d = await dshAdapter.info().catch(() => ({ ok: false }))
        if (d?.ok) return d
      }
      const c = await customAdapter(ext)
      if (c) return c.info()
      if (dshAdapter) return dshAdapter.info()
      return { ok: false, note: '未连接 API（可在顶部「API 连接」配置本地离线模型或 API Key）' }
    },
    async models() {
      const dsh = dshAdapter ? await dshAdapter.models().catch(() => []) : []
      return dsh.length ? dsh : [{ provider: 'deepseek', model: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }, { provider: 'deepseek', model: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }]
    },
    async turn(opts) {
      const ext = getSettings()?.models?.external ?? {}
      if (ext.source !== 'custom' && dshAdapter && (await dshAdapter.info().catch(() => null))?.ok) return dshAdapter.turn(opts)
      const c = await customAdapter(ext)
      if (c) return c.turn(opts)
      throw new Error('未配置可用 API')
    },
    async *stream(opts) {
      const ext = getSettings()?.models?.external ?? {}
      if (ext.source !== 'custom' && dshAdapter && (await dshAdapter.info().catch(() => null))?.ok) { yield* dshAdapter.stream(opts); return }
      const c = await customAdapter(ext)
      if (c) { yield* c.stream(opts); return }
      throw new Error('未配置可用 API')
    },
  })
}

export async function quickConnectApi({ db, ai, mode }, user, b) {
  const s = db.get('settings', 'main')
  const routeMode = ['local', 'hybrid', 'external'].includes(b.mode) ? b.mode : s.models.mode
  const local = b.localBaseURL !== undefined || b.localModel !== undefined
    ? { baseURL: String(b.localBaseURL ?? s.models.local?.baseURL ?? '').trim(), model: String(b.localModel ?? s.models.local?.model ?? '').trim() }
    : s.models.local
  if (local?.baseURL && !LOOPBACK.test(local.baseURL)) throw Object.assign(new Error('本地离线 API 仅限本机回环地址（如 http://127.0.0.1:11434/v1）'), { status: 400 })
  if (b.apiKey !== undefined && String(b.apiKey).trim()) {
    await writeSecret('deepseekApiKey', String(b.apiKey).trim())
    await writeSecret('customApiKey', String(b.apiKey).trim())
  }
  const external = {
    ...s.models.external,
    approved: b.approved ?? true,
    source: b.source ?? s.models.external?.source ?? 'auto',
    ...(b.provider !== undefined ? { provider: b.provider } : {}),
    ...(b.model !== undefined ? { model: normalizeModel(b.model) } : {}),
    ...(b.customBaseURL !== undefined ? { customBaseURL: String(b.customBaseURL).trim() } : {}),
    ...(b.customModel !== undefined ? { customModel: normalizeModel(String(b.customModel).trim()) } : {}),
  }
  const sensitiveLevel = b.sensitiveLevel !== undefined ? Number(b.sensitiveLevel) : (mode !== 'saas' && routeMode !== 'local' ? 4 : s.models.sensitiveLevel)
  db.put('settings', { ...s, models: { ...s.models, mode: routeMode, sensitiveLevel, local, external } }, { actor: user, reason: '优势资本投研 API 快速配置', action: 'settings' })
  ai.resetHealth()
  if (b.test) {
    if (routeMode === 'local' && local?.baseURL && local?.model) {
      const at = Date.now()
      const ad = openaiLlm({ baseURL: local.baseURL, model: local.model, apiKey: '' })
      const reply = await complete(ad, { system: '回复正常两字', user: '测试', maxTokens: 20, reasoning: 'off', signal: AbortSignal.timeout(15000) })
      return { ok: true, label: `本地离线 · ${local.model}`, ms: Date.now() - at, reply: reply.slice(0, 40) }
    }
    return ai.testModel()
  }
  return ai.status()
}
