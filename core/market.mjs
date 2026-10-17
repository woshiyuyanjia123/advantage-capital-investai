// 行情与公告（需求「最后做」）：本系统不内置任何未授权的行情源。
// 行情：机构从已授权数据终端导出 CSV 后导入（代码,名称,日期,收盘价[,涨跌幅][,成交额]）；可替换为已授权的数据接口。
// 公告 / 企业研究：通过已接入的智堡企业研究接口按公司名检索。
const fail = (m, status = 400) => Object.assign(new Error(m), { status })

export function createMarket({ db, org, wisburg }) {
  function importCsv(user, text, source = 'CSV 导入') {
    org.assert(user, 'integration.manage')
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) throw fail('CSV 至少需要表头和一行数据')
    const head = lines[0].split(',').map(h => h.trim())
    const col = (...names) => head.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()))
    const ci = { code: col('代码', 'code', 'ticker'), name: col('名称', 'name'), date: col('日期', 'date'), close: col('收盘价', 'close', '收盘'), chg: col('涨跌幅', 'pct_chg', 'change'), amt: col('成交额', 'amount') }
    if (ci.code < 0 || ci.date < 0 || ci.close < 0) throw fail('CSV 表头需包含：代码、日期、收盘价')
    let n = 0
    const bad = []
    db.tx(() => {
      for (const [i, l] of lines.slice(1).entries()) {
        const c = l.split(',').map(x => x.trim())
        const close = Number(c[ci.close])
        const date = c[ci.date]?.replace(/\//g, '-')
        if (!c[ci.code] || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(date ?? '') || !Number.isFinite(close)) { bad.push(i + 2); continue }
        db.putQuiet('quotes', { id: `${c[ci.code]}:${date}`, code: c[ci.code], name: ci.name >= 0 ? c[ci.name] : '', date, close, chg: ci.chg >= 0 ? Number(c[ci.chg]) : null, amount: ci.amt >= 0 ? Number(c[ci.amt]) : null, source, by: user.name, at: Date.now() })
        n++
      }
    })
    db.putQuiet('audit', { id: Math.random().toString(36).slice(2, 12), at: Date.now(), user: user.name, action: '导入行情', target: `${n} 行（${source}）`, detail: bad.length ? `跳过第 ${bad.slice(0, 10).join('、')} 行` : '' })
    return { imported: n, skipped: bad.length }
  }

  function quotes() {
    const by = {}
    for (const q of db.all('quotes')) (by[q.code] ??= []).push(q)
    return Object.values(by).map(list => {
      list.sort((a, b) => a.date.localeCompare(b.date))
      const last = list.at(-1)
      const first = list[0]
      return { code: last.code, name: last.name, date: last.date, close: last.close, chg: last.chg, source: last.source, series: list.slice(-60).map(x => [x.date, x.close]), periodChg: first.close ? (last.close / first.close - 1) * 100 : null }
    })
  }

  async function announcements(user, companyId) {
    org.assert(user, 'research.view')
    const c = db.get('companies', companyId)
    if (!c) throw fail('公司不存在', 404)
    if (!(await wisburg.status()).configured) return { items: [], note: '未配置智堡接口' }
    const r = await wisburg.list('company-reports', { query: c.short, first: 10 }).catch(e => ({ items: [], error: e.message }))
    return { items: r.items ?? [], note: r.error ?? (r.items?.length ? '' : `智堡企业研究中暂无「${c.short}」相关内容（非上市公司通常没有公开公告）`) }
  }

  return { importCsv, quotes, announcements }
}
