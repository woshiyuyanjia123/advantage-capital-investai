// 天眼查工商核查：用机构自己的开放平台 Token 查询目标公司的工商基本信息，把接口返回的字段原样存成一份底稿。
// 没有配置 Token、接口没有返回结果时不生成底稿，直接报错说明原因。目前只接了工商基本信息这一个接口，其余维度列为未查询。
import { readSecrets, writeSecret } from './notify.mjs'

export const TYC_DIMENSIONS = [
  { id: 'basic_info', name: '工商基本信息', endpoint: '/services/open/ic/baseinfoV2/2.0', fields: '统一社会信用代码、注册资本、成立日期、法定代表人、经营状态、注册地址', live: true },
  { id: 'business_info', name: '股东与工商变更', endpoint: '/services/open/ic/holder/2.0', fields: '股东及出资比例、主要人员、对外投资、历史变更', live: false },
  { id: 'judicial_risk', name: '司法风险', endpoint: '/services/open/jr/lawSuit/2.0', fields: '裁判文书、开庭公告、失信被执行人、限制高消费', live: false },
  { id: 'external_guarantees', name: '对外担保', endpoint: '/services/open/ic/guarantee/2.0', fields: '担保方、被担保方、担保金额、履行期限', live: false },
  { id: 'chattel_mortgage', name: '动产抵押', endpoint: '/services/open/mr/mortgageInfo/2.0', fields: '登记机关、债权人、抵押物', live: false },
  { id: 'serious_illegal', name: '严重违法', endpoint: '/services/open/mr/illegalinfo/2.0', fields: '列入和移出严重违法失信名单的原因、决定机关', live: false },
  { id: 'public_notice', name: '票据公示催告', endpoint: '/services/open/jr/publicNotice/2.0', fields: '票据号码、票面金额、公告日期', live: false },
]

const FIELDS = [
  ['name', '企业名称'], ['creditCode', '统一社会信用代码'], ['regNumber', '注册号'], ['legalPersonName', '法定代表人'],
  ['regStatus', '经营状态'], ['regCapital', '注册资本'], ['actualCapital', '实缴资本'], ['estiblishTime', '成立日期'],
  ['approvedTime', '核准日期'], ['companyOrgType', '企业类型'], ['industry', '行业'], ['regInstitute', '登记机关'],
  ['regLocation', '注册地址'], ['businessScope', '经营范围'], ['staffNumRange', '人员规模'], ['socialStaffNum', '参保人数'],
  ['historyNames', '曾用名'], ['base', '所在省份'],
]
const fmt = (k, v) => /Time$/.test(k) && /^\d{12,13}$/.test(String(v)) ? new Date(Number(v)).toISOString().slice(0, 10) : String(v)

export async function tianyanchaConfigured() {
  const sec = await readSecrets().catch(() => ({}))
  return Boolean(String(sec.tianyanchaToken || process.env.TIANYANCHA_API_TOKEN || '').trim())
}

export async function runTianyanchaDueDiligence({ db, kb }, user, p, b = {}) {
  if (b.apiToken && String(b.apiToken).trim()) await writeSecret('tianyanchaToken', String(b.apiToken).trim())
  const sec = await readSecrets().catch(() => ({}))
  const token = String(b.apiToken || sec.tianyanchaToken || process.env.TIANYANCHA_API_TOKEN || '').trim()
  const c = p.companyId ? db.get('companies', p.companyId) : null
  const keyword = String(b.companyName || c?.name || p.name.split(' ')[0]).trim()
  const fail = (m, status = 400) => Object.assign(new Error(m), { status })
  if (!token) throw fail('还没有配置天眼查开放平台的 Token，没有查询。请先在这里填入 Token。')
  if (!keyword) throw fail('请填写要查询的公司全称。')
  let j = null
  try {
    const r = await fetch(`${process.env.TIANYANCHA_BASE_URL || 'http://open.api.tianyancha.com'}/services/open/ic/baseinfoV2/2.0?keyword=${encodeURIComponent(keyword)}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(12000) })
    j = await r.json().catch(() => null)
    if (!r.ok && !j) throw new Error(`HTTP ${r.status}`)
  } catch (e) {
    throw fail(`天眼查接口没有连上：${e.name === 'TimeoutError' ? '12 秒内没有响应' : e.message}`, 502)
  }
  const res = j?.result
  if (!res || typeof res !== 'object') throw fail(`天眼查没有返回「${keyword}」的工商信息：${j?.reason || j?.message || `错误码 ${j?.error_code ?? '未知'}`}`, 502)
  const rows = FIELDS.filter(([k]) => res[k] !== undefined && res[k] !== null && String(res[k]).trim() !== '').map(([k, label]) => `${label}：${fmt(k, res[k])}`)
  const today = new Date().toISOString().slice(0, 10)
  const md = [
    `# ${res.name || keyword} 工商基本信息（天眼查）`,
    '',
    `查询日期：${today}。以下字段是天眼查开放平台接口返回的原文，没有经过人工核实。`,
    '',
    '## 工商基本信息',
    ...rows,
    '',
    '## 本次没有查询的维度',
    ...TYC_DIMENSIONS.filter(d => !d.live).map(d => `${d.name}：未查询`),
  ].join('\n')
  const subdir = `项目资料/${c?.short ?? p.name}`
  const saved = await kb.upload('m_nas', `天眼查工商基本信息_${today}.md`, Buffer.from(md, 'utf8'), { by: user.name, level: 2, subdir })
  return { ok: true, companyName: res.name || keyword, mode: '天眼查开放平台', file: saved, fields: rows.length, dimensions: TYC_DIMENSIONS, markdown: md }
}
