// 组合根：DSH 插件与 SaaS 服务共用。所有模块在这里装配，并接上事件、自动化与定时任务。
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { DB } from './db.mjs'
import { createOrg } from './org.mjs'
import { KB } from './kb.mjs'
import { AI } from './ai.mjs'
import { createEngine } from './workflow.mjs'
import { createDeliverables } from './deliverables.mjs'
import { createExtractor } from './extract.mjs'
import { createMeetings } from './meetings.mjs'
import { createFill } from './fill.mjs'
import { createSso } from './sso.mjs'
import { createNotify, createScheduler } from './notify.mjs'
import { createWisburg } from './wisburg.mjs'
import { seed, SCHEMA } from './seed.mjs'
import { createApi } from './api.mjs'
import { createLifecycle } from './lifecycle.mjs'
import { createProjection } from './projection.mjs'
import { migrate } from './migrate.mjs'
import { VOCAB } from './vocab.mjs'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app')
const SYSTEM = { id: 'system', name: '系统' }

/** 旧版（JSON 存储）数据整体移到 backup-v2-*，不删除任何文件。 */
async function migrateLegacy(dir) {
  if (!existsSync(join(dir, 'db.json')) || existsSync(join(dir, 'investai.sqlite'))) return
  const backup = join(dir, `backup-v2-${Date.now()}`)
  await mkdir(backup, { recursive: true })
  for (const n of ['db.json', 'nas', 'local', 'templates', 'archive', 'workspace', 'uploads', 'cache']) if (existsSync(join(dir, n))) await rename(join(dir, n), join(backup, n))
}

