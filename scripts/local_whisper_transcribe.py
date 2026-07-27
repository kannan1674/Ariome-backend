#!/usr/bin/env python3
"""Local Whisper → WebVTT for Ariome video captions (no OpenAI API)."""

from __future__ import annotations

import argparse
import os
import sys


def format_vtt_time(seconds: float) -> str:
    total = max(0.0, float(seconds or 0))
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    secs = int(total % 60)
    ms = int(round((total - int(total)) * 1000))
    if ms == 1000:
        secs += 1
        ms = 0
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def cue_field(seg, key: str, default=0):
    if isinstance(seg, dict):
        return seg.get(key, default)
    return getattr(seg, key, default)


def segments_to_vtt(segments) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        start = float(cue_field(seg, "start", 0) or 0)
        end = float(cue_field(seg, "end", 0) or 0)
        text = str(cue_field(seg, "text", "") or "").strip()
        if not text:
            continue
        if end <= start:
            end = start + 0.5
        lines.append(f"{format_vtt_time(start)} --> {format_vtt_time(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio to WebVTT with local Whisper")
    parser.add_argument("--audio", required=True, help="Path to audio file (wav/mp3)")
    parser.add_argument("--output", required=True, help="Path to write .vtt")
    parser.add_argument("--model", default=os.environ.get("LOCAL_WHISPER_MODEL", "base"))
    parser.add_argument("--language", default="", help="Language code, or empty for auto")
    args = parser.parse_args()

    if not os.path.isfile(args.audio):
        print(f"Audio not found: {args.audio}", file=sys.stderr)
        return 1

    try:
        import whisper
    except ImportError:
        print(
            "openai-whisper is not installed. Run: Backend/.venv-whisper/bin/pip install openai-whisper",
            file=sys.stderr,
        )
        return 1

    model = whisper.load_model(args.model)
    language = args.language.strip() or None
    if language in ("auto", "und"):
        language = None

    result = model.transcribe(
        args.audio,
        language=language,
        fp16=False,
        verbose=False,
    )
    segments = result.get("segments") or []
    vtt = segments_to_vtt(segments)
    cue_count = vtt.count("-->")
    if cue_count == 0:
        print("No speech detected", file=sys.stderr)
        return 2

    out_dir = os.path.dirname(os.path.abspath(args.output))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fh:
        fh.write(vtt)

    detected = result.get("language") or language or "en"
    print(f"OK language={detected} cues={cue_count}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
