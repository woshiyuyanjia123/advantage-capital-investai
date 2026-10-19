// 把仓库根目录的程序（core/ app/ fixtures/）复制到 desktop/app-src，供 Electron 打包。
import { cp, rm, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const out = join(here, '..', 'app-src')
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
for (const d of ['core', 'app', 'fixtures']) await cp(join(root, d), join(out, d), { recursive: true })
console.log('[prepare] 已复制 core/ app/ fixtures/ →', out)
