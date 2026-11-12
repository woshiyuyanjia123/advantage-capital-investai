// 把仓库根目录的程序（core/ app/ fixtures/）复制到 desktop/app-src，供 Electron 打包。
import { cp, rm, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const out = join(here, '..', 'app-src')
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
for (const d of ['core', 'app', 'fixtures', 'lib']) await cp(join(root, d), join(out, d), { recursive: true })
for (const f of ['package.json', 'cordis.patch.yml']) await cp(join(root, f), join(out, f))
// 会议转写引擎的安装脚本（界面会给出带本应用数据目录的完整命令）
await mkdir(join(out, 'scripts'), { recursive: true })
for (const f of ['setup-asr.sh', 'setup-asr.ps1']) await cp(join(root, 'scripts', f), join(out, 'scripts', f))
// 演示账号与权限说明（菜单「账户」可打开）
await cp(join(root, 'docs', 'accounts'), join(out, 'docs', 'accounts'), { recursive: true })
console.log('[prepare] 已复制 core/ app/ fixtures/ scripts/setup-asr.* docs/accounts/ →', out)

// 后端用到的依赖（docx、exceljs、pdfjs-dist、pptxgenjs）直接装在 app-src 里，随 app-src 原样打包。
// 不放在 desktop/package.json 的 dependencies 里让 electron-builder 去收集：它遇到同一个包的两个版本
// （exceljs → archiver → lazystream 要 readable-stream 2，别处要 3）会把嵌套的那份换成外层的版本，
// 装出来的程序一启动就报 Cannot find module 'readable-stream/passthrough'。
await cp(join(root, 'package-lock.json'), join(out, 'package-lock.json')).catch(() => {})
const { execSync } = await import('node:child_process')
execSync('npm install --omit=dev --omit=optional --no-audit --no-fund --ignore-scripts', { cwd: out, stdio: 'inherit' })
// 装好后实际加载一遍，缺文件就在打包前报出来
for (const m of ['exceljs', 'pptxgenjs', 'docx', 'pdfjs-dist/legacy/build/pdf.mjs']) {
  execSync(`node -e "import('${m}').then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})"`, { cwd: out, stdio: ['ignore', 'ignore', 'inherit'] })
}
console.log('[prepare] 依赖已装到 app-src/node_modules 并通过加载检查')
