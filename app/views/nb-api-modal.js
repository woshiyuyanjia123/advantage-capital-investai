// 模型连接弹窗：本机 Ollama / LM Studio / vLLM、DSH 宿主模型或云端 API
import { D, ACT, hooks, $, esc, get, act, dialog, toast, opts, closePopup } from '/api/investai?asset=ui.js'

export async function openApiConnectModal() {
  closePopup()
  const d = D()
  const s = d.settings.models ?? {}
  const probe = await get('nb.local.probe', { url: s.local?.baseURL ?? '' }).catch(() => ({ presets: [], models: [] }))
  const cloudModels = await get('models').catch(() => [])
  const localHints = probe.models.length
    ? probe.models.map(m => `<button type="button" class="tag blue" data-pick-url="${esc(m.baseURL)}" data-pick-m="${esc(m.model)}">${esc(m.model)}</button>`).join('')
    : '<span class="dim">没有探测到本机在运行的模型服务，可以手动填写</span>'
  const curModel = { 'deepseek-v4.1-flash': 'deepseek-flash', 'deepseek-chat': 'deepseek-flash', 'deepseek-reasoner': 'deepseek-flash' }[s.external?.model] || s.external?.model || 'deepseek-flash'
  const fallbackModels = [['deepseek-flash', 'deepseek · DeepSeek V4.1 Flash（推荐）'], ['deepseek-v4-pro', 'deepseek · DeepSeek V4 Pro']]
  const baseOpts = cloudModels.map(x => [x.model, `${x.provider} · ${x.name}`])
  const seenOpts = new Set(baseOpts.map(x => x[0]))
  const modelOpts = [...baseOpts, ...fallbackModels.filter(x => !seenOpts.has(x[0]))]
  const r = await dialog(`<h3>模型连接</h3><div class="nb-api">
    <label class="f">路由<select class="select" name="mode">${opts([['hybrid', '混合：优先已连接的 API，机密底稿走本地'], ['local', '仅本地：不联网，数据不出本机'], ['external', '云端或 DSH 模型优先']], s.mode)}</select></label>
    <div class="grp"><b>本地 API</b><div class="hints">${localHints}</div>
      <div class="two"><label class="f">本机地址<input class="input mono" name="localBaseURL" id="nbLocUrl" value="${esc(s.local?.baseURL || 'http://127.0.0.1:11434/v1')}" placeholder="http://127.0.0.1:11434/v1"></label>
      <label class="f">模型名<input class="input mono" name="localModel" id="nbLocMod" value="${esc(s.local?.model || '')}" placeholder="本机已加载的模型名"></label></div></div>
    <div class="grp"><b>云端或 DSH 模型</b>
      <div class="two"><label class="f">来源<select class="select" name="source">${opts([['auto', d.mode === 'dsh' ? '用 DSH 里已配好的模型' : 'DeepSeek 官方 API'], ['custom', '自定义（OpenAI 兼容）']], s.external?.source || 'auto')}</select></label>
      <label class="f">预设模型<select class="select" name="model">${opts(modelOpts, curModel)}</select></label>
      <label class="f">Base URL<input class="input mono" name="customBaseURL" value="${esc(s.external?.customBaseURL || 'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"></label>
      <label class="f">模型 ID<input class="input mono" name="customModel" value="${esc(s.external?.customModel || '')}" placeholder="选自定义来源时填写（留空按预设模型）"></label></div>
      <label class="f">API Key<input class="input" type="password" name="apiKey" autocomplete="off" placeholder="${d.model?.cloud?.ok ? '已连接，粘贴新密钥（如 sk-...）可替换' : '粘贴纯密钥（如 sk-...），只保存在本机'}"></label></div>
    <label class="nb-check" style="margin-top:6px"><input type="checkbox" class="ck" name="test" checked>保存后测试连接</label></div>
    <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存并连接</button></div>`, { wide: true })
  if (!r) return
  const res = await act('nb.api.connect', r)
  if (res) {
    toast(res.ok ? `已连接：${res.label ?? '模型就绪'}${res.ms ? `（${res.ms}ms）` : ''}` : `连接未就绪：${res.error || res.note || '当前使用离线引擎'}`, res.ok ? 'ok' : 'err')
    await hooks.reload({ files: false })
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-pick-url]')
  if (!b) return
  if ($('#nbLocUrl')) $('#nbLocUrl').value = b.dataset.pickUrl
  if ($('#nbLocMod')) $('#nbLocMod').value = b.dataset.pickM
})
ACT['nb-api'] = openApiConnectModal
