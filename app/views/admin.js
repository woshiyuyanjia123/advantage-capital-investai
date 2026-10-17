// 系统配置：组织人员 · 岗位权限（功能/数据范围/业务操作/敏感字段与密级）· 流程配置（结构化表单 + 版本发布）
// 密级与敏感字段 · AI 参与策略 · 模型路由 · 集成（智堡 / 推送 / 统一登录 / toolknit / 行情）· 自动化与定时 · 审计回滚 · 评测
import { S, D, ACT, VIEWS, hooks, $, $$, esc, md, icon, avatar, get, post, act, toast, dialog, confirmBox, askText, drawer, drawerHead, can, user, userName, fmt, ymd, rel, opts, empty, LEVELS } from '/api/investai?asset=ui.js'

const TABS = [
  ['org', '组织与人员', 'org.manage'], ['roles', '岗位权限', null], ['workflow', '流程配置', null], ['security', '密级与敏感字段', 'settings.manage'],
  ['ai', 'AI 策略与模型', null], ['integrations', '集成', 'integration.manage'], ['automation', '自动化与定时', 'settings.manage'], ['audit', '审计与回滚', 'audit.read'], ['eval', '评测', 'ai.policy'],
]
const AI_L = ['关闭', '辅助建议', '起草待确认', '授权执行']
const CAT = { amount: '投资金额', valuation: '内部估值', terms: '交易条款', fund_lp: 'LP 信息', trade_secret: '商业秘密' }
const SCOPE = { own: '本人负责', dept: '本部门', assigned: '指定授权', postinv: '投后阶段', all: '全机构' }

