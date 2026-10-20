#!/bin/sh
# 安装本机会议转写引擎（faster-whisper small，CPU 运行，录音不出本机）。需要 uv（https://docs.astral.sh/uv/）。
#   sh scripts/setup-asr.sh          # 安装到 ~/.dsh/investai-runtime（DSH_HOME 或 INVESTAI_RUNTIME 可改路径）
# 模型约 480MB，来自 Hugging Face「Systran/faster-whisper-small」（MIT 许可）。
set -e
RT="${INVESTAI_RUNTIME:-${DSH_HOME:-$HOME/.dsh}/investai-runtime}"
command -v uv >/dev/null 2>&1 || { echo "未找到 uv：请先安装 https://docs.astral.sh/uv/"; exit 1; }
uv venv --python 3.12 "$RT/asr-venv"
uv pip install --python "$RT/asr-venv/bin/python" "faster-whisper==1.2.1" requests
# 模型目录经环境变量传给 Python，路径中有引号或空格也不会被当作代码
INVESTAI_ASR_MODEL_DIR="$RT/models/faster-whisper-small" "$RT/asr-venv/bin/python" -c "import os; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', local_dir=os.environ['INVESTAI_ASR_MODEL_DIR'])"
echo "转写引擎已就绪：$RT"
