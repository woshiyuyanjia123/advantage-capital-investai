"""本地录音转写（需求 四）：faster-whisper（MIT）。只在本机运行，录音不出本机。
用法：python asr_worker.py <音频文件> <模型目录> [语言=zh] [热词，空格分隔]
输出：一行 JSON：{"ok":true,"language":"zh","duration":秒,"segments":[{"start":秒,"end":秒,"text":"…"}]}
说话人不做猜测（未接入声纹分离），由用户在纪要中确认。
"""
import json
import sys
import time


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "参数不足"}, ensure_ascii=False))
        return
    audio, model_dir = sys.argv[1], sys.argv[2]
    lang = sys.argv[3] if len(sys.argv) > 3 else "zh"
    hotwords = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4].strip() else None
    t0 = time.time()
    try:
        import av
        _open = av.open

        def _compat_open(*args, **kwargs):  # PyAV ≥ 15 移除了 metadata_errors 参数，faster-whisper 仍会传入
            kwargs.pop("metadata_errors", None)
            return _open(*args, **kwargs)

        av.open = _compat_open
        from faster_whisper import WhisperModel
        model = WhisperModel(model_dir, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            audio,
            language=None if lang == "auto" else lang,
            vad_filter=True,
            beam_size=5,
            initial_prompt="以下是投资项目会议的普通话录音，包含公司名称、金额与日期。" + (f"相关词：{hotwords}。" if hotwords else ""),
            hotwords=hotwords,
        )
        out = []
        for s in segments:
            out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()})
            print(json.dumps({"progress": round(s.end, 1)}, ensure_ascii=False), file=sys.stderr, flush=True)
        print(json.dumps({"ok": True, "language": info.language, "duration": round(info.duration, 1), "elapsed": round(time.time() - t0, 1), "segments": out}, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001 — 错误原样回传给界面
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"[:500]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
