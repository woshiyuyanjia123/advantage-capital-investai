// 事件 → 自动化 → 通知（「再做」：事件触发、AI 预审、推送到企业微信 / 飞书 / 钉钉）。
// 推送只发摘要与系统内链接，不发送敏感正文；Webhook 地址与签名密钥存于本机 secrets 文件。
import { createHmac, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const SECRETS = process.env.INVESTAI_SECRETS ?? join(homedir(), '.config', 'investai', 'secrets.json')

export async function readSecrets() { return readFile(SECRETS, 'utf8').then(JSON.parse, () => ({})) }
export async function writeSecret(key, value) {
  const s = await readSecrets()
  if (value === null || value === undefined || value === '') delete s[key]; else s[key] = value
  await mkdir(dirname(SECRETS), { recursive: true })
  await writeFile(SECRETS, JSON.stringify(s, null, 2), { mode: 0o600 })
}

/** 企业微信 / 飞书 / 钉钉 群机器人。返回 { ok, status, body }。 */
export async function pushWebhook(channel, { title, text, link }, fetchImpl = fetch) {
  const secrets = await readSecrets()
  const url0 = secrets[`push.${channel.id}.url`]
  if (!url0) return { ok: false, error: '未配置 Webhook 地址' }
  const sign = secrets[`push.${channel.id}.secret`]
  const md = `**${title}**\n\n${text}${link ? `\n\n[在 InvestAI 中打开](${link})` : ''}`
  let url = url0
  let body
  if (channel.type === 'wecom') body = { msgtype: 'markdown', markdown: { content: md } }
  else if (channel.type === 'feishu') {
    body = { msg_type: 'post', content: { post: { zh_cn: { title, content: [[{ tag: 'text', text }], ...(link ? [[{ tag: 'a', text: '在 InvestAI 中打开', href: link }]] : [])] } } } }
    if (sign) { const ts = Math.floor(Date.now() / 1000); body.timestamp = String(ts); body.sign = createHmac('sha256', `${ts}\n${sign}`).update('').digest('base64') }
  } else if (channel.type === 'dingtalk') {
    body = { msgtype: 'markdown', markdown: { title, text: md } }
    if (sign) { const ts = Date.now(); const s = encodeURIComponent(createHmac('sha256', sign).update(`${ts}\n${sign}`).digest('base64')); url += `${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${s}` }
  } else return { ok: false, error: `未知通道类型 ${channel.type}` }
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
    const j = await r.json().catch(() => ({}))
    const ok = r.ok && (j.errcode === 0 || j.code === 0 || j.StatusCode === 0 || (j.errcode === undefined && j.code === undefined))
    return { ok, status: r.status, body: j }
  } catch (e) { return { ok: false, error: e.message } }
}

export function createNotify({ db, fetchImpl }) {
  const handlers = new Map()
  const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn) }
  const emit = (type, payload) => {
    for (const fn of handlers.get(type) ?? []) Promise.resolve().then(() => fn(payload)).catch(e => console.error('[investai] 事件处理失败', type, e.message))
  }

  /** 站内通知 + 按配置推送。kind 用于用户订阅过滤。 */
  async function notify(userIds, { kind, title, text, link, projectId, push = true }) {
    const ids = [...new Set(userIds.filter(Boolean))]
    for (const userId of ids) db.putQuiet('notifications', { id: randomUUID(), userId, kind, title, text, link, projectId, read: false, at: Date.now() })
    if (!push) return
    const settings = db.get('settings', 'main')
    for (const ch of settings?.push?.channels ?? []) {
      if (!ch.enabled || (ch.kinds?.length && !ch.kinds.includes(kind))) continue
      const r = await pushWebhook(ch, { title, text: `${text}${ids.length ? `\n\n通知对象：${ids.map(id => db.get('users', id)?.name).filter(Boolean).join('、')}` : ''}`, link }, fetchImpl)
      db.putQuiet('pushlog', { id: randomUUID(), channel: ch.name, kind, title, ok: r.ok, error: r.error ?? (r.ok ? '' : JSON.stringify(r.body).slice(0, 200)), at: Date.now() })
    }
  }

  return { on, emit, notify }
}

/** 轻量调度器：everyMinutes 或每日 at 'HH:MM'；记录上次运行，可手动触发。 */
export function createScheduler({ db, jobs }) {
  const last = key => Number(db.kv(`sched.${key}`) ?? 0)
  const due = (s, now) => {
    if (!s.enabled) return false
    if (s.everyMinutes) return now - last(s.id) >= s.everyMinutes * 60000
    if (s.at) {
      const [h, m] = s.at.split(':').map(Number)
      const t = new Date(now); t.setHours(h, m, 0, 0)
      return now >= t.getTime() && last(s.id) < t.getTime()
    }
    return false
  }
  async function run(id, manual = false) {
    const fn = jobs[id]
    if (!fn) throw Object.assign(new Error(`未知任务 ${id}`), { status: 404 })
    db.kv(`sched.${id}`, Date.now())
    const t0 = Date.now()
    try {
      const result = await fn({ manual })
      db.putQuiet('schedlog', { id: randomUUID(), job: id, ok: true, result, ms: Date.now() - t0, at: Date.now(), manual })
      return { ok: true, result }
    } catch (e) {
      db.putQuiet('schedlog', { id: randomUUID(), job: id, ok: false, error: e.message, ms: Date.now() - t0, at: Date.now(), manual })
      return { ok: false, error: e.message }
    }
  }
  let timer = null
  function start() {
    timer = setInterval(() => {
      const now = Date.now()
      for (const s of db.get('settings', 'main')?.schedules ?? []) if (due(s, now)) void run(s.id)
    }, 60000)
    timer.unref?.()
  }
  return { run, start, stop: () => clearInterval(timer), last }
}
