#!/bin/sh
# 安装 InvestAI 到 DSH 的某个 profile（默认 web）。使用 DSH 官方插件管理器（dsh plugin → pnpm）。
#   sh scripts/install-dsh.sh            # 安装到 web profile，之后运行：dsh web
#   sh scripts/install-dsh.sh myprofile  # 安装到自定义 profile
#   sh scripts/install-dsh.sh --remove   # 从 web profile 卸载
# DSH 桌面版（Electron）的 desktop profile 由应用自己管理：在 DSH 桌面版「设置 → 插件」中添加
#   本目录路径，或 release/ 下的 .tgz 包。
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
command -v dsh >/dev/null 2>&1 || { echo "未找到 dsh 命令：请先安装 DeepSeek Harness CLI，或在 DSH 源码目录用 pnpm dsh 代替。"; exit 1; }
if [ "$1" = "--remove" ]; then
  dsh plugin --profile "${2:-web}" remove @local/investai-desktop
  exit 0
fi
PROFILE=${1:-web}
dsh plugin --profile "$PROFILE" add "$DIR"
echo "已安装到 profile「$PROFILE」。启动：dsh --profile $PROFILE  数据目录：~/.dsh/investai"
