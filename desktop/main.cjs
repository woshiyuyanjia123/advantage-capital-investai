// InvestAI 独立桌面版（Electron）。
// 与 DeepSeek Harness 互不冲突：独立的应用 ID、数据目录（系统「应用数据」下的 InvestAI）、单实例锁；
// 内置服务只监听 127.0.0.1 上由系统分配的空闲端口，不占用 3080 / 3999 等固定端口。
const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const TITLE = 'InvestAI 投研工作台'
let win = null
let server = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() } })
  app.whenReady().then(boot).catch(fatal)
}

function fatal(e) {
  dialog.showErrorBox(`${TITLE} 启动失败`, String(e?.stack ?? e))
  app.exit(1)
}

async function boot() {
  const userData = app.getPath('userData')
  // 密钥、转写环境都放在本应用自己的数据目录，不与 DSH（~/.dsh）或命令行版（~/.config/investai）共用
  process.env.INVESTAI_SECRETS = path.join(userData, 'secrets.json')
  process.env.INVESTAI_RUNTIME = path.join(userData, 'runtime')
  const { startServer } = await import(pathToFileURL(path.join(__dirname, 'app-src', 'core', 'http.mjs')).href)
  server = await startServer({ dir: path.join(userData, 'data'), desktop: true, port: 0 })
  buildMenu(userData)
  createWindow()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680, title: TITLE, show: false, backgroundColor: '#0A1120',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  const origin = server.url
  const internal = url => url.startsWith(origin) || url === 'about:blank' || url === ''
  // 打印 / 导出 PDF 会打开空白窗口；其他外部链接交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (internal(url)) return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#FFFFFF', title: TITLE } }
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => { if (!internal(url)) { e.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url) } })
  win.on('page-title-updated', e => e.preventDefault())
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { win = null })
  void win.loadURL(`${origin}/api/investai?asset=index.html`)
}

function buildMenu(userData) {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about', label: `关于 ${TITLE}` }, { type: 'separator' }, { role: 'hide', label: '隐藏' }, { role: 'hideOthers', label: '隐藏其他' }, { type: 'separator' }, { role: 'quit', label: '退出' }] }] : []),
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '视图', submenu: [{ role: 'reload', label: '重新加载' }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }, { role: 'toggleDevTools', label: '开发者工具' }] },
    { label: '帮助', submenu: [{ label: '打开数据目录', click: () => void shell.openPath(userData) }, { label: '在浏览器中打开', click: () => void shell.openExternal(`${server.url}/api/investai?asset=index.html`) }, ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: '退出' }])] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('window-all-closed', () => app.quit())
app.on('activate', () => { if (!win && server) createWindow() })
let closing = false
app.on('before-quit', e => {
  if (closing || !server) return
  e.preventDefault()
  closing = true
  server.close().catch(() => {}).finally(() => app.quit())
})