export async function createCore({ dir, mode, llm, wisburg = createWisburg(), fetchImpl, onSeed, autostart = true }) {
  await mkdir(dir, { recursive: true })
  await migrateLegacy(dir)
  const db = new DB(dir)
  const org = createOrg(db)
  const notify = createNotify({ db, fetchImpl })
  const kb = new KB({ db, org, dir })
  const lifecycle = createLifecycle({ db, org })
  const projection = createProjection({ db, org })
  const engine = createEngine({ db, org, events: notify })
  const deliverables = createDeliverables({ db, kb, org, events: notify, lifecycle })
  const ai = new AI({ db, kb, org, wisburg, cloud: llm, deliverables, notify, lifecycle, projection })
  ai.engine = engine
  const extractor = createExtractor({ db, kb, org, ai, projection })
  ai.extractor = extractor
  const meetings = createMeetings({ db, kb, org, ai, deliverables, notify, lifecycle })
  const fill = createFill({ db, kb, org, notify, extractor })
  /** 当前身份（桌面 / DSH 单用户模式）：DSH 会话工具与接口层共用。 */
  const persona = () => db.get('users', db.get('kvstate', 'persona')?.userId) ?? db.one('users', u => u.username === 'zhangwei') ?? db.all('users')[0]
  const sso = createSso({ db, fetchImpl })

  if (db.empty) {
    const renderDeliverable = async ({ projectId, type, markdown, user, engine: eng, status }) => {
      const d = deliverables.ensure(projectId, type, {}, user)
      await deliverables.addVersion(user, d, { markdown, engine: eng })
      const cur = db.get('deliverables', d.id)
      return db.put('deliverables', { ...cur, status, ...(status === 'final' ? { finalV: cur.versions.length, finalBy: user.name, finalAt: Date.now() } : {}) }, { actor: user, reason: '演示数据', action: 'seed' })
    }
    await seed({ db, dir, engine, renderDeliverable, system: SYSTEM })
    db.kv('schema', SCHEMA)
    onSeed?.(db)
  } else migrate(db)

  const finalizers = p => db.find('users', u => !u.disabled && org.canOp(u, 'op.material.finalize') && org.seesProject(u, p)).map(u => u.id)
  const members = p => [p.owner, ...(p.members ?? []).map(m => m.userId)]

  // ───────── 事件 → 自动化 ─────────
  notify.on('deliverable.submitted', async ({ deliverable: d, user }) => {
    const p = db.get('projects', d.projectId)
    const review = db.get('settings', 'main').automation?.preReview ? await ai.preReview(d, user) : null
    await notify.notify(finalizers(p).filter(id => id !== user.id), { kind: 'review', title: `「${d.type}」待审核 · ${p.name}`, text: `${user.name} 提交了 v${d.versions.length}${review ? `；AI 预审：${review.verdict}（引用核对 ${review.citeCheck.verified}/${review.citeCheck.total}${review.issues.length ? `，问题 ${review.issues.length} 条` : ''}）` : ''}`, projectId: p.id })
  })
  notify.on('deliverable.final', async ({ deliverable: d, user }) => {
    const p = db.get('projects', d.projectId)
    await notify.notify(members(p).filter(id => id !== user.id), { kind: 'final', title: `「${d.type}」已定稿 · ${p.name}`, text: `${user.name} 定稿 v${d.finalV}`, projectId: p.id, push: false })
  })
  notify.on('approval.requested', async ({ approval: a, user }) => {
    const p = db.get('projects', a.projectId)
    const r = engine.readiness(p)
    await notify.notify(a.voters, { kind: 'approval', title: `待表决：${a.gate.name} · ${p.name}`, text: `${user.name} 发起；规则：${VOCAB.rule[a.gate.rule]}；材料：${r.items.map(i => `${i.work}（${i.status}）`).join('、') || '无'}`, projectId: p.id })
  })
  notify.on('approval.decided', async ({ approval: a }) => {
    const p = db.get('projects', a.projectId)
    await notify.notify(members(p), { kind: 'decision', title: `${a.gate.name}结果：${VOCAB.result[a.result]} · ${p.name}`, text: `表决 ${a.votes.length}/${a.eligible}，阈值 ${a.need}`, projectId: p.id })
  })
  notify.on('material.uploaded', async ({ file, user }) => {
    if (db.get('settings', 'main').automation?.autoClassify && /BP|商业计划|计划书|工商/.test(file.name)) await notify.notify([user.id], { kind: 'suggest', title: `检测到 BP：${file.name}`, text: '可在项目中一键运行「智能提取 → 项目信息表」，提取结果需人工确认后入库。', push: false })
  })

  // ───────── 定时任务 ─────────
  const scheduler = createScheduler({
    db, jobs: {
      wisburg: async () => {
        if (!(await wisburg.status()).configured) return { skipped: '未配置智堡' }
        let saved = 0
        const hits = {}
        for (const kw of db.get('settings', 'main').watchlist ?? []) {
          const r = await wisburg.list('reports', { query: kw, first: 5, startTime: new Date(Date.now() - 3 * 864e5).toISOString() }).catch(() => ({ items: [] }))
          for (const it of r.items) {
            if (db.kv(`wb.seen.${it.id}`)) continue
            const x = await wisburg.detail('reports', it.id).catch(() => null)
            if (!x) continue
            const name = `${String(x.datetime).slice(0, 10)}-${String(x.title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.md`
            await kb.upload('m_up', name, Buffer.from(`# ${x.title}\n\n> 来源：${x.source} · ${String(x.datetime).slice(0, 10)}${x.note ? `\n> ${x.note}` : ''}\n\n${x.text}\n`), { level: 0, by: '智堡定时采集', subdir: `智堡/${kw}` })
            db.kv(`wb.seen.${it.id}`, Date.now())
            saved++
            ;(hits[kw] ??= []).push(x.title)
          }
        }
        for (const [kw, titles] of Object.entries(hits)) {
          const ps = db.find('projects', p => p.status === 'active' && ((p.tags ?? []).some(t => t.includes(kw) || kw.includes(t)) || (db.get('companies', p.companyId)?.industry ?? '').includes(kw)))
          if (ps.length) await notify.notify(ps.flatMap(members), { kind: 'research', title: `智堡新增「${kw}」研报 ${titles.length} 篇`, text: titles.slice(0, 3).join('；'), push: false })
        }
        return { saved, keywords: Object.keys(hits) }
      },
      brief: async () => {
        let total = 0
        for (const u of db.find('users', x => !x.disabled)) {
          const approvals = db.find('approvals', a => a.status === 'pending' && a.voters.includes(u.id) && !a.votes.some(v => v.userId === u.id))
          const tasks = db.find('tasks', t => t.owner === u.id && !t.done && t.due < Date.now() + 864e5)
          const reviews = org.canOp(u, 'op.material.finalize') ? db.find('deliverables', d => d.status === 'review' && org.seesProject(u, db.get('projects', d.projectId))) : []
          if (!approvals.length && !tasks.length && !reviews.length) continue
          total++
          await notify.notify([u.id], { kind: 'brief', title: '今日晨报', text: `待表决 ${approvals.length} 项；今日到期任务 ${tasks.length} 项；待审核成果 ${reviews.length} 项。`, push: false })
        }
        await notify.notify([], { kind: 'brief', title: 'InvestAI 团队晨报', text: `进行中项目 ${db.find('projects', p => p.status === 'active').length} 个；待表决 ${db.find('approvals', a => a.status === 'pending').length} 项；待审核成果 ${db.find('deliverables', d => d.status === 'review').length} 项；逾期任务 ${db.find('tasks', t => !t.done && t.due < Date.now()).length} 项。` })
        return { users: total }
      },
      deadline: async () => {
        const days = db.get('settings', 'main').automation?.deadlineDays ?? 2
        const soon = db.find('tasks', t => !t.done && t.due < Date.now() + days * 864e5 && db.kv(`dl.${t.id}`) !== new Date().toDateString())
        for (const t of soon) { db.kv(`dl.${t.id}`, new Date().toDateString()); await notify.notify([t.owner], { kind: 'deadline', title: `任务即将到期：${t.title}`, text: `到期：${new Date(t.due).toLocaleDateString('zh-CN')}`, projectId: t.projectId, push: false }) }
        if (soon.length) await notify.notify([], { kind: 'deadline', title: '任务到期提醒', text: soon.slice(0, 8).map(t => `${db.get('users', t.owner)?.name}：${t.title}`).join('\n') })
        return { reminded: soon.length }
      },
    },
  })
  if (autostart) scheduler.start()

  const handle = createApi({ db, org, kb, ai, engine, deliverables, extractor, meetings, fill, sso, notify, scheduler, wisburg, mode, appDir, dir, fetchImpl, lifecycle, projection, persona })
  const scanning = kb.scanAll()
  const timer = setInterval(() => void kb.scanAll(), 5 * 60 * 1000)
  timer.unref?.()
  return {
    db, org, kb, ai, engine, deliverables, extractor, meetings, fill, sso, notify, scheduler, lifecycle, projection, persona, handle, ready: scanning,
    async close() { clearInterval(timer); scheduler.stop(); db.close() },
  }
}
