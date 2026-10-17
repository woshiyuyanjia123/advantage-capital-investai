// 视图投影：「这个观看者能看到什么」只在这里决定。观看者是一个人（human），或代表这个人调用的外部模型（external）。
//   human：按岗位的敏感字段类别脱敏；external：所有敏感类别一律隐藏，且密级达到策略阈值的资料不可见。
// 接口层、智能体工具、DSH 会话工具、提取与预审都经过这里，不各自拼占位符。
import { FIELD_CATEGORIES } from './org.mjs'

export const viewer = {
  human: user => ({ user, external: false }),
  external: user => ({ user, external: true }),
}

export function createProjection({ db, org }) {
  const limit = () => db.get('settings', 'main')?.models?.sensitiveLevel ?? 2
  const sees = (v, cat) => !cat || (!v.external && org.canCategory(v.user, cat))
  const hidden = cat => ({ hidden: FIELD_CATEGORIES[cat] ?? '敏感字段' })

  function projectFields(v, p) {
    return Object.fromEntries(Object.entries(p?.fields ?? {}).map(([k, val]) => { const cat = org.fieldCategory('project', k); return [k, sees(v, cat) ? val : hidden(cat)] }))
  }
  /** 公司库字段带来源；字段自身记录了类别（来自提取模式），没有时按配置表。 */
  function companyFields(v, c) {
    return Object.fromEntries(Object.entries(c?.fields ?? {}).map(([k, f]) => { const cat = f?.category ?? org.fieldCategory('company', k); return [k, sees(v, cat) ? f : { ...hidden(cat), by: f?.by, at: f?.at }] }))
  }
  const company = (v, c) => c && { ...c, fields: companyFields(v, c) }
  const text = (v, s) => v.external ? org.redactAll(s) : org.redact(v.user, s)
  /** 资料能否进入该观看者的上下文（人看权限由资料库判定；外部模型再加密级阈值）。 */
  const file = (v, f) => !!f && (!v.external || (f.level ?? 1) < limit())

  /** 历史快照：不含密码哈希，项目与公司字段脱敏。 */
  function snapshot(v, coll, doc) {
    if (!doc) return doc
    if (coll === 'users') { const { pw, ...u } = doc; return u }
    if (coll === 'projects') return { ...doc, fields: projectFields(v, doc) }
    if (coll === 'companies') return company(v, doc)
    return doc
  }

  return { projectFields, companyFields, company, text, file, snapshot, limit }
}
