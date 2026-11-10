// 每项目专属配套文件夹：生成任何成品自动落盘到该项目文件夹，并注册到左下角来源/成品列表（无导出按钮）
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { openWithSystem } from './deliverables.mjs'

export const safeDirName = s => String(s || '未命名项目').replace(/[\\/:*?"<>|]/g, '_').trim()

export async function ensureProjectFolder(db, dir, p) {
  const folderName = `${safeDirName(p.name)}_${p.id}`
  const root = join(dir, '项目专属文件夹', folderName)
  await mkdir(root, { recursive: true })
  return { folderName, root }
}

export async function writeProjectArtifact({ db, kb, dir }, user, p, { fileName, buffer, kind, sourceCount = 0, summary = '' }) {
  const { folderName, root } = await ensureProjectFolder(db, dir, p)
  const cleanName = safeDirName(fileName)
  const fullPath = join(root, cleanName)
  await writeFile(fullPath, buffer)
  const c = p.companyId ? db.get('companies', p.companyId) : null
  const subdir = `项目资料/${c?.short ?? safeDirName(p.name)}/Studio成品`
  const f = await kb.upload('m_nas', cleanName, buffer, { level: 1, by: user.name, subdir })
  const recKey = `artifacts_${p.id}`
  const prev = db.get('kvstate', recKey)?.list ?? []
  const item = {
    id: f.id, fileId: f.id, name: cleanName, ext: extname(cleanName).toLowerCase(),
    kind: kind || 'report', bytes: buffer.length, fullPath, folderPath: root,
    sourceCount, summary, by: user.name, at: Date.now(),
  }
  const next = [item, ...prev.filter(x => x.name !== cleanName)].slice(0, 60)
  db.put('kvstate', { id: recKey, list: next }, { actor: user, reason: `生成成品入夹：${cleanName}`, action: 'artifact' })
  return item
}

export async function listProjectArtifacts(db, dir, p) {
  const { root } = await ensureProjectFolder(db, dir, p)
  const saved = db.get('kvstate', `artifacts_${p.id}`)?.list ?? []
  const files = await readdir(root).catch(() => [])
  const disk = []
  for (const name of files) {
    const fp = join(root, name)
    const st = await stat(fp).catch(() => null)
    if (st?.isFile()) disk.push({ name, fullPath: fp, bytes: st.size, at: st.mtimeMs, ext: extname(name).toLowerCase() })
  }
  return { folderPath: root, items: saved, diskFiles: disk }
}

export function openProjectFolderOrFile(targetPath) {
  openWithSystem(targetPath)
  return { ok: true, opened: targetPath }
}
