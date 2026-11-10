// InvestAI 独立桌面版（Electron）。
// 与 DeepSeek Harness 互不冲突：独立的应用 ID、数据目录（系统「应用数据」下的 InvestAI）、单实例锁；
// 内置服务只监听 127.0.0.1：首次由系统分配空闲端口，之后优先沿用（界面的本地存储按地址区分，端口变了导览等会重置）；
// 被其他程序占用时再换一个空闲端口，不占用 3080 / 3999 等固定端口。
// 两种模式：本机模式（单用户、可切换演示身份）与登录模式（多人账号，演示密码见 docs/accounts 下的 Excel）。
const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const TITLE = '优势资本 · 智能投研工作台'

function syncDshPlugin(silent = false) {
  try {
    const dshHome = process.env.DSH_HOME || path.join(require('node:os').homedir(), '.dsh')
    const pluginDir = path.join(__dirname, 'app-src')
    const spec = 'link:' + pluginDir.replace(/\\/g, '/')
    const id = '@local/investai-desktop'
    let count = 0
    for (const prof of ['desktop', 'web']) {
      const pkgPath = path.join(dshHome, 'profiles', prof, 'package.json')
      if (!fs.existsSync(pkgPath)) continue
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const linkDir = path.join(dshHome, 'profiles', prof, 'node_modules', '@local', 'investai-desktop')
      fs.mkdirSync(path.dirname(linkDir), { recursive: true })
      try { if (fs.lstatSync(linkDir).isSymbolicLink()) fs.unlinkSync(linkDir) } catch {}
      if (!fs.existsSync(linkDir)) fs.symlinkSync(pluginDir, linkDir, 'junction')
      pkg.dependencies = { ...(pkg.dependencies || {}), [id]: spec }
      if (pkg.dsh?.profile?.bundles && !pkg.dsh.profile.bundles.includes(id)) pkg.dsh.profile.bundles.push(id)
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      count++
    }
    if (!silent) dialog.showMessageBox(win, { title: TITLE, message: count ? `已挂载插件到 ${count} 个本机 DSH Profile，重启 DSH 即可生效。` : '未检测到 ~/.dsh/profiles，当前以本地离线一体模式运行。' })
  } catch (e) { if (!silent) dialog.showErrorBox('DSH 插件挂载失败', String(e.message || e)) }
}
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

const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json')
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } catch { return {} } }
function writePrefs(next) { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...next }, null, 2)) }

/** 上次的端口仍空闲就沿用，否则返回 0（由系统分配）。 */
function freePort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return Promise.resolve(0)
  return new Promise(resolve => {
    const probe = net.createServer()
    probe.once('error', () => resolve(0))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(port)))
  })
}

async function boot() {
  const userData = app.getPath('userData')
  // 密钥、转写环境都放在本应用自己的数据目录，不与 DSH（~/.dsh）或命令行版（~/.config/investai）共用
  process.env.INVESTAI_SECRETS = path.join(userData, 'secrets.json')
  process.env.INVESTAI_RUNTIME = path.join(userData, 'runtime')
  const prefs = readPrefs()
  const { startServer } = await import(pathToFileURL(path.join(__dirname, 'app-src', 'core', 'http.mjs')).href)
  const login = prefs.loginMode === true
  server = await startServer({ dir: path.join(userData, 'data'), desktop: !login, demoAccounts: login, host: '127.0.0.1', port: await freePort(prefs.port) })
  if (server.port !== prefs.port) writePrefs({ port: server.port })
  syncDshPlugin(true)
  buildMenu(userData, login)
  createWindow()
}

async function switchMode(login) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['切换并重新打开', '取消'], defaultId: 0, cancelId: 1, title: TITLE,
    message: login ? '切换到登录模式？' : '切换回本机模式？',
    detail: login
      ? '登录模式下每个人用自己的账号登录，权限按岗位分层。演示账号与初始密码见菜单「账户 → 演示账号与权限（Excel）」。数据与本机模式共用。'
      : '本机模式无需登录，可在右上角切换演示身份。数据与登录模式共用。',
  })
  if (response !== 0) return buildMenu(app.getPath('userData'), !login)
  writePrefs({ loginMode: login })
  app.relaunch()
  app.quit()
}

const accountsXlsx = () => path.join(__dirname, 'app-src', 'docs', 'accounts', 'InvestAI-演示账号与权限.xlsx')

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

function buildMenu(userData, login) {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about', label: `关于 ${TITLE}` }, { type: 'separator' }, { role: 'hide', label: '隐藏' }, { role: 'hideOthers', label: '隐藏其他' }, { type: 'separator' }, { role: 'quit', label: '退出' }] }] : []),
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '视图', submenu: [{ role: 'reload', label: '重新加载' }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }, { role: 'toggleDevTools', label: '开发者工具' }] },
    { label: '账户', submenu: [
      { label: '本机模式（无需登录，可切换演示身份）', type: 'radio', checked: !login, click: () => { if (login) void switchMode(false) } },
      { label: '登录模式（多人账号，按岗位分层权限）', type: 'radio', checked: login, click: () => { if (!login) void switchMode(true) } },
      { type: 'separator' },
      { label: '演示账号与权限（Excel）', click: () => void shell.openPath(accountsXlsx()) },
    ] },
    { label: '帮助', submenu: [{ label: '一键挂载/更新到本机 DSH 插件', click: () => syncDshPlugin(false) }, { label: '打开数据目录', click: () => void shell.openPath(userData) }, { label: '在浏览器中打开', click: () => void shell.openExternal(`${server.url}/api/investai?asset=index.html`) }, ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: '退出' }])] },
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
