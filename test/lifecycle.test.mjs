// 成果生命周期：岗位 × 状态 × 动作 的判定表（seam：createLifecycle().check / actions）。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { boot } from './helpers.mjs'

let t, lc, d
before(async () => {
  t = await boot()
  lc = t.core.lifecycle
  const p = t.project('衡远')
  d = { id: 'x', projectId: p.id, type: '行业研究', status: 'draft', versions: [{ v: 1 }] }
})
after(() => t.close())

const ok = (name, status, action) => lc.check(t.user(name), { ...d, status }, action) === null

test('项目经理：草稿可编辑、可提交、可让 AI 起草', () => {
  assert.ok(ok('zhangwei', 'draft', 'edit'))
  assert.ok(ok('zhangwei', 'draft', 'submit'))
  assert.ok(ok('zhangwei', 'draft', 'aiWrite'))
})
test('定稿只能从待审核开始，且需要「材料定稿」权限', () => {
  assert.ok(!ok('chen', 'draft', 'finalize'))
  assert.ok(ok('chen', 'review', 'finalize'))
  assert.ok(!ok('linxiao', 'review', 'finalize'))
})
test('已定稿不能编辑、不能 AI 改写；只能撤回定稿', () => {
  for (const a of ['edit', 'aiWrite', 'submit', 'finalize', 'reject']) assert.ok(!ok('chen', 'final', a), a)
  assert.ok(ok('chen', 'final', 'reopen'))
  assert.ok(!ok('linxiao', 'final', 'reopen'))
})
test('合伙人没有「编辑成果」权限：不能编辑也不能让 AI 写', () => {
  assert.ok(!ok('li', 'draft', 'edit'))
  assert.ok(!ok('li', 'draft', 'aiWrite'))
})
test('看不到项目的人什么都不能做', () => {
  for (const a of ['edit', 'submit', 'finalize']) assert.ok(!ok('hejing', 'draft', a), a)
})
test('AI 参与级别按工作类型取低：交易文件不能让 AI 起草', () => {
  assert.ok(lc.check(t.user('zhangwei'), { ...d, type: '交易文件' }, 'aiWrite') !== null)
})
test('不允许时给出原因，并列出有权限的人', () => {
  assert.throws(() => lc.authorize(t.user('linxiao'), { ...d, status: 'review' }, 'finalize'), e => e.status === 403 && /陈总/.test(e.message))
  const acts = lc.actions(t.user('linxiao'), { ...d, status: 'review' })
  assert.equal(acts.finalize.ok, false)
  assert.ok(acts.finalize.why.length > 4)
})
