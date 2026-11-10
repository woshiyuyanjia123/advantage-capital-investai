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
