// DSH 客户端：全局接管 DSH 外观与导航（参照 Codex UI 插件的做法）
// 1) 注册「深蓝投研」主题并设为当前主题 → DSH 侧栏、会话页与插件统一深蓝，无白色边框
// 2) 把工作台各模块注册为 DSH 原生侧栏入口（唯一的左侧导航）
// 3) 工作台是一个常驻 iframe：切换入口只发 postMessage 切视图，不重新加载、不丢输入
window.__ModuleLoader__.load({ id: '@local/investai-desktop', factory: (require) => {
  var module = { exports: {} }
  var React = require('react')
  var h = React.createElement
  var THEME = 'investai-navy'
  var ENTRIES = [
    ['workbench', '工作台', 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    ['pipeline', '项目管理', 'M3 4h18v16H3zM3 9h18M8 4v16'],
    ['meetings', '会议纪要', 'M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3'],
    ['extract', '智能提取', 'M4 4h10l6 6v10H4zM14 4v6h6M8 14h8M8 18h5'],
    ['companies', '公司库', 'M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18'],
    ['research', '研究与数据', 'M4 3h16v18H4zM8 7h8M8 11h8M8 15h5'],
    ['knowledge', '资料库', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM8 7h8M8 11h6'],
    ['templates', '模板与规范', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'],
    ['tasks', '任务', 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18'],
    ['assistant', 'AI 协作助手', 'M12 3v3M8 21h8M5 10a7 7 0 0 1 14 0v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM9.5 12h.01M14.5 12h.01'],
    ['settings', '系统配置', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M19 12l2-1.6-2-3.4-2.4 1-2-1.2L14 3h-4l-.5 2.6-2 1.2-2.4-1-2 3.4 2 1.6-2 1.6 2 3.4 2.4-1 2 1.2.5 2.6h4l.5-2.6 2-1.2 2.4 1 2-3.4z'],
  ]
  var panelId = function (view) { return 'investai-' + view.replace(':', '-') }

  // 深蓝主题：只覆盖别名 token，DSH 自身组件全部跟随
  var TOKENS = {
    '--dsw-alias-bg-base': '#0A1120', '--dsw-alias-bg-layer-1': '#0D1528', '--dsw-alias-bg-layer-2': '#111B30', '--dsw-alias-bg-layer-3': '#15203A',
    '--dsw-alias-bg-overlay': '#15203A', '--dsw-alias-bg-module-platform': '#0D1528', '--dsw-alias-bg-multi-select': '#1B3466',
    '--dsw-alias-border-l1': 'rgba(148,163,184,.08)', '--dsw-alias-border-l2': 'rgba(148,163,184,.13)', '--dsw-alias-border-l2-darkmode-thin': 'rgba(148,163,184,.13)',
    '--dsw-alias-border-l3': 'rgba(148,163,184,.18)', '--dsw-alias-border-l4': 'rgba(148,163,184,.24)',
    '--dsw-alias-label-primary': '#E6ECF5', '--dsw-alias-label-primary-dimmed': '#C5CFDD', '--dsw-alias-label-secondary': '#C5CFDD', '--dsw-alias-label-tertiary': '#8A98AE',
    '--dsw-alias-label-caption': '#5F6E86', '--dsw-alias-label-dimmed': '#3E4C66', '--dsw-alias-label-primary-bluish': '#93C5FD',
    '--dsw-alias-brand-primary': '#3B82F6', '--dsw-alias-brand-text': '#93C5FD', '--dsw-alias-brand-primary-invert': '#FFFFFF',
    '--dsw-alias-button-primary-fill': '#2563EB', '--dsw-alias-button-primary-hover': '#3B82F6', '--dsw-alias-button-primary-dimmed': '#1B3466',
    '--dsw-alias-interactive-bg-hover': 'rgba(59,130,246,.08)', '--dsw-alias-interactive-bg-active': 'rgba(59,130,246,.18)',
    '--dsw-alias-interactive-bg-hover-accent': 'rgba(59,130,246,.14)', '--dsw-alias-interactive-bg-hover-solid': '#15203A',
    '--dsw-alias-toast-bg': '#182543', '--dsw-alias-tooltip-bg': '#1A2744', '--dsw-alias-link': '#60A5FA',
    '--dsw-alias-markdown-code-block': '#0A1120', '--dsw-alias-markdown-code-block-banner': '#111B30', '--dsw-alias-markdown-inline-code': '#15203A',
    '--dsw-specific-sidebar-fill': '#0D1528', '--dsw-specific-sidebar-nav-item-active': '#1C3460', '--dsw-specific-sidebar-nav-item-active-accent': '#60A5FA', '--dsw-specific-sidebar-nav-item-hover': 'rgba(59,130,246,.10)',
    '--dsw-specific-menu': '#15203A', '--dsw-specific-selector': '#15203A', '--dsw-specific-tip': '#1A2744', '--dsw-specific-input-major': '#111B30', '--dsw-specific-login-input': '#111B30',
    '--dsw-specific-bubble': '#1C3460', '--dsw-specific-bubble-highlight': '#24427A',
    '--dsw-alias-button-elevated-fill': '#15203A', '--dsw-alias-button-floating-fill': '#15203A', '--dsw-alias-button-floating-hover': '#1C2A48', '--dsw-alias-button-contrast-fill': '#2563EB',
    '--dsw-alias-button-ghost-active-fill': 'rgba(59,130,246,.14)', '--dsw-alias-button-ghost-active-border': '#2B4F87', '--dsw-alias-button-ghost-active-hover': 'rgba(59,130,246,.2)',
    '--dsw-alias-scrollbar-bg-l1': '#22304C', '--dsw-alias-scrollbar-hover-l1': '#2E4066', '--dsw-alias-scrollbar-bg-l2': '#22304C', '--dsw-alias-scrollbar-hover-l2': '#2E4066',
  }

  // ── 常驻 iframe：覆盖在当前激活面板的占位区域上 ──
  var frame = null
  var active = null
  var currentView = 'workbench'
  var layoutRef = null
  function ensureFrame() {
    if (frame) return frame
    frame = document.createElement('iframe')
    frame.src = '/api/investai?asset=index.html&embedded=1#' + currentView
    frame.title = 'InvestAI 深蓝投研工作台'
    frame.setAttribute('data-investai-frame', '')
    Object.assign(frame.style, { position: 'fixed', border: '0', zIndex: '4', background: '#0A1120', display: 'none', colorScheme: 'dark' })
    document.body.appendChild(frame)
    frame.addEventListener('load', function () { post(currentView) })
    window.addEventListener('message', onMessage)
    return frame
  }
  function post(view) { if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'investai:go', view: view }, location.origin) }
  function place() {
    if (!frame) return
    if (!active || !active.isConnected) { frame.style.display = 'none'; return }
    var r = active.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) { frame.style.display = 'none'; return }
    Object.assign(frame.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
  }
  function onMessage(e) {
    if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || !e.data || e.data.type !== 'investai:view') return
    var view = String(e.data.view)
    var id = panelId(view)
    currentView = view
    try { if (layoutRef) layoutRef.selectPanel(id) } catch (err) { /* 该视图没有侧栏入口时保持当前高亮 */ }
  }
  var timer = 0
  function Panel(props) {
    var ref = React.useRef(null)
    React.useEffect(function () {
      ensureFrame()
      active = ref.current
      if (props.view !== 'assistant') currentView = props.view
      post(props.view)
      place()
      var ro = new ResizeObserver(place)
      ro.observe(ref.current)
      window.addEventListener('resize', place)
      clearInterval(timer)
      timer = setInterval(place, 300) // 侧栏展开/收起动画只改位置不改尺寸时兜底
      return function () {
        ro.disconnect()
        window.removeEventListener('resize', place)
        if (active === ref.current) { active = null; clearInterval(timer); place() }
      }
    }, [props.view])
    return h('div', { ref: ref, style: { width: '100%', height: '100%', background: '#0A1120' } })
  }
  function iconFor(d) {
    return function Icon(p) {
      return h('svg', { width: p.size, height: p.size, viewBox: '0 0 24 24', fill: 'none', stroke: p.active ? '#60A5FA' : 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: d }))
    }
  }

  module.exports.inject = ['slots', 'layout']
  module.exports.apply = function (ctx) {
    var slots = ctx.slots
    layoutRef = ctx.layout
    ENTRIES.forEach(function (e, i) {
      var view = e[0]
      var id = panelId(view)
      ctx.effect(function () {
        return slots.inject('sidebar.panellist', function () {
          return slots.register({ name: 'sidebar.panellist', id: id, order: 10 + i / 100, label: function () { return e[1] } }, iconFor(e[2]))
        })
      }, 'investai: sidebar ' + view)
      ctx.effect(function () {
        return slots.inject('main', function () {
          return slots.register({ name: 'main', key: id }, function () { return h(Panel, { view: view }) })
        })
      }, 'investai: main ' + view)
    })
    // 主题：注册并启用；插件卸载时 DSH 自动回到用户原有主题
    ctx.inject(['theme'], function (c) {
      var dispose = c.theme.register({ id: THEME, colorScheme: 'dark', tokens: TOKENS })
      var apply = function () { try { c.theme.setTheme(THEME) } catch (err) { console.warn('[investai] 主题启用失败', err) } }
      apply()
      // DSH 读取用户已保存的外观设置后会重置偏好；启动后 10 秒内重新应用一次，之后尊重用户在 DSH 设置中的手动切换
      var until = Date.now() + 10000
      var off = c.on('theme/change', function (snap) { if (Date.now() < until && snap.preference !== THEME) apply() })
      c.effect(function () { return function () { off(); dispose() } }, 'investai: theme')
    })
    // 打开 DSH 时直接进入投研项目（DSH 原有会话入口仍在侧栏顶部「新会话」）
    var tries = 0
    var open = setInterval(function () {
      tries++
      try { ctx.layout.selectPanel(panelId('workbench')); clearInterval(open) } catch (err) { if (tries > 40) clearInterval(open) }
    }, 150)
    ctx.effect(function () {
      return function () { clearInterval(open); clearInterval(timer); if (frame) { frame.remove(); frame = null } window.removeEventListener('message', onMessage) }
    }, 'investai: frame')
  }
  return module.exports
} })
