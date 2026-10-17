// 界面与通知共用的状态词表（前端经 meta 接口取得，避免各处各写一份）。
export const VOCAB = {
  deliverable: { draft: '草稿', review: '待审核', final: '已定稿' },
  work: { todo: '待开始', doing: '进行中', done: '已完成', rework: '需补充' },
  project: { active: '进行中', paused: '已暂停', terminated: '已放弃', completed: '已完成' },
  result: { pass: '通过', return: '退回补充', reject: '否决', hold: '继续持有' },
  rule: { any: '任一通过', all: '全体通过', majority: '过半数通过', two_thirds: '三分之二通过' },
  approval: { pending: '表决中', decided: '已决定', cancelled: '已取消' },
  ai: ['关闭', '辅助建议', '起草待确认', '授权执行'],
  level: ['公开', '内部', '机密', '绝密'],
}
