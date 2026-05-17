#!/usr/bin/env python3
"""Generate scene-by-scene narration via ElevenLabs (Dr. Quibble).

Voice: Dr. Quibble (RDSy0QN68yhrjuOgqzQ4). Model: eleven_multilingual_v2.
Speed: 1.15 (higher WPM, still intelligible on this voice).

The text below is the v3 script — shorter, technically accurate, focused
on showing the real software working. Mirrors SCRIPT.md.
"""
from __future__ import annotations
import os
import sys
import json
import pathlib
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "public" / "audio"
OUT.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not API_KEY:
    print("ELEVENLABS_API_KEY not set", file=sys.stderr)
    sys.exit(2)

VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "RDSy0QN68yhrjuOgqzQ4")
MODEL = "eleven_multilingual_v2"
SETTINGS = {
    "stability": 0.40,
    "similarity_boost": 0.80,
    "style": 0.55,
    "use_speaker_boost": True,
    "speed": 1.15,
}

SCENES: list[tuple[str, str]] = [
    (
        "01_title",
        "chem-zero — a local autonomous chemistry agent driving a pair "
        "of SO-one-oh-one arms. Here's what it actually does."
    ),
    (
        "02_pitch",
        "You type \"pick up vial three and tell me what it is.\" The agent "
        "reasons, calls tools, the arms move, the camera sees, and a row "
        "lands in your local SQLite. All on your laptop. About six hundred "
        "bucks of hardware. All open source."
    ),
    (
        "03_console",
        "The console is one Electron window. Experiments on the left, a "
        "real-time pH plot in the middle, agent chat on the right. Every "
        "event the agent emits — tool calls, deltas, tool responses — "
        "streams into this panel live, with the experiment I-D stamped on "
        "each row."
    ),
    (
        "04_agent",
        "Here's an actual session. User message. The agent streams a plan, "
        "then fires tools — set_position, close_gripper, observe, "
        "infer_vial_ph, record_ph — one after the other. We pipe the "
        "OpenAI Responses A-P-I directly to a local tool registry. Each "
        "tool call is one I-P-C round-trip to the backend, executed "
        "against the arm or the camera, and the result shows up in the "
        "chat in under a second."
    ),
    (
        "05_calibration",
        "Calibration is its own window. We render a ghost setpoint — the "
        "pose the wizard wants you at — and a live arm that follows your "
        "servo readings. You move the real arm into the ghost. Six "
        "endpoints later, we write a new LeRobot calibration J-S-O-N and "
        "the bus stops surprising us."
    ),
    (
        "06_virtual",
        "Same backend drives a three-D virtual-world editor. Dark grid "
        "floor, a gold SO-one-oh-one mesh, blue camera markers, gray "
        "rigid bodies. Drag things in, set positions, run the agent "
        "against the sim using the same tool calls it'd use against "
        "hardware."
    ),
    (
        "07_vision",
        "Vision is honest OpenCV. We find vials with a blue-cap detector, "
        "sample the liquid region below the cap, and classify the "
        "bromothymol-blue hue in H-S-V against a calibrated reference "
        "image — yellow is acid, blue is base. There's also a D-M-M-"
        "probe detector and a multimeter O-C-R step for reading "
        "resistance."
    ),
    (
        "08_bo",
        "Once vision is solid, the agent can plan experiments. This is a "
        "simulated Bayesian-optimization trajectory: pH evolving as the "
        "agent adds N-a-C-l, then dissolved borax, then a vinegar drop. "
        "Each step is a tool sequence — pick, pour, dip, read. The chart "
        "updates as the database does."
    ),
    (
        "09_architecture",
        "Architecture, quickly: Electron renderer; Node backend in the "
        "main process; OpenAI Responses A-P-I for the agent loop; SQLite "
        "for events and artifacts; a Python bridge for LeRobot, placo "
        "I-K, and OpenCV. The same tools are also exposed over standard "
        "I-O M-C-P so external agents like Codex can drive the rig."
    ),
    (
        "10_status",
        "What ships today: the console, calibration, virtual world, "
        "recording and replay, the full vision and I-K stacks. What's "
        "next: closing the loop on real hardware — B-O-driven planning, "
        "identity classification across vinegar, sodium chloride, baking "
        "soda, and borax."
    ),
    (
        "11_close",
        "github dot com slash Jacob-F-V slash chem-zero. Thanks for "
        "watching!"
    ),
]


def tts(text: str, out_path: pathlib.Path) -> int:
    body = json.dumps(
        {
            "text": text,
            "model_id": MODEL,
            "voice_settings": SETTINGS,
            "output_format": "mp3_44100_128",
        }
    ).encode("utf-8")
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
        f"?output_format=mp3_44100_128"
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    out_path.write_bytes(data)
    return len(data)


def main() -> int:
    only = set(sys.argv[1:])
    for name, text in SCENES:
        if only and name not in only:
            continue
        out = OUT / f"{name}.mp3"
        try:
            n = tts(text, out)
            print(f"ok   {name}: {n:>7} bytes")
        except Exception as e:  # pragma: no cover
            try:
                body = e.read().decode("utf-8") if hasattr(e, "read") else ""
            except Exception:
                body = ""
            print(f"fail {name}: {e}  {body[:300]}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
