// 智堡（Wisburg）开放接口客户端。文档：https://open-docs.wisburg.com/
// 密钥只在宿主进程读取：环境变量 WISBURG_API_KEY > ~/.config/investai/secrets.json，永不下发到前端。
import { readSecrets, writeSecret, SECRETS } from './notify.mjs'
import { parseApiKeyInput, sanitizeApiKey } from './llm.mjs'

const BASE = 'https://api-omen.wisburg.com/api'
export { SECRETS }

export const RESOURCES = {
  reports: { label: '研报笔记', text: 'summary' },
  'company-reports': { label: '企业研究', text: 'summary' },
  'market-daily': { label: 'AI 市场日报', text: 'summary', detailVia: 'reports' },
  earningscalls: { label: '电话会纪要', text: 'summary' },
  'am-reports': { label: '资管报告', text: 'summary' },
  archives: { label: '文献', text: 'summary' },
  articles: { label: '专栏文章', text: 'body' },
  feed: { label: '资讯流', text: 'content', noDetail: true },
  'mikko-logs': { label: 'Mikko 日志', text: 'content' },
  images: { label: '图片流', text: 'description', noDetail: true },
}

const stripHtml = s => String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h\d|li|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim()

export function createWisburg({ fetchImpl = fetch, base = BASE } = {}) {
  const cache = new Map()
  let lastOk = 0
  let lastError = null
  let key = null

  async function apiKey() {
    if (process.env.WISBURG_API_KEY) return sanitizeApiKey(process.env.WISBURG_API_KEY)
    if (key !== null) return key
    const raw = String((await readSecrets()).wisburgApiKey ?? '').trim()
    const parsed = parseApiKeyInput(raw)
    if (raw && !parsed) throw Object.assign(new Error('智堡 API Key 格式不正确，请重新填写纯英文数字密钥'), { status: 400 })
    key = parsed || ''
    return key
  }

  async function call(path, params = {}) {
    const k = await apiKey()
    if (!k) throw Object.assign(new Error('未配置智堡 API Key（设置 → 外部数据）'), { status: 409 })
    const url = `${base}/${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))}`
    const hit = cache.get(url)
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data
    const r = await fetchImpl(url, { headers: { authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(20000) })
    const body = await r.json().catch(() => ({}))
    if (!r.ok || body.code !== 200) {
      const msg = { 401: '智堡 API Key 无效或已过期', 403: '智堡：无访问权限或不在订阅范围', 429: '智堡：请求过于频繁，请稍后再试' }[body.code ?? r.status] ?? `智堡接口错误 ${body.code ?? r.status}：${body.message ?? ''}`
      lastError = { at: Date.now(), message: msg }
      throw Object.assign(new Error(msg), { status: 502 })
    }
    lastOk = Date.now()
    lastError = null
    cache.set(url, { at: Date.now(), data: body.data })
    if (cache.size > 300) cache.delete(cache.keys().next().value)
    return body.data
  }

  return {
    async status() {
      const configured = Boolean(await apiKey())
      return { configured, lastOk, lastError, source: process.env.WISBURG_API_KEY ? '环境变量' : configured ? '本机配置文件' : '' }
    },
    /** 列表：返回统一结构 { items:[{resource,id,title,datetime,preview}], cursor } */
    async list(resource, { query, first = 15, after, startTime, endTime } = {}) {
      const def = RESOURCES[resource]
      if (!def) throw Object.assign(new Error(`未知资源 ${resource}`), { status: 400 })
      const data = await call(resource, { first: Math.min(100, Number(first) || 15), query, after, startTime, endTime })
      return {
        items: (data.items ?? []).map((x, i) => ({
          resource, id: x.id ?? `${resource}-${i}-${x.datetime}`, title: x.title ?? stripHtml(x.content).slice(0, 60),
          datetime: x.datetime, preview: stripHtml(x.description ?? x.content ?? '').slice(0, 160), cover: x.cover_url, images: x.images,
          full: def.noDetail ? stripHtml(x[def.text] ?? '') : undefined,
        })),
        cursor: data.page_info?.end_cursor ?? null,
      }
    },
    /** 详情：统一为 { title, datetime, source, url, text(markdown) } */
    async detail(resource, id, fallback) {
      const def = RESOURCES[resource]
      if (!def) throw Object.assign(new Error(`未知资源 ${resource}`), { status: 400 })
      if (def.noDetail) return { resource, id, title: fallback?.title ?? '', datetime: fallback?.datetime, source: def.label, text: fallback?.full ?? fallback?.preview ?? '' }
      const x = await call(`${def.detailVia ?? resource}/${encodeURIComponent(id)}`)
      return {
        resource, id, title: x.title ?? stripHtml(x.content).slice(0, 60), datetime: x.datetime,
        source: x.meta?.name ? `智堡 · ${x.meta.name}` : `智堡 · ${def.label}`, note: x.meta?.description, url: x.url,
        text: def.text === 'body' ? stripHtml(x.body) : String(x[def.text] ?? ''),
      }
    },
    async setKey(value) {
      const clean = sanitizeApiKey(value)
      await writeSecret('wisburgApiKey', clean)
      key = clean
      cache.clear()
    },
  }
}
