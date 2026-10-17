// 已有数据目录的升级：按 schema 版本逐步执行，每步写入历史，可追溯。
import { SCHEMA } from './seed.mjs'

const SYSTEM = { id: 'system', name: '系统升级' }
const STEPS = {
  // 3 → 4：代码审查修复（风控可写风控意见；公司库敏感字段归类；toolknit 工具白名单；身份切换开关）
  4(db) {
    const risk = db.get('roles', 'risk')
    if (risk && !risk.functions.includes('deliverable.edit')) db.put('roles', { ...risk, functions: [...risk.functions, 'deliverable.edit'] }, { actor: SYSTEM, reason: '风控岗位可编写风控意见', action: 'migrate' })
    const partner = db.get('roles', 'partner')
    if (partner && !partner.functions.includes('project.delete')) db.put('roles', { ...partner, functions: [...partner.functions, 'project.delete'] }, { actor: SYSTEM, reason: '管理层可删除项目（此前没有任何岗位具备该权限）', action: 'migrate' })
    const s = db.get('settings', 'main')
    const fields = { ...(s.sensitivity?.fields ?? {}) }
    delete fields['company.financing']
    fields['company.本轮融资金额'] ??= 'amount'
    fields['company.投前估值'] ??= 'valuation'
    db.put('settings', { ...s, sensitivity: { ...s.sensitivity, fields }, toolknit: { allowTools: [], ...s.toolknit }, desktop: s.desktop ?? { personaSwitch: true } }, { actor: SYSTEM, reason: '公司库敏感字段归类', action: 'migrate' })
    // 已确认的公司字段补上敏感类别
    for (const c of db.all('companies')) {
      const f = { ...c.fields }
      let changed = false
      for (const [k, cat] of [['本轮融资金额', 'amount'], ['投前估值', 'valuation']]) if (f[k] && !f[k].category) { f[k] = { ...f[k], category: cat }; changed = true }
      if (changed) db.put('companies', { ...c, fields: f }, { actor: SYSTEM, reason: '公司库敏感字段归类', action: 'migrate' })
    }
  },
}

export function migrate(db) {
  let v = Number(db.kv('schema') ?? 3)
  while (v < SCHEMA) { v++; STEPS[v]?.(db); db.kv('schema', v) }
}
