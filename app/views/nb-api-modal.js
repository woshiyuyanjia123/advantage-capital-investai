// NotebookLM 风格一键 API 连接面板（支持完全断网调用本机 Ollama/LM Studio/vLLM、DSH 宿主模型或云端 API）
import { D, ACT, hooks, $, esc, icon, get, act, dialog, toast, opts } from '/api/investai?asset=ui.js'

export async function openApiConnectModal() {
  const d = D()
  const s = d.settings.models ?? {}
  const probe = await get('nb.local.probe', { url: s.local?.baseURL ?? '' }).catch(() => ({ presets: [], models: [] }))
  const cloudModels = await get('models').catch(() => [])
  const localHints = probe.models.length
    ? probe.models.map(m => `<button type="button" class="tag blue" data-pick-url="${esc(m.baseURL)}" data-pick-m="${esc(m.model)}">${esc(m.model)}</button>`).join(' ')
    : '<span class="dim">未探测到运行中的本机端口（可离线手动填写 Ollama 11434 / LM Studio 1234 / 直接用内置离线引擎）</span>'
  const r = await dialog(`<h3>${icon('globe', 16)} 连接模型 API（支持断网本地 API / DSH / 云端）</h3>
    <div class="infobox" style="font-size:12px">像 NotebookLM 一样即连即用：断网环境选<b>「仅本地离线 API」</b>直连本机 Ollama / LM Studio / vLLM（或零依赖内置离线引擎）；联网可选 DSH 宿主模型或云端 API。</div>
    <label class="f">运行路由模式<select class="select" name="mode">${opts([['hybrid', '智能混合（优先已连接 API，机密可走本地）'], ['local', '仅本地离线 API（不联网，数据不出本机）'], ['external', '云端 / DSH API 优先']], s.mode)}</select></label>
    <div class="box" style="margin:8px 0"><b>① 本地离线 API（无需联网）</b><div style="margin:6px 0">${localHints}</div>
      <div class="row"><label class="f grow">本机地址<input class="input mono sm" name="localBaseURL" id="nbLocUrl" value="${esc(s.local?.baseURL || 'http://127.0.0.1:11434/v1')}" placeholder="http://127.0.0.1:11434/v1"></label>
      <label class="f grow">本地模型名<input class="input mono sm" name="localModel" id="nbLocMod" value="${esc(s.local?.model || 'qwen2.5:14b')}" placeholder="qwen2.5:14b / deepseek-r1:8b"></label></div></div>
    <div class="box"><b>② 云端 / DSH 模型 API</b>
      <div class="row"><label class="f grow">接入来源<select class="select sm" name="source">${opts([['auto', d.mode === 'dsh' ? '优先复用 DSH 宿主已配模型' : 'DeepSeek 官方 API'], ['custom', '自定义 OpenAI 兼容 / DeepSeek Key']], s.external?.source || 'auto')}</select></label>
      <label class="f grow">预设模型<select class="select sm" name="model">${opts(cloudModels.map(x => [x.model, `${x.provider} · ${x.name}`]), s.external?.model || 'deepseek-flash')}</select></label></div>
      <div class="row"><label class="f grow">自定义 Base URL（可选）<input class="input mono sm" name="customBaseURL" value="${esc(s.external?.customBaseURL || 'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"></label>
      <label class="f grow">自定义模型 ID（可选）<input class="input mono sm" name="customModel" value="${esc(s.external?.customModel || '')}" placeholder="deepseek-flash / gpt-4.1"></label></div>
      <label class="f">API Key（仅存本机加密文件，留空保持原配置）<input class="input sm" type="password" name="apiKey" autocomplete="off" placeholder="${d.model?.cloud?.ok ? '已连接，输入新 Key 可替换' : 'sk-...'}"></label></div>
    <label class="f"><span><input type="checkbox" name="test" checked> 保存后立即验证 API 连通性</span></label>
    <div class="acts"><button class="btn" data-dlg="no">取消</button><button class="btn pri" data-dlg="ok">保存并连接</button></div>`, { wide: true })
  if (!r) return
  const res = await act('nb.api.connect', r)
  if (res) {
    toast(res.ok ? `✅ 已连接：${res.label ?? '模型就绪'}${res.ms ? `（${res.ms}ms）` : ''}` : `已保存设置（当前状态：${res.error || res.note || '离线引擎兜底'}）`, res.ok ? 'ok' : '')
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
