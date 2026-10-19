// 打包后处理（electron-builder afterPack）。在 macOS 上就能同时产出 Mac 和 Windows 安装包，不需要 Wine。
//   macOS：没有 Apple 开发者证书时对整个应用做 ad-hoc 签名（Apple 芯片要求程序至少有有效签名，否则无法启动）。
//          有正式证书时（设置 CSC_LINK / CSC_NAME）electron-builder 会自行签名，本步骤跳过。
//   Windows：用 resedit（纯 JS）把图标和版本信息写进 InvestAI.exe（signAndEditExecutable 关闭后 electron-builder 不再写入）。
const { execFileSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

function adhocSign(app) {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed  ${app}`)
}

async function brandExe(exePath, { icon, version, productName, description, copyright }) {
  const ResEdit = await import('resedit')
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true })
  const res = ResEdit.NtExecutableResource.from(exe)
  const iconFile = ResEdit.Data.IconFile.from(readFileSync(icon))
  for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries))
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, iconFile.icons.map(i => i.data))
  const [major, minor, patch] = version.split('.').map(Number)
  for (const vi of ResEdit.Resource.VersionInfo.fromEntries(res.entries)) {
    for (const { lang, codepage } of vi.getAllLanguagesForStringValues())
      vi.setStringValues({ lang, codepage }, {
        ProductName: productName, FileDescription: description, CompanyName: productName, LegalCopyright: copyright,
        InternalName: productName, OriginalFilename: `${productName}.exe`, FileVersion: version, ProductVersion: version,
      })
    vi.setFileVersion(major, minor, patch, 0)
    vi.setProductVersion(major, minor, patch, 0)
    vi.outputToResourceEntries(res.entries)
  }
  res.outputResource(exe)
  writeFileSync(exePath, Buffer.from(exe.generate()))
  console.log(`  • branded exe    ${exePath}`)
}

exports.default = async function afterPack(context) {
  const { appInfo } = context.packager
  if (context.electronPlatformName === 'darwin' && !process.env.CSC_LINK && !process.env.CSC_NAME)
    adhocSign(path.join(context.appOutDir, `${appInfo.productFilename}.app`))
  if (context.electronPlatformName === 'win32')
    await brandExe(path.join(context.appOutDir, `${appInfo.productFilename}.exe`), {
      icon: path.join(context.packager.info.projectDir, 'build', 'icon.ico'),
      version: appInfo.version, productName: appInfo.productName,
      description: 'InvestAI 投研工作台', copyright: appInfo.copyright,
    })
}
