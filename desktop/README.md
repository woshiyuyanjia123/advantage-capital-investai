# InvestAI 桌面应用（Electron）

把仓库根目录的 `core/`、`app/`、`fixtures/` 打包成独立的 Mac / Windows 应用，不依赖 DSH、Node 或命令行。应用启动时在本机 `127.0.0.1` 的随机空闲端口启动内置服务（与 `node server.mjs --desktop` 相同），窗口加载该地址。

| 文件 | 作用 |
|---|---|
| `main.cjs` | 主进程：单实例锁、数据目录（`app.getPath('userData')`）、启动内置服务、窗口与中文菜单 |
| `scripts/prepare.mjs` | 把 `../core`、`../app`、`../fixtures` 复制到 `app-src/`（打包内容） |
| `scripts/after-pack.cjs` | Mac 无证书时 ad-hoc 签名；Windows 用 resedit 写入图标与版本信息 |
| `build/icon.png` · `build/icon.ico` | 应用图标（`scripts/icon.swift` 生成 png） |

## 开发与打包

```bash
pnpm install          # 依赖安装在本目录（node-linker=hoisted）
pnpm start            # 开发运行
pnpm run dist         # 产出 dist/ 下的 Mac（arm64、x64 dmg）与 Windows（x64 NSIS exe）安装包
```

在 Mac 上即可同时打包两个平台，不需要 Wine。`pnpm run dist:mac` / `dist:win` 只打一个平台。

## 签名

默认产物未使用付费证书：Mac 为 ad-hoc 签名（可在 Apple 芯片上运行，首次需右键打开），Windows 未签名（SmartScreen 需点「仍要运行」）。要去掉这些提示：
- Mac：Apple Developer ID 证书 + 公证，设置 `CSC_LINK`/`CSC_KEY_PASSWORD` 与 `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`，并在 `package.json` 的 `build.mac` 中去掉 `identity: null`、开启 `hardenedRuntime`。
- Windows：代码签名证书，设置 `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`。

## 隔离

应用标识 `com.investai.workbench`、产品名 `InvestAI`，数据在 Mac `~/Library/Application Support/InvestAI`、Windows `%APPDATA%\InvestAI`；端口每次随机。与 DeepSeek Harness 桌面版的标识、数据目录、端口都不重叠，可同时安装运行。PDF 只做文字提取，不打包 `@napi-rs/canvas`（平台相关的渲染库）。