VIEWS.settings = v => {
  const tabs = TABS.filter(([, , perm]) => !perm || can(perm))
  const tab = tabs.some(([k]) => k === S.sub) ? S.sub : tabs[0][0]
  v.innerHTML = `<div class="page scrollable"><div class="ph"><div class="grow"><h1>系统配置</h1><p>所有配置变更都记录历史并可回滚；你只能看到有权管理的配置项。</p></div></div>
    <div class="rtabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="go" data-view="settings" data-sub="${k}">${l}</button>`).join('')}</div><div id="sbody"><span class="spin"></span></div></div>`
  T[tab]($('#sbody'))
}
const saveSection = async (section, value, ok = '已保存（变更已记录，可回滚）') => { const r = await act('settings.update', { section, value }, ok); if (r) await hooks.reload({ files: false }); return r }

const T = {
  // ───────── 组织与人员 ─────────
  async org(el) {
    const users = await get('users')
    const d = D()
    el.innerHTML = `<div class="setgrid"><div class="box"><h3>${icon('user', 15)}人员<span class="grow"></span><button class="btn sm pri" data-act="user-edit">${icon('plus', 13)}新增</button></h3>
      <div class="tablebox"><table class="t"><thead><tr><th>姓名</th><th>账号</th><th>部门</th><th>岗位</th><th>状态</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td><div class="own">${avatar(u.name, 24)}<div><div>${esc(u.name)}</div><div class="dim" style="font-size:11px">${esc(u.title ?? '')}</div></div></div></td><td class="mono">${esc(u.username)}</td><td>${esc(d.depts.find(x => x.id === u.deptId)?.name ?? '')}</td><td>${(u.roles ?? []).map(r => `<span class="tag">${esc(r)}</span>`).join(' ')}</td><td>${u.disabled ? '<span class="bad">停用</span>' : '<span class="ok">正常</span>'}</td><td><button class="btn sm ghost" data-act="user-edit" data-id="${u.id}">编辑</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="box"><h3>${icon('building', 15)}部门<span class="grow"></span><button class="btn sm" data-act="dept-edit">${icon('plus', 13)}新增</button></h3>${d.depts.map(x => `<div class="li2"><b class="grow">${esc(x.name)}</b><span class="dim">${users.filter(u => u.deptId === x.id).length} 人</span><button class="btn sm ghost" data-act="dept-edit" data-id="${x.id}">改名</button></div>`).join('')}
        <h3 style="margin-top:14px">${icon('set', 15)}机构信息</h3><label class="f">机构名称<input class="input" id="orgName" value="${esc(d.settings.org?.name ?? '')}"></label><button class="btn sm pri" data-act="org-save">保存</button>
        ${d.mode !== 'saas' ? `<h3 style="margin-top:14px">${icon('lock', 15)}本机身份（DSH / 桌面模式）</h3><div class="dim" style="font-size:12px;margin-bottom:6px">桌面模式没有登录，任何能打开本机 DSH 的人都可切换身份。正式使用时请先切换到实际使用者，再锁定。</div><label class="f"><span><input type="checkbox" id="personaLock" ${d.settings.desktop?.personaSwitch === false ? 'checked' : ''}> 锁定当前身份（只有管理员能再切换）</span></label><button class="btn sm pri" data-act="persona-lock">保存</button>` : ''}</div></div>`
  },
  // ───────── 岗位权限（四层） ─────────
  async roles(el) {
    const r = await get('roles')
    const editable = can('org.manage')
    S.rolesMeta = r
    el.innerHTML = `<div class="infobox" style="margin-bottom:10px">权限分四层：<b>功能权限</b>（能用哪些模块）· <b>数据范围</b>（能看哪些项目）· <b>业务操作</b>（能否审批、表决、定稿、确认交易）· <b>敏感字段与资料密级</b>（金额/估值/条款/LP 信息能否查看，可访问的最高密级）。AI 始终继承当前用户的权限。${editable ? '' : '<br>你只能查看，不能修改。'}</div>
      <div class="tablebox"><table class="t"><thead><tr><th>岗位</th><th>数据范围</th><th>业务操作</th><th>敏感字段</th><th>密级上限</th><th>AI 参与</th><th>功能</th><th></th></tr></thead><tbody>${r.roles.map(x => `<tr><td><b>${esc(x.name)}</b><div class="dim mono" style="font-size:11px">${esc(x.id)}</div></td><td>${esc(SCOPE[x.scope] ?? x.scope)}</td><td>${x.ops.map(o => `<span class="tag">${esc(r.ops[o] ?? o)}</span>`).join(' ') || '<span class="dim">无</span>'}</td><td>${x.categories.map(c => esc(CAT[c] ?? c)).join('、') || '<span class="dim">全部脱敏</span>'}</td><td>${LEVELS[x.clearance]}</td><td>${AI_L[x.ai]}</td><td class="dim">${x.functions.length} 项</td><td>${editable ? `<button class="btn sm ghost" data-act="role-edit" data-id="${x.id}">编辑</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${editable ? `<button class="btn sm" data-act="role-edit" style="margin-top:10px">${icon('plus', 13)}新增岗位</button>` : ''}`
  },
  // ───────── 流程配置 ─────────
  async workflow(el) {
    S.rolesMeta ??= await get('roles')
    const list = await get('workflows')
    const d = D()
    const sel = S.wfSel && list.find(w => w.id === S.wfSel) ? S.wfSel : list.find(w => w.businessType === 'financial' && w.status === 'published')?.id ?? list[0]?.id
    S.wfSel = sel
    if (!S.wfEdit || S.wfEdit.id !== sel) S.wfEdit = structuredClone(list.find(w => w.id === sel))
    const w = S.wfEdit
    const editable = can('workflow.config') && w.status === 'draft'
    const inUse = d.projects.filter(p => p.workflowId === w.id).length
    el.innerHTML = `<div class="wfwrap"><div class="box wflist"><h3>业务类型与流程版本</h3>${d.businessTypes.map(bt => `<div class="sec" style="margin:8px 0 4px">${esc(bt.name)}</div>${list.filter(x => x.businessType === bt.id).sort((a, b) => b.version - a.version).map(x => `<div class="li2 ${x.id === sel ? 'on' : ''}" data-act="wf-sel" data-id="${x.id}"><span class="grow">v${x.version} · ${esc(x.name)}</span><span class="pill ${x.status === 'published' ? 'st-4' : 'st-0'}">${x.status === 'published' ? '已发布' : '草稿'}</span></div>`).join('')}`).join('')}
        ${can('workflow.config') ? `<button class="btn sm" data-act="bt-add" style="margin-top:10px">${icon('plus', 13)}新增业务类型</button>` : ''}</div>
      <div class="wfed"><div class="row" style="margin-bottom:10px"><input class="input grow" data-wf="name" value="${esc(w.name)}" ${editable ? '' : 'disabled'}><span class="pill ${w.status === 'published' ? 'st-4' : 'st-0'}">v${w.version} · ${w.status === 'published' ? '已发布' : '草稿'}</span>
        ${can('workflow.config') ? `<button class="btn sm" data-act="wf-clone">复制为新版本</button><button class="btn sm" data-act="wf-clone-bt" title="为没有流程的业务类型，以当前流程为模板建立流程">用作其他业务类型的模板</button>${editable ? '<button class="btn sm" data-act="wf-save">保存草稿</button><button class="btn sm pri" data-act="wf-publish">发布</button>' : ''}` : ''}</div>
        <div class="dim" style="font-size:12px;margin-bottom:10px">${w.status === 'published' ? `已发布版本不可修改（${inUse} 个项目在用）；复制为新版本后编辑，发布后新建项目使用新版本，在途项目保持原版本。` : '草稿：修改后保存，确认无误再发布。'}「阶段」是业务所处位置；「工作」是阶段内要完成的成果（可跨阶段反复进行）；「决策节点」是需要有权人员表决的审批或会议，结果可推进、退回补充、暂停或终止。</div>
        ${w.stages.map((s, i) => stageCard(s, i, w, editable)).join('')}
        ${editable ? `<button class="btn" data-act="wf-stage-add">${icon('plus', 14)}新增阶段</button>` : ''}</div></div>`
    if (editable) el.querySelectorAll('[data-wf]').forEach(inp => inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', () => setPath(S.wfEdit, inp.dataset.wf, inp.type === 'checkbox' ? inp.checked : inp.value)))
  },
  // ───────── 密级与敏感字段 ─────────
  security(el) {
    const s = D().settings
    el.innerHTML = `<div class="setgrid"><div class="box"><h3>${icon('lock', 15)}敏感字段</h3><div class="dim" style="font-size:12px;margin-bottom:8px">字段归入敏感类别后，只有被授权查看该类别的岗位能看到原值；其他人（包括 AI）看到脱敏结果。</div>
      ${Object.entries(s.sensitivity.fields).map(([k, c]) => `<div class="row" style="margin-bottom:6px"><span class="mono grow">${esc(k)}</span><select class="select sm" data-sf="${esc(k)}">${opts(Object.entries(CAT), c ?? '', '不敏感')}</select></div>`).join('')}
      <button class="btn sm pri" data-act="sf-save">保存</button></div>
      <div class="box"><h3>${icon('shield', 15)}资料密级规则（按路径自动判定）</h3><div class="dim" style="font-size:12px;margin-bottom:8px">从上到下匹配第一条；人工调整过的资料保留人工密级。密级决定谁能看、以及能否发送给外部模型。</div>
      <div id="mrules">${(s.materialRules ?? []).map((r, i) => `<div class="row" style="margin-bottom:6px"><input class="input sm grow" data-mr="${i}" data-k="pattern" value="${esc(r.pattern)}"><select class="select sm" data-mr="${i}" data-k="level">${opts(LEVELS.map((l, j) => [j, l]), r.level)}</select><button class="btn sm ghost ico" data-act="mr-del" data-i="${i}">${icon('x', 13)}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm" data-act="mr-add">${icon('plus', 13)}新增规则</button><button class="btn sm pri" data-act="mr-save">保存并重新判定</button></div></div></div>`
  },
  // ───────── AI 策略与模型 ─────────
  async ai(el) {
    const d = D()
    const s = d.settings
    const m = d.model
    const pol = s.aiPolicy ?? {}
    const canPolicy = can('ai.policy')
    const models = canPolicy ? await get('models').catch(() => []) : []
    el.innerHTML = `<div class="setgrid"><div class="box"><h3>${icon('bot', 15)}模型路由</h3>
        <div class="kv"><div><span>外部模型</span><b class="${m.cloud.ok ? 'ok' : ''}">${esc(m.cloud.ok ? m.cloud.label : m.cloud.note ?? '未配置')}</b></div><div><span>本地模型</span><b class="${m.local.ok ? 'ok' : ''}">${esc(m.local.ok ? m.local.label : m.local.note ?? '未配置')}</b></div></div>
        <label class="f">路由模式<select class="select" id="mMode" ${canPolicy ? '' : 'disabled'}>${opts([['hybrid', '混合：按资料密级自动选择（推荐）'], ['local', '仅本地：所有内容只交给本机模型'], ['external', '外部优先：仍受密级限制']], s.models.mode)}</select></label>
        <label class="f">密级限制：该密级及以上的资料只交给本地模型<select class="select" id="mLevel" ${canPolicy ? '' : 'disabled'}>${opts([...LEVELS.map((l, i) => [i, `${l}及以上`]), [4, '不限制（全部允许外部模型，需机构授权）']], s.models.sensitiveLevel)}</select></label>
        <label class="f"><span><input type="checkbox" id="mApproved" ${s.models.external?.approved !== false ? 'checked' : ''} ${canPolicy ? '' : 'disabled'}> 机构已批准使用外部模型（取消则全部改为本地 / 离线）</span></label>
        ${models.length ? `<label class="f">外部模型选择（来自 DSH 已配置供应商）<select class="select" id="mChoice">${opts(models.map(x => [`${x.provider}|${x.model}`, `${x.provider} · ${x.name}`]), s.models.external?.provider ? `${s.models.external.provider}|${s.models.external.model}` : '', '自动（优先 DeepSeek V4.1 Flash）')}</select></label>` : `<div class="dim" style="font-size:12px;margin-bottom:8px">${d.mode === 'saas' ? '外部模型由服务端环境变量 DEEPSEEK_API_KEY 配置。' : 'DSH 尚未配置模型供应商：在 DSH 设置 → 模型 中添加 DeepSeek API Key 后，这里可以选择模型。'}</div>`}
        <label class="f">本地模型地址（OpenAI 兼容，仅限本机回环地址）<input class="input mono" id="mLocalUrl" value="${esc(s.models.local?.baseURL ?? '')}" placeholder="http://127.0.0.1:11434/v1" ${canPolicy ? '' : 'disabled'}></label>
        <label class="f">本地模型名称<input class="input mono" id="mLocalModel" value="${esc(s.models.local?.model ?? '')}" placeholder="qwen2.5:14b" ${canPolicy ? '' : 'disabled'}></label>
        ${canPolicy ? '<button class="btn sm pri" data-act="models-save">保存</button>' : ''}</div>
      <div class="box"><h3>${icon('shield', 15)}AI 参与级别</h3><div class="dim" style="font-size:12px;margin-bottom:8px">实际级别 = 岗位级别，再按业务类型、工作类型、资料密级逐项取较低值。AI 永远不能表决、审批、定稿、推进阶段。</div>
        <div class="sec" style="margin-top:0">按业务类型上限</div>${d.businessTypes.map(b => `<div class="row" style="margin-bottom:5px"><span class="grow">${esc(b.name)}</span><select class="select sm" data-ap="businessTypes" data-k="${esc(b.id)}" ${canPolicy ? '' : 'disabled'}>${opts(AI_L.map((l, i) => [i, l]), pol.businessTypes?.[b.id] ?? '', '不限制')}</select></div>`).join('')}
        <div class="sec">按工作类型上限</div>${Object.keys(d.workTypes).map(k => `<div class="row" style="margin-bottom:5px"><span class="grow">${esc(k)}</span><select class="select sm" data-ap="workTypes" data-k="${esc(k)}" ${canPolicy ? '' : 'disabled'}>${opts(AI_L.map((l, i) => [i, l]), pol.workTypes?.[k] ?? '', '不限制')}</select></div>`).join('')}
        <div class="sec">按资料密级上限</div>${LEVELS.map((l, i) => `<div class="row" style="margin-bottom:5px"><span class="grow">${l}</span><select class="select sm" data-ap="levels" data-k="${i}" ${canPolicy ? '' : 'disabled'}>${opts(AI_L.map((x, j) => [j, x]), pol.levels?.[i] ?? '', '不限制')}</select></div>`).join('')}
        ${canPolicy ? '<button class="btn sm pri" data-act="aipol-save">保存策略</button>' : ''}</div></div>`
  },
  // ───────── 集成 ─────────
  async integrations(el) {
    const d = D()
    const s = d.settings
    const sec = await get('secrets').catch(() => ({}))
    const w = d.wisburg
    const PT = { wecom: '企业微信群机器人', feishu: '飞书群机器人', dingtalk: '钉钉群机器人' }
    el.innerHTML = `<div class="setgrid"><div>
      <div class="box"><h3>${icon('globe', 15)}智堡开放接口</h3><div class="kv"><div><span>状态</span><b class="${w.configured && !w.lastError ? 'ok' : 'bad'}">${w.configured ? (w.lastError ? `异常：${esc(w.lastError.message)}` : `已接入（${esc(w.source)}）`) : '未配置'}</b></div></div>
        <div class="row"><input class="input grow" type="password" id="wkey" placeholder="${w.configured ? '已配置：输入新密钥可替换' : '粘贴智堡 API Key'}" autocomplete="off"><button class="btn sm pri" data-act="secret" data-k="wisburgApiKey" data-src="wkey">保存</button></div>
        <div class="dim" style="font-size:11.5px;margin-top:6px">密钥只保存在本机 ~/.config/investai/secrets.json（权限 600），不进入数据库、日志或安装包。</div></div>
      <div class="box" style="margin-top:12px"><h3>${icon('bell', 15)}消息推送（企业微信 / 飞书 / 钉钉）</h3><div class="dim" style="font-size:12px;margin-bottom:8px">待表决、待审核、晨报、到期提醒等推送到群机器人。Webhook 地址与签名密钥保存在本机密钥文件中。</div>
        ${s.push.channels.map((c, i) => `<div class="pch"><div class="row"><input class="input sm grow" data-pc="${i}" data-k="name" value="${esc(c.name)}"><select class="select sm" data-pc="${i}" data-k="type">${opts(Object.entries(PT), c.type)}</select><label class="dim"><input type="checkbox" data-pc="${i}" data-k="enabled" ${c.enabled ? 'checked' : ''}> 启用</label><button class="btn sm ghost ico" data-act="pc-del" data-i="${i}">${icon('x', 13)}</button></div>
          <div class="row" style="margin-top:6px"><input class="input sm grow" type="password" id="pu-${c.id}" placeholder="${sec[`push.${c.id}.url`] ? 'Webhook 已配置（输入可替换）' : 'Webhook 地址'}"><button class="btn sm" data-act="secret" data-k="push.${c.id}.url" data-src="pu-${c.id}">保存地址</button></div>
          ${c.type !== 'wecom' ? `<div class="row" style="margin-top:6px"><input class="input sm grow" type="password" id="ps-${c.id}" placeholder="${sec[`push.${c.id}.secret`] ? '签名密钥已配置' : '签名密钥（加签校验，可选）'}"><button class="btn sm" data-act="secret" data-k="push.${c.id}.secret" data-src="ps-${c.id}">保存密钥</button></div>` : ''}
          <div class="chips" style="margin-top:6px">${[['approval', '待表决'], ['review', '待审核'], ['decision', '决策结果'], ['brief', '晨报'], ['deadline', '到期提醒'], ['fill', '外部填报']].map(([k, l]) => `<label class="tag"><input type="checkbox" data-pck="${i}" value="${k}" ${!c.kinds?.length || c.kinds.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div>
          <div class="row" style="margin-top:6px"><button class="btn sm" data-act="push-test" data-id="${c.id}">发送测试消息</button></div></div>`).join('') || '<div class="empty">尚未配置推送通道</div>'}
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="pc-add">${icon('plus', 13)}新增通道</button><button class="btn sm pri" data-act="pc-save">保存通道设置</button></div></div></div>
      <div><div class="box"><h3>${icon('user', 15)}统一登录（SaaS 部署）</h3><div class="dim" style="font-size:12px;margin-bottom:8px">OAuth2 授权码 + PKCE。按邮箱 / 账号匹配系统内已有人员，未匹配者拒绝登录（不自动建号）。回调地址：<span class="mono">https://你的域名/sso/callback</span></div>
        <label class="f"><span><input type="checkbox" id="ssoOn" ${s.sso.enabled ? 'checked' : ''}> 启用统一登录</span></label>
        <label class="f">预设<select class="select" id="ssoPreset">${opts(Object.entries(S.meta.ssoPresets).map(([k, p]) => [k, p.name]), s.sso.preset)}</select></label>
        ${['authorizeUrl', 'tokenUrl', 'userinfoUrl', 'clientId', 'scope', 'userField'].map(k => `<label class="f">${{ authorizeUrl: '授权地址', tokenUrl: '令牌地址', userinfoUrl: '用户信息地址', clientId: 'Client ID', scope: 'Scope', userField: '身份字段' }[k]}<input class="input mono sm" id="sso-${k}" value="${esc(s.sso[k] ?? '')}"></label>`).join('')}
        <label class="f">匹配人员字段<select class="select" id="ssoMatch">${opts([['email', '邮箱'], ['username', '账号']], s.sso.matchBy)}</select></label>
        <div class="row"><input class="input sm grow" type="password" id="ssoSecret" placeholder="${sec['sso.clientSecret'] ? 'Client Secret 已配置' : 'Client Secret'}"><button class="btn sm" data-act="secret" data-k="sso.clientSecret" data-src="ssoSecret">保存密钥</button></div>
        <div class="dim" style="font-size:11.5px;margin:6px 0">${esc(S.meta.ssoPresets[s.sso.preset]?.note ?? '')}</div><button class="btn sm pri" data-act="sso-save">保存</button></div>
      <div class="box" style="margin-top:12px"><h3>${icon('link', 15)}toolknit 连接器（可选，默认关闭）</h3>
        <div class="warnbox" style="font-size:12px">toolknit-desktop 使用 PolyForm Noncommercial 1.0.0 许可：<b>商业使用须先取得作者授权</b>。本系统不打包其代码；由管理员自行安装 toolknit CLI 并确认授权后，智能体在「授权执行」级别下可调用其 MCP 工具（工具名前缀 toolknit_）。InvestAI 已自研同类能力：文档解析、Office 生成、结构化提取、会议转写。</div>
        <label class="f"><span><input type="checkbox" id="tkAck" ${s.toolknit.licenseAck ? 'checked' : ''}> 我确认本机构已取得 toolknit 的商业使用授权（或仅用于非商业用途）</span></label>
        <label class="f"><span><input type="checkbox" id="tkOn" ${s.toolknit.enabled ? 'checked' : ''}> 启用连接器</span></label>
        <label class="f">命令<input class="input mono sm" id="tkCmd" value="${esc(s.toolknit.command ?? 'toolknit')}"></label>
        <div class="row"><button class="btn sm pri" data-act="tk-save">保存</button><button class="btn sm" data-act="tk-test">测试连接</button></div><div id="tkOut"></div></div>
      <div class="box" style="margin-top:12px"><h3>${icon('chart', 15)}行情数据源</h3><div class="dim" style="font-size:12.5px">${esc(s.market?.note ?? '')}。当前支持从授权终端导出 CSV 导入（研究与数据 → 行情）；公告与企业研究通过智堡企业研究接口检索。</div></div></div></div>`
  },
  // ───────── 自动化与定时 ─────────
  async automation(el) {
    const s = D().settings
    const logs = await get('logs').catch(() => ({ sched: [], push: [], last: {} }))
    const a = s.automation ?? {}
    el.innerHTML = `<div class="setgrid"><div><div class="box"><h3>${icon('spark', 15)}事件触发</h3>
      ${[['preReview', '成果提交审核时自动进行 AI 预审（引用核对 + 问题清单）'], ['notifyApprovers', '发起决策时通知表决人，并附准入检查结果'], ['autoClassify', '上传 BP 等资料时提示运行结构化提取']].map(([k, l]) => `<label class="f"><span><input type="checkbox" data-auto="${k}" ${a[k] !== false ? 'checked' : ''}> ${l}</span></label>`).join('')}
      <label class="f">任务到期前提醒天数<input class="input sm" type="number" min="0" max="14" data-auto="deadlineDays" value="${a.deadlineDays ?? 2}" style="width:90px"></label><button class="btn sm pri" data-act="auto-save">保存</button></div>
      <div class="box" style="margin-top:12px"><h3>${icon('globe', 15)}智堡关注列表</h3><div class="dim" style="font-size:12px;margin-bottom:6px">定时采集这些关键词的新研报，存入「我的上传/智堡/关键词」，并通知相关项目成员。</div><textarea class="input area" id="watch">${esc((s.watchlist ?? []).join('\n'))}</textarea><button class="btn sm pri" data-act="watch-save">保存</button></div></div>
      <div><div class="box"><h3>${icon('clock', 15)}定时任务</h3>${(s.schedules ?? []).map((x, i) => `<div class="li2"><label><input type="checkbox" data-sch="${i}" data-k="enabled" ${x.enabled ? 'checked' : ''}></label><div class="grow"><b>${esc(x.name)}</b><div class="dim">${x.everyMinutes ? `每 <input class="input sm" style="width:64px" data-sch="${i}" data-k="everyMinutes" value="${x.everyMinutes}"> 分钟` : `每天 <input class="input sm" style="width:72px" data-sch="${i}" data-k="at" value="${esc(x.at)}">`} · 上次 ${logs.last?.[x.id] ? rel(logs.last[x.id]) : '未运行'}</div></div><button class="btn sm" data-act="sch-run" data-id="${x.id}">立即运行</button></div>`).join('')}<button class="btn sm pri" data-act="sch-save" style="margin-top:8px">保存</button></div>
      <div class="box" style="margin-top:12px"><h3>运行记录</h3>${logs.sched.slice(0, 12).map(l => `<div class="li2"><span class="${l.ok ? 'ok' : 'bad'}">${l.ok ? '✓' : '✕'}</span><span class="grow">${esc(l.job)}${l.manual ? '（手动）' : ''} · <span class="dim">${esc(JSON.stringify(l.result ?? l.error ?? '').slice(0, 80))}</span></span><span class="dim">${rel(l.at)}</span></div>`).join('') || empty('暂无')}
        <h3 style="margin-top:12px">推送记录</h3>${logs.push.slice(0, 10).map(l => `<div class="li2"><span class="${l.ok ? 'ok' : 'bad'}">${l.ok ? '✓' : '✕'}</span><span class="grow ell">${esc(l.channel ?? '')} · ${esc(l.title ?? '')}${l.error ? ` · <span class="bad">${esc(l.error)}</span>` : ''}</span><span class="dim">${rel(l.at)}</span></div>`).join('') || empty('暂无')}</div></div></div>`
  },
  // ───────── 审计与回滚 ─────────
  async audit(el) {
    const r = await get('audit')
    el.innerHTML = `<div class="setgrid"><div class="box"><h3>${icon('history', 15)}数据变更（全部可追溯）</h3><div class="tablebox" style="max-height:62vh"><table class="t"><thead><tr><th>对象</th><th>操作</th><th>人员</th><th>时间</th><th></th></tr></thead><tbody>${r.changes.map(h => `<tr><td class="mono" style="font-size:11.5px">${esc(h.coll)}/${esc(String(h.id).slice(0, 14))} r${h.rev}</td><td>${esc(h.reason ?? h.action)}</td><td>${esc(h.actor_name ?? '')}</td><td class="dim">${fmt(h.at)}</td><td>${can('history.rollback') && h.action !== 'delete' ? `<button class="btn sm ghost" data-act="snapshot" data-coll="${esc(h.coll)}" data-id="${esc(h.id)}" data-rev="${h.rev}">快照</button><button class="btn sm ghost" data-act="rollback" data-coll="${esc(h.coll)}" data-id="${esc(h.id)}" data-rev="${h.rev}">回滚</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="box"><h3>${icon('shield', 15)}安全事件（登录、下载、导出、密钥、密级）</h3><div class="tablebox" style="max-height:62vh"><table class="t"><tbody>${r.events.map(e => `<tr><td>${esc(e.action)}</td><td>${esc(e.target ?? '')}${e.detail ? ` <span class="dim">${esc(e.detail)}</span>` : ''}</td><td>${esc(e.user)}</td><td class="dim">${fmt(e.at)}</td></tr>`).join('') || '<tr><td class="dim">暂无</td></tr>'}</tbody></table></div></div></div>`
  },
  // ───────── 评测 ─────────
  async eval(el) {
    const r = await get('eval').catch(() => null)
    el.innerHTML = `<div class="infobox" style="margin-bottom:10px">评测集覆盖：起草引用核对、提取准确率（含缺失/冲突识别）、权限拒绝、敏感字段脱敏、模型路由、会议待办识别。运行命令：<span class="mono">node scripts/eval.mjs</span>（接入真实 DeepSeek 后可对比模型与离线引擎）。</div>
      ${r ? `<div class="kpis">${[['总体通过', `${r.passed}/${r.total}`], ['引用核对率', `${(r.metrics.citeVerified * 100).toFixed(0)}%`], ['提取字段准确率', `${(r.metrics.extractAccuracy * 100).toFixed(0)}%`], ['权限用例', `${r.metrics.permission}`]].map(([l, v]) => `<div class="kpi"><div><div class="v">${esc(v)}</div><div class="l">${l}</div></div></div>`).join('')}</div>
        <div class="dim" style="margin-bottom:8px">运行于 ${fmt(r.at)} · 引擎：${esc(r.engine)}</div>
        <div class="tablebox"><table class="t"><thead><tr><th>用例</th><th>类别</th><th>结果</th><th>说明</th></tr></thead><tbody>${r.cases.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.group)}</td><td class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '通过' : '未通过'}</td><td class="dim">${esc(c.note ?? '')}</td></tr>`).join('')}</tbody></table></div>` : empty('尚未运行评测')}`
  },
}

// ───────── 流程编辑器 ─────────
const KINDS = [['pre', '投前'], ['diligence', '尽调'], ['decision', '决策'], ['execution', '执行'], ['post', '投后'], ['exit', '退出'], ['archive', '归档']]
const GATE_KIND = [['approval', '审批'], ['meeting', '上会表决'], ['sign', '会签确认']]
const RULES = [['any', '任一通过'], ['all', '全体通过'], ['majority', '过半数'], ['two_thirds', '三分之二']]
const ROLES_LIST = () => (S.rolesMeta?.roles ?? []).map(r => [r.id, r.name])
function setPath(obj, path, value) {
  const ks = path.split('.')
  let o = obj
  for (const k of ks.slice(0, -1)) o = o[k] ??= {}
  const last = ks.at(-1)
  o[last] = value === 'true' ? true : value === 'false' ? false : /^(required)$/.test(last) ? !!value : value
}
function stageCard(s, i, w, ed) {
  const dis = ed ? '' : 'disabled'
  const others = w.stages.map(x => [x.id, x.name])
  const g = s.gate
  const outSel = (k, o) => `<select class="select sm" data-act-change="wf-out" data-i="${i}" data-o="${k}" ${dis}>${opts([['', '（无此结果）'], ...others.map(([id, n]) => [id, `→ ${n}`]), ['__complete', '→ 项目完成'], ['__terminate', '→ 终止项目']], o ? (o.complete ? '__complete' : o.terminate ? '__terminate' : o.to) : '')}</select><input class="input sm" style="width:120px" placeholder="状态名" data-wf="stages.${i}.gate.outcomes.${k}.label" value="${esc(o?.label ?? '')}" ${dis || (!o ? 'disabled' : '')}>`
  return `<div class="stagecard"><div class="row"><span class="sn">${i + 1}</span><input class="input sm grow" data-wf="stages.${i}.name" value="${esc(s.name)}" ${dis}><select class="select sm" data-wf="stages.${i}.kind" ${dis}>${opts(KINDS, s.kind)}</select><input class="input sm" style="width:130px" data-wf="stages.${i}.label" value="${esc(s.label ?? '')}" placeholder="项目状态名" ${dis}>
      ${ed ? `<button class="btn sm ghost ico" data-act="wf-move" data-i="${i}" data-d="-1" title="上移">↑</button><button class="btn sm ghost ico" data-act="wf-move" data-i="${i}" data-d="1" title="下移">↓</button><button class="btn sm ghost ico" data-act="wf-stage-del" data-i="${i}" title="删除阶段">${icon('x', 13)}</button>` : ''}</div>
    <div class="sub2"><div class="lbl2">具体工作</div>${(s.works ?? []).map((x, j) => `<div class="row" style="margin-bottom:4px"><select class="select sm grow" data-wf="stages.${i}.works.${j}.work" ${dis}>${opts(Object.keys(D().workTypes).map(k => [k, k]), x.work)}</select><label class="dim"><input type="checkbox" data-wf="stages.${i}.works.${j}.required" ${x.required ? 'checked' : ''} ${dis}> 必做（准入条件）</label><select class="select sm" data-wf="stages.${i}.works.${j}.role" ${dis}>${opts([['pm', '项目经理'], ['analyst', '分析师'], ['finance', '财务'], ['legal', '法务'], ['risk', '风控'], ['postinv', '投后']], x.role)}</select>${ed ? `<button class="btn sm ghost ico" data-act="wf-work-del" data-i="${i}" data-j="${j}">${icon('x', 12)}</button>` : ''}</div>`).join('')}${ed ? `<button class="lnk" data-act="wf-work-add" data-i="${i}">＋ 添加工作</button>` : ''}</div>
    <div class="sub2"><div class="lbl2">决策节点 ${ed ? `<label class="dim"><input type="checkbox" data-act-change="wf-gate" data-i="${i}" ${g ? 'checked' : ''}> 本阶段需要决策</label>` : ''}</div>
      ${g ? `<div class="row" style="flex-wrap:wrap;margin-bottom:6px"><input class="input sm" style="width:160px" data-wf="stages.${i}.gate.name" value="${esc(g.name)}" ${dis}><select class="select sm" data-wf="stages.${i}.gate.kind" ${dis}>${opts(GATE_KIND, g.kind)}</select><select class="select sm" data-wf="stages.${i}.gate.rule" ${dis}>${opts(RULES, g.rule)}</select><select class="select sm" data-wf="stages.${i}.gate.op" ${dis} title="表决人需要具备的业务操作权限">${opts(Object.entries(S.rolesMeta?.ops ?? {}), g.op)}</select></div>
        <div class="row" style="flex-wrap:wrap;margin-bottom:6px"><span class="dim">表决岗位：</span>${ROLES_LIST().map(([id, n]) => `<label class="tag"><input type="checkbox" data-act-change="wf-role" data-i="${i}" value="${id}" ${g.roles.includes(id) ? 'checked' : ''} ${dis}>${esc(n)}</label>`).join('')}</div>
        <div class="row" style="flex-wrap:wrap;margin-bottom:6px"><span class="dim">上会必备材料（须已定稿）：</span>${[...new Set(w.stages.slice(0, i + 1).flatMap(x => (x.works ?? []).map(y => y.work)))].map(k => `<label class="tag"><input type="checkbox" data-act-change="wf-req" data-i="${i}" value="${esc(k)}" ${g.requires?.includes(k) ? 'checked' : ''} ${dis}>${esc(k)}</label>`).join('')}</div>
        <div class="outs">${[['pass', '通过'], ['return', '退回补充'], ['reject', '否决'], ['hold', '继续持有']].map(([k, l]) => `<div class="row"><span style="width:70px">${l}</span>${outSel(k, g.outcomes?.[k])}</div>`).join('')}</div>` : '<div class="dim">无决策节点：完成工作后由负责人推进</div>'}</div></div>`
}
const wfRerender = () => T.workflow($('#sbody'))

Object.assign(ACT, {
  'wf-sel': el => { S.wfSel = el.dataset.id; S.wfEdit = null; wfRerender() },
  'wf-clone': async () => { const w = await act('workflow.clone', { id: S.wfSel }, '已复制为新版本草稿'); if (w) { S.wfSel = w.id; S.wfEdit = null; await hooks.reload({ files: false }); wfRerender() } },
  'wf-save': async () => { if (await act('workflow.save', { def: S.wfEdit }, '草稿已保存')) { S.wfEdit = null; wfRerender() } },
  'wf-publish': async () => {
    await post('workflow.save', { def: S.wfEdit }).catch(e => { toast(e.message, 'deny'); throw e })
    if (!(await confirmBox(`发布 ${S.wfEdit.name} v${S.wfEdit.version}`, '发布后新建项目使用该版本；在途项目继续使用原版本，不受影响。已发布版本不可再修改。', { okText: '发布' }))) return
    if (await act('workflow.publish', { id: S.wfSel }, '已发布')) { S.wfEdit = null; await hooks.reload({ files: false }); wfRerender() }
  },
  'wf-stage-add': () => { S.wfEdit.stages.push({ id: `s_${Math.random().toString(36).slice(2, 7)}`, name: '新阶段', kind: 'pre', label: '', works: [] }); wfRerender() },
  'wf-stage-del': el => { S.wfEdit.stages.splice(Number(el.dataset.i), 1); wfRerender() },
  'wf-move': el => { const i = Number(el.dataset.i), j = i + Number(el.dataset.d); const st = S.wfEdit.stages; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; wfRerender() },
  'wf-work-add': el => { S.wfEdit.stages[el.dataset.i].works = [...(S.wfEdit.stages[el.dataset.i].works ?? []), { work: Object.keys(D().workTypes)[0], required: false, role: 'pm', format: 'docx' }]; wfRerender() },
  'wf-work-del': el => { S.wfEdit.stages[el.dataset.i].works.splice(Number(el.dataset.j), 1); wfRerender() },
  'wf-gate': el => { const s = S.wfEdit.stages[el.dataset.i]; s.gate = el.checked ? { id: `g_${Math.random().toString(36).slice(2, 7)}`, name: `${s.name}审批`, kind: 'approval', op: 'op.pm.confirm', roles: ['head'], rule: 'any', requires: [], outcomes: { pass: { to: S.wfEdit.stages[Number(el.dataset.i) + 1]?.id ?? s.id, label: '通过' }, return: { to: s.id, label: '补充材料' } } } : undefined; wfRerender() },
  'wf-role': el => { const g = S.wfEdit.stages[el.dataset.i].gate; g.roles = el.checked ? [...new Set([...g.roles, el.value])] : g.roles.filter(r => r !== el.value) },
  'wf-req': el => { const g = S.wfEdit.stages[el.dataset.i].gate; g.requires = el.checked ? [...new Set([...(g.requires ?? []), el.value])] : (g.requires ?? []).filter(r => r !== el.value) },
  'wf-out': el => {
    const g = S.wfEdit.stages[el.dataset.i].gate
    const k = el.dataset.o
    const label = g.outcomes?.[k]?.label ?? ''
    g.outcomes ??= {}
    if (!el.value) delete g.outcomes[k]
    else g.outcomes[k] = el.value === '__complete' ? { complete: true, label: label || '已完成' } : el.value === '__terminate' ? { terminate: true, label: label || '放弃项目' } : { to: el.value, label: label || '' }
    wfRerender()
  },
  'wf-clone-bt': async () => {
    const list = await get('workflows')
    const bts = D().businessTypes
    const r = await dialog(`<h3>用作其他业务类型的模板</h3><p>以「${esc(S.wfEdit.name)}」为基础，为目标业务类型建立一份草稿流程；编辑后发布即可在该业务类型下新建项目。</p><label class="f">目标业务类型<select class="select" name="bt">${opts(bts.map(b => [b.id, `${b.name}${list.some(w => w.businessType === b.id && w.status === 'published') ? '' : '（尚无已发布流程）'}`]), bts.find(b => !list.some(w => w.businessType === b.id && w.status === 'published'))?.id)}</select></label><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">建立草稿</button></div>`)
    if (!r) return
    const w = await act('workflow.clone', { id: S.wfSel, businessType: r.bt }, '已建立草稿，请修改后发布')
    if (w) { S.wfSel = w.id; S.wfEdit = null; await hooks.reload({ files: false }); wfRerender() }
  },
  'bt-add': async () => {
    const r = await dialog('<h3>新增业务类型</h3><label class="f">名称<input class="input" name="name" required placeholder="如：S 基金份额转让"></label><label class="f">标识（英文）<input class="input mono" name="id" placeholder="secondary"></label><div class="infobox">创建后，选中任一已有流程点「用作其他业务类型的模板」，为它建立流程并发布。</div><div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">创建</button></div>')
    if (r && await act('businessType.save', r, '已创建')) { await hooks.reload({ files: false }); wfRerender() }
  },
  // 人员与部门
  'user-edit': async el => {
    const users = await get('users')
    const u = users.find(x => x.id === el.dataset.id) ?? { roles: [] }
    const roles = (await get('roles')).roles
    const saas = D().mode === 'saas'
    const r = await dialog(`<h3>${u.id ? '编辑人员' : '新增人员'}</h3><div class="row"><label class="f grow">姓名<input class="input" name="name" value="${esc(u.name ?? '')}" required></label><label class="f grow">职务<input class="input" name="title" value="${esc(u.title ?? '')}"></label></div>
      <div class="row"><label class="f grow">账号<input class="input mono" name="username" value="${esc(u.username ?? '')}" required></label><label class="f grow">邮箱（统一登录匹配）<input class="input" name="email" value="${esc(u.email ?? '')}"></label></div>
      <label class="f">部门<select class="select" name="deptId">${opts(D().depts.map(x => [x.id, x.name]), u.deptId)}</select></label>
      <div class="f">岗位（可多选，权限取并集）<div class="chips">${roles.map(x => `<label class="tag"><input type="checkbox" name="roles" value="${x.id}" data-multi ${u.roles.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</div></div>
      ${saas ? `<label class="f">${u.id ? '重置密码（留空不修改）' : '初始密码'}<input class="input" type="password" name="password" autocomplete="new-password"></label>` : ''}
      ${u.id ? `<label class="f"><span><input type="checkbox" name="disabled" ${u.disabled ? 'checked' : ''}> 停用（立即失效所有登录会话）</span></label>` : ''}
      <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`, { wide: true })
    if (r && await act('user.save', { id: u.id, ...r }, '已保存')) { await hooks.reload({ files: false }); T.org($('#sbody')) }
  },
  'dept-edit': async el => { const d = D().depts.find(x => x.id === el.dataset.id); const name = await askText(d ? '部门改名' : '新增部门', '部门名称', { value: d?.name ?? '', area: false }); if (name && await act('dept.save', { id: d?.id, name, parentId: d?.parentId }, '已保存')) { await hooks.reload({ files: false }); T.org($('#sbody')) } },
  'persona-lock': () => saveSection('desktop', { personaSwitch: !$('#personaLock').checked }),
  'org-save': () => saveSection('org', { ...D().settings.org, name: $('#orgName').value.trim() }),
  'role-edit': async el => {
    const meta = S.rolesMeta ?? await get('roles')
    const x = meta.roles.find(r => r.id === el.dataset.id) ?? { id: '', name: '', functions: ['project.view', 'material.view'], ops: [], scope: 'own', clearance: 1, categories: [], ai: 1 }
    const r = await dialog(`<h3>${x.id ? `岗位：${esc(x.name)}` : '新增岗位'}</h3><div class="row"><label class="f grow">名称<input class="input" name="name" value="${esc(x.name)}" required></label><label class="f grow">标识<input class="input mono" name="id" value="${esc(x.id)}" ${x.id ? 'readonly' : ''} required></label></div>
      <div class="sec">① 功能权限</div><div class="chips">${Object.entries(meta.functions).map(([k, l]) => `<label class="tag"><input type="checkbox" name="functions" value="${k}" data-multi ${x.functions.includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>
      <div class="sec">② 数据范围</div><select class="select" name="scope">${opts(Object.entries(meta.scopes), x.scope)}</select>
      <div class="sec">③ 业务操作权限</div><div class="chips">${Object.entries(meta.ops).map(([k, l]) => `<label class="tag"><input type="checkbox" name="ops" value="${k}" data-multi ${x.ops.includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>
      <div class="sec">④ 敏感字段与资料密级</div><div class="chips">${Object.entries(meta.categories).map(([k, l]) => `<label class="tag"><input type="checkbox" name="categories" value="${k}" data-multi ${x.categories.includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><label class="f grow">可访问的最高密级<select class="select" name="clearance">${opts(LEVELS.map((l, i) => [i, l]), x.clearance)}</select></label><label class="f grow">AI 参与级别<select class="select" name="ai">${opts(AI_L.map((l, i) => [i, l]), x.ai)}</select></label></div>
      <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存</button></div>`, { wide: true })
    if (r && await act('role.save', { ...r, clearance: Number(r.clearance), ai: Number(r.ai) }, '岗位权限已更新（立即生效）')) { S.rolesMeta = null; await hooks.reload({ files: false }); T.roles($('#sbody')) }
  },
  // 密级与敏感字段
  'sf-save': () => saveSection('sensitivity', { fields: Object.fromEntries($$('[data-sf]').map(s => [s.dataset.sf, s.value || null])) }),
  'mr-add': () => { const s = D().settings; s.materialRules = [...(s.materialRules ?? []), { pattern: '新目录/', level: 1 }]; T.security($('#sbody')) },
  'mr-del': el => { D().settings.materialRules.splice(Number(el.dataset.i), 1); T.security($('#sbody')) },
  'mr-save': async () => {
    const rules = D().settings.materialRules.map((r, i) => ({ pattern: $(`[data-mr="${i}"][data-k=pattern]`).value.trim(), level: Number($(`[data-mr="${i}"][data-k=level]`).value) })).filter(r => r.pattern)
    if (await saveSection('materialRules', rules)) { for (const m of D().mounts) await post('mount.rescan', { id: m.id }).catch(() => null); hooks.reload() }
  },
  // AI
  'models-save': async () => {
    const choice = $('#mChoice')?.value
    const [provider, model] = choice ? choice.split('|') : [null, null]
    await saveSection('models', { mode: $('#mMode').value, sensitiveLevel: Number($('#mLevel').value), external: { approved: $('#mApproved').checked, provider: provider || null, model: model || null }, local: { baseURL: $('#mLocalUrl').value.trim(), model: $('#mLocalModel').value.trim() } })
  },
  'aipol-save': async () => {
    const pol = { businessTypes: {}, workTypes: {}, levels: {} }
    for (const s of $$('[data-ap]')) if (s.value !== '') pol[s.dataset.ap][s.dataset.k] = Number(s.value)
    await saveSection('aiPolicy', pol)
  },
  // 集成
  secret: async el => { const inp = $(`#${el.dataset.src}`); const v = inp.value.trim(); if (!v) return toast('请输入内容', 'deny'); if (await act('secret.set', { key: el.dataset.k, value: v }, '已保存到本机密钥文件')) { inp.value = ''; hooks.reload({ files: false }) } },
  'pc-add': () => { const s = D().settings; s.push.channels = [...s.push.channels, { id: Math.random().toString(36).slice(2, 10), name: '投资部群', type: 'feishu', enabled: true, kinds: [] }]; T.integrations($('#sbody')) },
  'pc-del': el => { D().settings.push.channels.splice(Number(el.dataset.i), 1); T.integrations($('#sbody')) },
  'pc-save': () => saveSection('push', { channels: D().settings.push.channels.map((c, i) => ({ ...c, name: $(`[data-pc="${i}"][data-k=name]`).value, type: $(`[data-pc="${i}"][data-k=type]`).value, enabled: $(`[data-pc="${i}"][data-k=enabled]`).checked, kinds: $$(`[data-pck="${i}"]`).filter(x => x.checked).map(x => x.value) })) }),
  'push-test': async el => { const r = await act('push.test', { id: el.dataset.id }); if (r) toast(r.ok ? '测试消息已发送' : `发送失败：${r.error ?? r.status}`, r.ok ? 'ok' : 'deny') },
  'sso-save': () => saveSection('sso', { enabled: $('#ssoOn').checked, preset: $('#ssoPreset').value, ...Object.fromEntries(['authorizeUrl', 'tokenUrl', 'userinfoUrl', 'clientId', 'scope', 'userField'].map(k => [k, $(`#sso-${k}`).value.trim()])), matchBy: $('#ssoMatch').value }),
  'tk-save': () => saveSection('toolknit', { ...D().settings.toolknit, enabled: $('#tkOn').checked, licenseAck: $('#tkAck').checked, command: $('#tkCmd').value.trim() || 'toolknit' }),
  'tk-test': async () => {
    $('#tkOut').innerHTML = '<span class="spin"></span>'
    const r = await act('toolknit.test', {})
    const allow = new Set(D().settings.toolknit?.allowTools ?? [])
    $('#tkOut').innerHTML = r ? `<div class="ok" style="margin-top:8px">已连接 ${esc(r.server?.name ?? '')}：${r.tools.length} 个工具</div><div class="dim" style="font-size:11.5px;margin:4px 0">勾选允许智能体调用的工具（这些工具可访问本机文件，不受本系统权限控制，请只开放必要的）：</div><div class="chips">${r.tools.map(t => `<label class="tag" title="${esc(t.description)}"><input type="checkbox" data-tk="${esc(t.name)}" ${allow.has(t.name) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</div><button class="btn sm pri" data-act="tk-allow" style="margin-top:6px">保存允许的工具</button>` : ''
  },
  'tk-allow': () => saveSection('toolknit', { ...D().settings.toolknit, allowTools: $$('[data-tk]').filter(i => i.checked).map(i => i.dataset.tk) }),
  // 自动化
  'auto-save': () => saveSection('automation', Object.fromEntries($$('[data-auto]').map(i => [i.dataset.auto, i.type === 'checkbox' ? i.checked : Number(i.value)]))),
  'watch-save': () => saveSection('watchlist', $('#watch').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30)),
  'sch-save': () => saveSection('schedules', D().settings.schedules.map((x, i) => ({ ...x, enabled: $(`[data-sch="${i}"][data-k=enabled]`).checked, ...(x.everyMinutes ? { everyMinutes: Math.max(15, Number($(`[data-sch="${i}"][data-k=everyMinutes]`).value) || x.everyMinutes) } : { at: $(`[data-sch="${i}"][data-k=at]`).value || x.at }) }))),
  'sch-run': async el => { toast('运行中…'); const r = await act('schedule.run', { id: el.dataset.id }); if (r) { toast(r.ok ? `完成：${JSON.stringify(r.result).slice(0, 80)}` : `失败：${r.error}`, r.ok ? 'ok' : 'deny'); T.automation($('#sbody')) } },
})
