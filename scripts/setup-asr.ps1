# 安装本机会议转写引擎（Windows 版，与 setup-asr.sh 相同）：faster-whisper small，CPU 运行，录音不出本机。需要 uv（https://docs.astral.sh/uv/）。
#   powershell -ExecutionPolicy Bypass -File scripts\setup-asr.ps1                       # 安装到 %USERPROFILE%\.dsh\investai-runtime
#   powershell -ExecutionPolicy Bypass -File scripts\setup-asr.ps1 -Runtime "<目录>"      # 桌面应用：系统配置页会给出带数据目录的完整命令
# 模型约 480MB，来自 Hugging Face「Systran/faster-whisper-small」（MIT 许可）。
param([string]$Runtime = $(if ($env:INVESTAI_RUNTIME) { $env:INVESTAI_RUNTIME } elseif ($env:DSH_HOME) { Join-Path $env:DSH_HOME 'investai-runtime' } else { Join-Path $env:USERPROFILE '.dsh\investai-runtime' }))
$ErrorActionPreference = 'Stop'
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { Write-Host '未找到 uv：请先安装 https://docs.astral.sh/uv/'; exit 1 }
$venv = Join-Path $Runtime 'asr-venv'
$python = Join-Path $venv 'Scripts\python.exe'
uv venv --python 3.12 $venv
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
uv pip install --python $python 'faster-whisper==1.2.1' requests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# 模型目录经环境变量传给 Python，避免路径中的反斜杠、空格被当作代码解析
$env:INVESTAI_ASR_MODEL_DIR = Join-Path $Runtime 'models\faster-whisper-small'
& $python -c "import os; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', local_dir=os.environ['INVESTAI_ASR_MODEL_DIR'])"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "转写引擎已就绪：$Runtime"
