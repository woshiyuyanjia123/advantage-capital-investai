// DSH 客户端：全局接管 DSH 外观与导航（参照 Codex UI 插件的做法）
// 1) 注册浅色、深色两套主题并启用其中一套 → DSH 侧栏、会话页与插件配色一致
// 2) 把工作台各模块注册为 DSH 原生侧栏入口（唯一的左侧导航）
// 3) 工作台是一个常驻 iframe：切换入口只发 postMessage 切视图，不重新加载、不丢输入
window.__ModuleLoader__.load({ id: '@local/investai-desktop', factory: (require) => {
  var module = { exports: {} }
  var React = require('react')
  var h = React.createElement
  var ENTRIES = [
    ['workbench', '项目', 'M3 4h18v16H3zM3 9h18M8 4v16'],
    ['notebook', '制作台', 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6'],
    ['flowboard', '流程提交', 'M5 6h14M6 8l5 8M18 8l-5 8'],
    ['knowledge', '项目资料源', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM8 7h8M8 11h6'],
    ['settings', '系统与本地API', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M19 12l2-1.6-2-3.4-2.4 1-2-1.2L14 3h-4l-.5 2.6-2 1.2-2.4-1-2 3.4 2 1.6-2 1.6 2 3.4 2.4-1 2 1.2.5 2.6h4l.5-2.6 2-1.2 2.4 1 2-3.4z'],
  ]
  var panelId = function (view) { return 'investai-' + view.replace(':', '-') }

  // 两套主题（纸面浅色、墨色深色）：只覆盖别名 token，DSH 自身组件全部跟随。配色和 app/app.css 里的变量一致
  function tokens(c) {
    return {
      '--dsw-alias-bg-base': c.bg, '--dsw-alias-bg-layer-1': c.bg2, '--dsw-alias-bg-layer-2': c.panel, '--dsw-alias-bg-layer-3': c.card,
      '--dsw-alias-bg-overlay': c.card, '--dsw-alias-bg-module-platform': c.bg2, '--dsw-alias-bg-multi-select': c.accentBg,
      '--dsw-alias-border-l1': c.b1, '--dsw-alias-border-l2': c.b2, '--dsw-alias-border-l2-darkmode-thin': c.b2,
      '--dsw-alias-border-l3': c.b3, '--dsw-alias-border-l4': c.b4,
      '--dsw-alias-label-primary': c.text, '--dsw-alias-label-primary-dimmed': c.text2, '--dsw-alias-label-secondary': c.text2, '--dsw-alias-label-tertiary': c.muted,
      '--dsw-alias-label-caption': c.dim, '--dsw-alias-label-dimmed': c.line2, '--dsw-alias-label-primary-bluish': c.accent,
      '--dsw-alias-brand-primary': c.accent, '--dsw-alias-brand-text': c.accent, '--dsw-alias-brand-primary-invert': c.ink,
      '--dsw-alias-button-primary-fill': c.ink, '--dsw-alias-button-primary-hover': c.inkHover, '--dsw-alias-button-primary-dimmed': c.line2,
      '--dsw-alias-interactive-bg-hover': c.hover, '--dsw-alias-interactive-bg-active': c.press,
      '--dsw-alias-interactive-bg-hover-accent': c.sel, '--dsw-alias-interactive-bg-hover-solid': c.card2,
      '--dsw-alias-link': c.accent,
      '--dsw-alias-markdown-code-block': c.card2, '--dsw-alias-markdown-code-block-banner': c.bg2, '--dsw-alias-markdown-inline-code': c.card2,
      '--dsw-specific-sidebar-fill': c.bg2, '--dsw-specific-sidebar-nav-item-active': c.card, '--dsw-specific-sidebar-nav-item-active-accent': c.accentBg, '--dsw-specific-sidebar-nav-item-hover': c.hover,
      '--dsw-specific-menu': c.card, '--dsw-specific-selector': c.card, '--dsw-specific-input-major': c.card, '--dsw-specific-login-input': c.card,
      '--dsw-specific-bubble': c.card2, '--dsw-specific-bubble-highlight': c.line,
      '--dsw-alias-button-elevated-fill': c.card, '--dsw-alias-button-floating-fill': c.card, '--dsw-alias-button-floating-hover': c.card2, '--dsw-alias-button-contrast-fill': c.ink,
      '--dsw-alias-button-ghost-active-fill': c.sel, '--dsw-alias-button-ghost-active-border': c.accentLine, '--dsw-alias-button-ghost-active-hover': c.sel,
      '--dsw-alias-scrollbar-bg-l1': c.line2, '--dsw-alias-scrollbar-hover-l1': c.dim, '--dsw-alias-scrollbar-bg-l2': c.line2, '--dsw-alias-scrollbar-hover-l2': c.dim,
    }
  }
  var PALETTE = {
    light: { bg: '#F4F2EC', bg2: '#EDEAE2', panel: '#FAF9F5', card: '#FFFFFF', card2: '#F0EEE7', line: '#E1DED4', line2: '#CBC7BA',
      text: '#1B1A17', text2: '#3C3A35', muted: '#6F6C63', dim: '#9B978C', ink: '#1B1A17', inkHover: '#3A3832', onInk: '#FAF9F5',
      accent: '#2D5A4A', accentBg: '#E2EBE5', accentLine: '#A8C1B4', hover: 'rgba(27,26,23,.05)', press: 'rgba(27,26,23,.09)', sel: 'rgba(45,90,74,.09)',
      b1: 'rgba(27,26,23,.07)', b2: 'rgba(27,26,23,.12)', b3: 'rgba(27,26,23,.18)', b4: 'rgba(27,26,23,.26)' },
    dark: { bg: '#121210', bg2: '#171715', panel: '#1A1A17', card: '#1F1E1B', card2: '#282723', line: '#2C2B27', line2: '#403E38',
      text: '#ECE9E0', text2: '#CFCBC0', muted: '#98948A', dim: '#6C6961', ink: '#ECE9E0', inkHover: '#FFFFFF', onInk: '#171715',
      accent: '#86B9A2', accentBg: '#1D2A24', accentLine: '#38554A', hover: 'rgba(255,255,255,.055)', press: 'rgba(255,255,255,.1)', sel: 'rgba(134,185,162,.13)',
      b1: 'rgba(255,255,255,.06)', b2: 'rgba(255,255,255,.1)', b3: 'rgba(255,255,255,.16)', b4: 'rgba(255,255,255,.24)' },
  }
  var THEME_ID = { light: 'investai-paper', dark: 'investai-ink' }
  function mode() { try { return localStorage.getItem('investai.theme') === 'dark' ? 'dark' : 'light' } catch (err) { return 'light' } }
  var setHostTheme = null

  // ── 常驻 iframe：覆盖在当前激活面板的占位区域上 ──
  var frame = null
  var active = null
  var currentView = 'workbench'
  var layoutRef = null
  function ensureFrame() {
    if (frame) return frame
    frame = document.createElement('iframe')
    frame.src = '/api/investai?asset=index.html&embedded=1#' + currentView
    frame.title = '项目工作台'
    frame.setAttribute('data-investai-frame', '')
    Object.assign(frame.style, { position: 'fixed', border: '0', zIndex: '4', background: PALETTE[mode()].bg, display: 'none', colorScheme: mode() })
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
    if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || !e.data) return
    // 工作台里切了深浅色：外壳跟着切
    if (e.data.type === 'investai:theme') {
      var m = e.data.theme === 'dark' ? 'dark' : 'light'
      Object.assign(frame.style, { background: PALETTE[m].bg, colorScheme: m })
      if (setHostTheme) setHostTheme(m)
      return
    }
    if (e.data.type !== 'investai:view') return
    var view = String(e.data.view)
    var id = panelId(view)
    currentView = view
    try { if (layoutRef) layoutRef.selectPanel(id) } catch (err) { /* 该视图没有侧栏入口时保持当前高亮 */ }
  }
  var timer = 0
  // 已挂载的面板占位：DSH 0.1.x 切换面板时重新挂载组件；0.2.x 让所有面板常驻、只隐藏未选中的。
  // 因此以「当前可见的那个占位」判断用户选中了哪个视图，两种版本都适用。
  var mounted = []
  function visible(el) { if (!el || !el.isConnected) return false; var r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 }
  function sync() {
    var shown = null
    for (var i = 0; i < mounted.length; i++) if (visible(mounted[i].el)) { shown = mounted[i]; break }
    if (shown && shown.el !== active) {
      active = shown.el
      if (shown.view !== 'assistant') currentView = shown.view
      post(shown.view)
    }
    if (!shown) active = null
    place()
  }
  function Panel(props) {
    var ref = React.useRef(null)
    React.useEffect(function () {
      ensureFrame()
      var entry = { el: ref.current, view: props.view }
      mounted.push(entry)
      active = null
      sync()
      var ro = new ResizeObserver(sync)
      ro.observe(ref.current)
      window.addEventListener('resize', sync)
      if (!timer) timer = setInterval(sync, 250) // 面板显隐与侧栏动画不一定触发尺寸事件，定时兜底
      return function () {
        ro.disconnect()
        window.removeEventListener('resize', sync)
        mounted = mounted.filter(function (m) { return m !== entry })
        if (active === entry.el) active = null
        if (!mounted.length) { clearInterval(timer); timer = 0 }
        place()
      }
    }, [props.view])
    return h('div', { ref: ref, style: { width: '100%', height: '100%', background: PALETTE[mode()].bg } })
  }
  function iconFor(d) {
    return function Icon(p) {
      return h('svg', { width: p.size, height: p.size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.active ? 2.1 : 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: d }))
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
    // 主题：注册两套并启用当前选的那套；插件卸载时 DSH 自动回到用户原有主题
    ctx.inject(['theme'], function (c) {
      var disposers = ['light', 'dark'].map(function (m) { return c.theme.register({ id: THEME_ID[m], colorScheme: m, tokens: tokens(PALETTE[m]) }) })
      var until = Date.now() + 10000
      var apply = function (m) { try { c.theme.setTheme(THEME_ID[m || mode()]) } catch (err) { console.warn('[investai] 主题启用失败', err) } }
      setHostTheme = function (m) { until = Date.now() + 2000; apply(m) }
      apply()
      // DSH 读取用户已保存的外观设置后会重置偏好；启动后 10 秒内重新应用一次，之后尊重用户在 DSH 设置中的手动切换
      var off = c.on('theme/change', function (snap) { if (Date.now() < until && snap.preference !== THEME_ID[mode()]) apply() })
      c.effect(function () { return function () { off(); setHostTheme = null; disposers.forEach(function (d) { d() }) } }, 'investai: theme')
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
