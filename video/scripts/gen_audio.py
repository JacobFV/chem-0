#!/usr/bin/env python3
"""Generate scene-by-scene narration via OpenAI TTS.

Voice: 'sage' — contemplative, measured. Model: gpt-4o-mini-tts.
Reads OPENAI_API_KEY from the environment (the repo's .env is sourced
before invocation).

Each scene's text below mirrors SCRIPT.md; if you edit the script, edit
both. Output mp3s land in video/audio/.
"""
from __future__ import annotations
import os
import sys
import json
import pathlib
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "audio"
OUT.mkdir(exist_ok=True)

API_KEY = os.environ.get("OPENAI_API_KEY")
if not API_KEY:
    print("OPENAI_API_KEY not set", file=sys.stderr)
    sys.exit(2)

VOICE = "sage"
MODEL = "gpt-4o-mini-tts"
INSTRUCTIONS = (
    "Slow, measured, contemplative. Like a researcher reading a field "
    "report in a quiet library. Long sentences should breathe; short "
    "fragments should land hard. Never breathless. Lower register, "
    "warm, unhurried. Pause briefly at em-dashes and at line breaks."
)

SCENES: list[tuple[str, str]] = [
    (
        "01_title",
        "A short film about a chemistry that didn't finish. "
        "Recorded from a small lab, in May."
    ),
    (
        "02_question",
        "The question was simple, the way most useful questions are simple. "
        "Could a small, embodied agent learn to see a chemistry — "
        "not name it, not summarize it, not describe its color in fluent English — "
        "but actually measure it, "
        "with its own eyes, its own hands, its own slow contact with the world?"
    ),
    (
        "03_target",
        "The target was a colorimetric test. "
        "A pH strip dipped into an unknown vial. "
        "A color, read against a reference card. "
        "A number, written down. "
        "The whole pipeline of a working scientist, compressed to a single "
        "repeatable gesture — so we could measure whether the agent had it, "
        "or only the appearance of it."
    ),
    (
        "04_approach",
        "Two arms. One camera. A printed reference card. "
        "A short script in the agent's hand: "
        "connect, observe, look, dip, lift, name the color, name the pH. "
        "The pipeline reads, top to bottom, like a small kitchen recipe — "
        "and like every recipe, it depends on the kitchen."
    ),
    (
        "05_architecture",
        "Underneath was a quiet stack. "
        "An Electron console for the human. "
        "A stdio MCP server for the model. "
        "A Node backend that owned experiments, artifacts, and sessions. "
        "A Python bridge that spoke to LeRobot and OpenCV. "
        "A SQLite file that remembered everything. "
        "The control loop was small enough to read in an afternoon. "
        "Which turned out to be the only honest way to debug it."
    ),
    (
        "06_console",
        "The console was the first thing we built and the last thing we trusted. "
        "Cameras on the left. Arms in the middle. The agent's chat on the right. "
        "Every tool the model could call was a button a human could press first. "
        "Nothing the agent did was supposed to be invisible."
    ),
    (
        "07_calibration",
        "And then we tried to calibrate the arms. "
        "Calibration is not an infrastructure detail. "
        "It is the agent's first act of humility before reality — and ours. "
        "Servos that read perfectly in isolation drifted by a degree under load. "
        "A cable channel was reversed. A jumper was missing. "
        "The wrist roll wrapped past its register limit "
        "and the gripper closed on nothing. "
        "We wrote a deterministic walk-through: "
        "Z one, X one, X two, X three, Z two, hand. "
        "Six endpoints. Six small confessions of where the arm actually lives. "
        "Then we wrote it again, in the GUI, for the next person "
        "who would have to do this without us."
    ),
    (
        "08_debugging",
        "Most of the project, in the end, was this: "
        "a port that wouldn't open, a frame that wouldn't decode, "
        "a kinematics solver that wanted a URDF in slightly different units, "
        "a pose table that disagreed with the camera. "
        "The chemistry waited. It is patient that way. "
        "Chemistry has been waiting for centuries."
    ),
    (
        "09_whatwegot",
        "What we got, in the time we had, was the simulation half. "
        "A virtual scene the agent could rehearse in. "
        "A pose table it could trust. "
        "A camera feed that matched what a real camera would see, "
        "in a light that matched the lab. "
        "The arms moved. The colors read. The pipeline closed. "
        "It just didn't close on a real vial."
    ),
    (
        "10_nexttime",
        "If we did this again, "
        "we would spend the first week calibrating, on purpose. "
        "We would treat the URDF as the experiment. "
        "We would record the trajectory, not the answer — "
        "because the trajectory is the object, and the answer is residue. "
        "We would ask the agent to dip a strip into water "
        "before we asked it to dip a strip into anything that mattered. "
        "And we would let the chemistry wait a little longer."
    ),
    (
        "11_end",
        "Chem-zero. A small lab, a smaller agent. Recorded in May. "
        "Thanks for watching."
    ),
]


def tts(text: str, out_path: pathlib.Path) -> int:
    body = json.dumps(
        {
            "model": MODEL,
            "voice": VOICE,
            "input": text,
            "instructions": INSTRUCTIONS,
            "response_format": "mp3",
            # gpt-4o-mini-tts speed range is 0.25..4.0
            "speed": 0.95,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
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
        if out.exists() and out.stat().st_size > 0 and not only:
            print(f"skip {name} ({out.stat().st_size} bytes)")
            continue
        try:
            n = tts(text, out)
            print(f"ok   {name}: {n:>7} bytes")
        except Exception as e:  # pragma: no cover
            print(f"fail {name}: {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
