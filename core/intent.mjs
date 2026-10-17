// 自然语言意图：从指令中识别项目与工作类型（无模型时也可用）。
import { WORK_TYPES } from './workflow.mjs'

const ALIAS = { BP: '项目信息表', 信息表: '项目信息表', 立项: '立项报告', 投决: '投决会材料', 尽调报告: '尽调报告', 估值: '估值模型', 纪要: '会议纪要', 保密协议: 'NDA', 风控: '风控意见', 复盘: '项目复盘报告', 投后: '投后报告', 退出: '退出建议书', 建议书: '投资建议书', 行研: '行业研究', 财务分析: '财务分析', 增资协议: '交易文件' }

export function findType(text) {
  const t = String(text)
  const keys = Object.keys(WORK_TYPES).sort((a, b) => b.length - a.length)
  const hit = keys.find(k => t.includes(k))
  if (hit) return hit
  const a = Object.keys(ALIAS).sort((x, y) => y.length - x.length).find(k => t.includes(k))
  return a && WORK_TYPES[ALIAS[a]] ? ALIAS[a] : null
}

export function findProject(text, projects) {
  const t = String(text)
  return projects.find(p => t.includes(p.name)) ?? projects.find(p => p.name.length >= 2 && t.includes(p.name.replace(/(项目|产业园|股份|有限公司).*$/, '').slice(0, 4))) ?? null
}
