// 优势资本智能投研：本地离线 API（Ollama/LM Studio/vLLM）与云端/DSH API 统一连接与探测
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { openaiLlm, complete, normalizeModel, DEFAULT_MODEL, DEEPSEEK_MODELS, parseApiKeyInput, sanitizeApiKey, normalizeBaseURL } from './llm.mjs'
import { writeSecret, readSecrets } from './notify.mjs'

export function readDshLocalDeepSeekKey() {
  try {
    const p = join(homedir(), '.dsh', '.credentials.yaml')
    if (!existsSync(p)) return ''
    const m = readFileSync(p, 'utf8').match(/DEEPSEEK_API_KEY:\s*([^\r\n]+)/)
    return m ? sanitizeApiKey(m[1]) : ''
  } catch { return '' }
}

export function readLocalCarbonConfig(tier = 'medium') {
  try {
    const p = join(homedir(), '.jeikcode', 'config.toml')
    if (!existsSync(p)) return null
    const txt = readFileSync(p, 'utf8')
    const baseURL = normalizeBaseURL(txt.match(/base_url\s*=\s*"([^"]+)"/)?.[1] || 'http://127.0.0.1:8046/v1')
    const apiKey = sanitizeApiKey(txt.match(/api_key\s*=\s*"([^"]+)"/)?.[1] || '')
    const model = tier === 'low' ? 'gemini-4-carbon-low' : tier === 'high' ? 'gemini-4-carbon-high' : 'gemini-4-carbon-medium'
    return baseURL && apiKey ? { baseURL, apiKey, model } : null
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

export function createHybridCloudLlm({ dshAdapter, fallbackAdapter = null, readSecretsFn = readSecrets, readDshKeyFn = readDshLocalDeepSeekKey }) {
  let custom = { at: 0, sig: '', adapter: null }
  async function customAdapter(ext) {
    const sec = custom.at > 0 && Date.now() - custom.at < 4000 ? custom.sec : (custom.at = Date.now(), custom.sec = await readSecretsFn().catch(() => ({})))
    const rawURL = String(ext?.customBaseURL || process.env.INVESTAI_LLM_BASE_URL || 'https://api.deepseek.com').trim()
    const baseURL = normalizeBaseURL(rawURL) ?? rawURL
    const isDsHost = (() => { try { return /(^|\.)deepseek\.com$/i.test(new URL(baseURL).hostname) } catch { return baseURL.includes('deepseek.com') } })()
    const savedRaw = String((isDsHost ? (sec?.customApiKey || sec?.deepseekApiKey) : sec?.customApiKey) || '').trim()
    const envRaw = sanitizeApiKey(process.env.INVESTAI_LLM_API_KEY || (isDsHost ? process.env.DEEPSEEK_API_KEY : '') || '') || (isDsHost ? readDshKeyFn() : '')
    const key = savedRaw || envRaw
    const isDsModel = m => /^deepseek-/i.test(String(m ?? ''))
    const pickedModel = isDsHost
      ? (isDsModel(ext?.customModel) ? ext.customModel : isDsModel(ext?.model) ? ext.model : DEFAULT_MODEL)
      : (ext?.customModel || ext?.model || '')
    const model = isDsHost ? normalizeModel(pickedModel) : pickedModel
    const isLocalCustom = LOOPBACK.test(baseURL)
    if (!key && !isLocalCustom) return null
    const sig = `${baseURL}|${model}|${key}`
    if (sig !== custom.sig) custom = { ...custom, sig, adapter: openaiLlm({ baseURL, apiKey: key, model }) }
    return custom.adapter
  }
  async function resolveAdapter(ext) {
    if (ext.source !== 'custom' && dshAdapter) {
      const d = await dshAdapter.info().catch(() => ({ ok: false }))
      if (d?.ok) return dshAdapter
    }
    const c = await customAdapter(ext)
    if (c) return c
    if (ext.source !== 'custom' && fallbackAdapter) {
      const f = await fallbackAdapter.info().catch(() => ({ ok: false }))
      if (f?.ok) return fallbackAdapter
    }
    return null
  }
  return (getSettings) => ({
    kind: 'hybrid-dsh',
    refresh() { custom.at = 0; custom.sig = ''; dshAdapter?.refresh?.(); fallbackAdapter?.refresh?.() },
    async info() {
      const ext = getSettings()?.models?.external ?? {}
      const a = await resolveAdapter(ext)
      if (a) return a.info()
      if (dshAdapter) return dshAdapter.info()
      return { ok: false, note: '未连接 API（可在顶部「API 连接」配置本地离线模型或 API Key）' }
    },
    async models() {
      const dsh = dshAdapter ? await dshAdapter.models().catch(() => []) : []
      return dsh.length ? dsh : DEEPSEEK_MODELS.map(x => ({ ...x }))
    },
    async turn(opts) {
      const a = await resolveAdapter(getSettings()?.models?.external ?? {})
      if (a) return a.turn(opts)
      throw new Error('未配置可用 API')
    },
    async *stream(opts) {
      const a = await resolveAdapter(getSettings()?.models?.external ?? {})
      if (a) { yield* a.stream(opts); return }
      throw new Error('未配置可用 API')
    },
  })
}

export function validateCustomBaseURL(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^(?:sk|rk|pk|ak|ds|nvapi|gsk|xai)-/i.test(s)) {
    throw Object.assign(new Error('Base URL 应填写接口地址（如 https://api.deepseek.com），请勿在此处填写 API Key'), { status: 400 })
  }
  const norm = normalizeBaseURL(s)
  if (!norm) throw Object.assign(new Error('Base URL 格式不正确，请填写 http:// 或 https:// 开头的接口地址'), { status: 400 })
  return norm
}

export async function quickConnectApi({ db, ai, mode }, user, b) {
  const s = db.get('settings', 'main')
  const routeMode = ['local', 'hybrid', 'external'].includes(b.mode) ? b.mode : s.models.mode
  const rawLocalURL = b.localBaseURL !== undefined ? String(b.localBaseURL).trim() : String(s.models.local?.baseURL ?? '').trim()
  const normLocalURL = rawLocalURL ? normalizeBaseURL(rawLocalURL) : ''
  const local = b.localBaseURL !== undefined || b.localModel !== undefined
    ? { baseURL: normLocalURL ?? rawLocalURL, model: String(b.localModel ?? s.models.local?.model ?? '').trim() }
    : s.models.local
  if (local?.baseURL && !LOOPBACK.test(local.baseURL)) throw Object.assign(new Error('本地离线 API 仅限本机回环地址（如 http://127.0.0.1:11434/v1）'), { status: 400 })
  let cleanKey = ''
  if (b.apiKey !== undefined && String(b.apiKey).trim()) {
    const parsed = parseApiKeyInput(b.apiKey)
    if (!parsed) throw Object.assign(new Error('API Key 格式不正确：请只粘贴纯英文数字密钥（如 sk-...），勿混入中文说明或网址'), { status: 400 })
    cleanKey = parsed
    await writeSecret('deepseekApiKey', cleanKey)
    await writeSecret('customApiKey', cleanKey)
  }
  const cleanCustomURL = b.customBaseURL !== undefined ? validateCustomBaseURL(b.customBaseURL) : undefined
  const prevExt = s.models.external ?? {}
  const requestedSource = b.source ?? prevExt.source ?? 'auto'
  const prevUrl = String(prevExt.customBaseURL ?? '').trim()
  const prevModel = String(prevExt.customModel ?? '').trim()
  const nextModel = String(b.customModel ?? '').trim()
  // 用户显式从 custom 切回 auto（前端带出旧值或传 clearCustom）时尊重 auto，否则若新填入自定义地址/模型则自动升为 custom
  const switchingToAuto = b.source === 'auto' && prevExt.source === 'custom'
  const samePrevCustom = (cleanCustomURL === undefined || cleanCustomURL === prevUrl) && (b.customModel === undefined || nextModel === prevModel)
  const hasCustomOverride = (cleanCustomURL && !/^https:\/\/api\.deepseek\.com$/i.test(cleanCustomURL)) || Boolean(nextModel)
  const resetToAuto = Boolean(b.clearCustom) || (switchingToAuto && samePrevCustom)
  const effectiveSource = resetToAuto
    ? 'auto'
    : ((mode === 'dsh' && cleanKey && b.source !== 'dsh') || (hasCustomOverride && b.source !== 'dsh') ? 'custom' : requestedSource)
  const effUrl = resetToAuto ? '' : cleanCustomURL
  const effCustomModel = resetToAuto ? '' : (b.customModel !== undefined ? nextModel : undefined)
  const targetURL = (effUrl || undefined) ?? prevUrl ?? 'https://api.deepseek.com'
  const isTargetDs = /(^|\.)deepseek\.com(\/|$|:)/i.test(targetURL)
  const isCustomNonDs = effectiveSource === 'custom' && !isTargetDs
  const resolveDsModel = m => /^deepseek-/i.test(String(m ?? '')) ? normalizeModel(m) : DEFAULT_MODEL
  const external = {
    ...prevExt,
    approved: b.approved ?? true,
    source: effectiveSource,
    ...(b.provider !== undefined ? { provider: b.provider } : {}),
    ...(b.model !== undefined ? { model: isCustomNonDs ? b.model : (effectiveSource === 'custom' && isTargetDs ? resolveDsModel(b.model) : normalizeModel(b.model)) } : {}),
    ...(effUrl !== undefined ? { customBaseURL: effUrl } : {}),
    ...(effCustomModel !== undefined ? { customModel: isCustomNonDs ? effCustomModel : normalizeModel(effCustomModel) } : {}),
  }
  const sensitiveLevel = b.sensitiveLevel !== undefined ? Number(b.sensitiveLevel) : (routeMode !== 'local' ? 4 : s.models.sensitiveLevel)
  db.put('settings', { ...s, models: { ...s.models, mode: routeMode, sensitiveLevel, local, external } }, { actor: user, reason: '优势资本投研 API 快速配置', action: 'settings' })
  ai.resetHealth()
  if (b.test) {
    if (routeMode === 'local' && local?.baseURL && local?.model) {
      const at = Date.now()
      const ad = openaiLlm({ baseURL: local.baseURL, model: local.model, apiKey: '' })
      try {
        const reply = await complete(ad, { system: '回复正常两字', user: '测试', maxTokens: 20, reasoning: 'off', signal: AbortSignal.timeout(15000) })
        return { ok: true, label: `本地离线 · ${local.model}`, ms: Date.now() - at, reply: reply.slice(0, 40) }
      } catch (e) {
        return { ok: false, label: `本地离线 · ${local.model}`, error: e.name === 'TimeoutError' ? '15 秒内没有响应（检查本地模型服务是否已启动）' : e.message }
      }
    }
    return ai.testModel()
  }
  return ai.status()
}
