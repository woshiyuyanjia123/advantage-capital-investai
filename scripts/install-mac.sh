#!/usr/bin/env bash
# macOS 专属：将 NotebookLM × WorkBuddy 企业 FDE 插件挂载到 macOS 的 DeepSeek Harness (desktop & web profiles)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PLUGIN_ID="@local/investai-desktop"

for PROF in desktop web; do
  PDIR="$DSH_HOME/profiles/$PROF"
  PKG="$PDIR/package.json"
  if [ ! -f "$PKG" ]; then
    continue
  fi
  BAK="$PDIR/.nb-fde-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BAK" "$PDIR/node_modules/@local"
  cp "$PKG" "$BAK/package.json"
  rm -rf "$PDIR/node_modules/@local/investai-desktop"
  ln -s "$DIR" "$PDIR/node_modules/@local/investai-desktop"
  node -e '
    const fs = require("node:fs");
    const pkgPath = process.argv[1];
    const dir = process.argv[2];
    const id = "@local/investai-desktop";
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.dependencies = { ...(pkg.dependencies || {}), [id]: "link:" + dir };
    if (pkg.dsh?.profile?.bundles && !pkg.dsh.profile.bundles.includes(id)) {
      pkg.dsh.profile.bundles.push(id);
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  ' "$PKG" "$DIR"
  echo "[macOS OK] 已挂载插件至 DSH profile: $PROF (备份: $BAK)"
done
echo "macOS 安装完成。重启 DSH Desktop.app 或运行 dsh web 即可生效。"
