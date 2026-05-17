#!/usr/bin/env python3
"""Generate the supporting still images via gpt-image-1.

Outputs land in video/assets/generated/. All images share a base style
prompt to keep the film visually coherent (cream-amber grade, soft daylight
from camera-left, deep charcoal countertop, photo realism, no on-frame
text). One image per file; we ask for a single response and save it.
"""
from __future__ import annotations
import base64
import json
import os
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "assets" / "generated"
OUT.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ.get("OPENAI_API_KEY")
if not API_KEY:
    print("OPENAI_API_KEY not set", file=sys.stderr)
    sys.exit(2)

MODEL = "gpt-image-1"
STYLE = (
    " Photo-realistic, soft daylight from camera-left, deep charcoal "
    "countertop, very shallow depth of field, color graded toward "
    "cream-and-amber, no on-frame text, no logos, no people's faces. "
    "Aesthetic: archival lab photography, print-magazine feel."
)

IMAGES: list[tuple[str, str, str]] = [
    (
        "strip_close.png",
        "1024x1536",
        "A single pH test strip, freshly dipped, lying on dark slate next "
        "to a printed pH 0–14 reference card. The strip's color reads "
        "around pH 4 (amber-yellow). One small drop of water sits beside "
        "it. No hands in frame.",
    ),
    (
        "gripper_over_well.png",
        "1024x1536",
        "Close-up of a small servo gripper holding a pH test strip "
        "directly above a 96-well plate. Focus on the gripper jaws and "
        "the strip's tip. Slight motion blur on the wrist. Cream-toned "
        "daylight.",
    ),
    (
        "two_arms_table.png",
        "1536x1024",
        "Two desktop robotic arms (six degrees of freedom each) mounted "
        "about thirty centimeters apart on a charcoal lab bench. One arm "
        "is holding a paper test strip; the other is holding a small "
        "labeled glass vial. A color-checker chart sits between them in "
        "the background.",
    ),
    (
        "calibration_endpoint.png",
        "1024x1536",
        "A single desktop robotic arm at a fully-lifted calibration "
        "endpoint: shoulder lifted, wrist square to the table, gripper "
        "closed. A soft white card stands behind it. Six small chalk "
        "marks on the table beneath. An open paper notebook lies beside.",
    ),
    (
        "agent_chat_overlay.png",
        "1536x1024",
        "A laptop screen photographed at a slight three-quarter angle, "
        "showing a minimal cream-paper chat panel. A user message reads "
        "'read pH of UNK_3' and an agent reply is below it, in calm "
        "serif type. The lab is faintly reflected in the screen.",
    ),
    (
        "notebook_marginalia.png",
        "1024x1536",
        "An A5 graph-paper lab notebook photographed top-down, with neat "
        "handwritten engineering notes and three faint coffee rings. A "
        "fountain pen rests across the page. Some scribbles read like "
        "rough sketches of a robot arm and brief annotations.",
    ),
    (
        "cover_still.png",
        "1536x1024",
        "Wide framing of a small chemistry rig: a desktop robotic arm in "
        "the foreground, a color-checker chart at mid-frame, pH test "
        "strips fanned out, a 100mL beaker in soft focus. Light from "
        "camera-left.",
    ),
]


def gen(prompt: str, size: str, out_path: pathlib.Path) -> int:
    body = json.dumps(
        {
            "model": MODEL,
            "prompt": prompt + STYLE,
            "size": size,
            "n": 1,
            # gpt-image-1 always returns b64_json (no response_format param)
            "quality": "high",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        payload = json.loads(r.read().decode("utf-8"))
    b64 = payload["data"][0]["b64_json"]
    out_path.write_bytes(base64.b64decode(b64))
    return out_path.stat().st_size


def main() -> int:
    only = set(sys.argv[1:])
    for name, size, prompt in IMAGES:
        if only and name not in only:
            continue
        out = OUT / name
        if out.exists() and out.stat().st_size > 0 and not only:
            print(f"skip {name} ({out.stat().st_size} bytes)")
            continue
        try:
            n = gen(prompt, size, out)
            print(f"ok   {name}: {n:>8} bytes  ({size})")
        except Exception as e:  # pragma: no cover
            print(f"fail {name}: {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
