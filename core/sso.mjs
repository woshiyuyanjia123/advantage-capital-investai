// 统一登录（SaaS 服务端）：OAuth2 授权码流程，可对接标准 OIDC 与飞书；企业微信、钉钉按平台文档填写端点。
// 用户按配置字段（邮箱 / 账号 / 工号）匹配到系统内已有人员；未匹配者拒绝登录（不自动建号）。
import { createHash, randomBytes } from 'node:crypto'
import { readSecrets } from './notify.mjs'

export const SSO_PRESETS = {
  oidc: { name: '标准 OIDC', authorizeUrl: '', tokenUrl: '', userinfoUrl: '', scope: 'openid profile email', userField: 'email' },
  feishu: { name: '飞书', authorizeUrl: 'https://passport.feishu.cn/suite/passport/oauth/authorize', tokenUrl: 'https://passport.feishu.cn/suite/passport/oauth/token', userinfoUrl: 'https://passport.feishu.cn/suite/passport/oauth/userinfo', scope: '', userField: 'email' },
  dingtalk: { name: '钉钉', authorizeUrl: 'https://login.dingtalk.com/oauth2/auth', tokenUrl: '', userinfoUrl: '', scope: 'openid', userField: 'email', note: '钉钉令牌与用户信息接口为非标准格式，需按钉钉开放平台文档配置网关后使用' },
  wecom: { name: '企业微信', authorizeUrl: 'https://open.weixin.qq.com/connect/oauth2/authorize', tokenUrl: '', userinfoUrl: '', scope: 'snsapi_base', userField: 'userid', note: '企业微信需通过企业应用 access_token 换取用户身份，建议经内部 OIDC 网关对接' },
}

export function createSso({ db, fetchImpl = fetch }) {
  const states = new Map()
  const cfg = () => db.get('settings', 'main')?.sso ?? {}

  function loginUrl(redirectUri) {
    const c = cfg()
    if (!c.enabled || !c.authorizeUrl || !c.clientId) throw Object.assign(new Error('统一登录未启用或未配置'), { status: 409 })
    const state = randomBytes(18).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    states.set(state, { at: Date.now(), redirectUri, verifier })
    for (const [k, v] of states) if (Date.now() - v.at > 600000) states.delete(k)
    const u = new URL(c.authorizeUrl)
    u.searchParams.set('client_id', c.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('response_type', 'code')
    if (c.scope) u.searchParams.set('scope', c.scope)
    u.searchParams.set('state', state)
    u.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  }

  async function callback(code, state) {
    const c = cfg()
    const st = states.get(state)
    states.delete(state)
    if (!st || Date.now() - st.at > 600000) throw Object.assign(new Error('登录状态已失效，请重新登录'), { status: 400 })
    const secret = (await readSecrets())['sso.clientSecret'] ?? ''
    const tr = await fetchImpl(c.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: st.redirectUri, client_id: c.clientId, client_secret: secret, code_verifier: st.verifier }), signal: AbortSignal.timeout(15000) })
    const tok = await tr.json().catch(() => ({}))
    if (!tr.ok || !tok.access_token) throw Object.assign(new Error(`令牌交换失败：${tok.error_description ?? tok.error ?? tr.status}`), { status: 502 })
    const ur = await fetchImpl(c.userinfoUrl, { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15000) })
    const info = await ur.json().catch(() => ({}))
    const claim = info[c.userField ?? 'email'] ?? info.data?.[c.userField]
    if (!claim) throw Object.assign(new Error(`身份信息缺少字段 ${c.userField}`), { status: 502 })
    const by = c.matchBy ?? 'email'
    const user = db.one('users', u => !u.disabled && String(u[by] ?? (by === 'username' ? u.username : '')).toLowerCase() === String(claim).toLowerCase())
    if (!user) throw Object.assign(new Error(`未找到与「${claim}」对应的系统账号，请联系管理员开通`), { status: 403 })
    return user
  }

  return { loginUrl, callback }
}
