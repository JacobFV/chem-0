#!/usr/bin/env python3
"""Analyse a camera frame: detect vials, infer pH from bromothymol blue,
and identify reagents. Outputs JSONL results.

Usage:
    PYTHONPATH=src/lib .venv/bin/python src/lib/chem0/analyse_vials.py
    PYTHONPATH=src/lib .venv/bin/python src/lib/chem0/analyse_vials.py --camera 0 --output results.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from chem0.vision import (
        capture_frame,
        find_vials,
        infer_vial_ph,
        infer_vial_identity,
        calibrate_ranges_from_reference,
        annotate_frame,
        save_frame,
    )
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from chem0.vision import (
        capture_frame,
        find_vials,
        infer_vial_ph,
        infer_vial_identity,
        calibrate_ranges_from_reference,
        annotate_frame,
        save_frame,
    )


def analyse(
    camera_id: int = 0,
    output: str | None = None,
    annotate: bool = False,
    max_vials: int = 6,
) -> list[dict]:
    """Capture a frame, detect vials, infer pH and identity.

    Returns a list of result dicts. Writes JSONL to *output* if given.
    """
    # Calibration report
    ref = calibrate_ranges_from_reference()
    sys.stderr.write(json.dumps({"event": "reference_calibration", "patches": ref["num_patches"]}) + "\n")

    # Capture
    frame = capture_frame(camera_id=camera_id)
    path = save_frame(frame)
    sys.stderr.write(json.dumps({"event": "frame_captured", "path": path}) + "\n")

    # Detect vials
    vials = find_vials(frame, max_vials=max_vials)
    sys.stderr.write(json.dumps({"event": "vials_detected", "count": len(vials)}) + "\n")

    results: list[dict] = []
    for i, vial in enumerate(vials[:max_vials]):
        ph = infer_vial_ph(frame, vial)
        identity = infer_vial_identity(ph)
        record = {
            "vial_index": i,
            "position_px": {"x": vial.x, "y": vial.y, "w": vial.w, "h": vial.h},
            "centre_px": {"x": round(vial.centre[0], 1), "y": round(vial.centre[1], 1)},
            "area_px": round(vial.area),
            "ph_estimate": ph.ph,
            "indicator_colour": ph.colour,
            "colour_confidence": round(ph.confidence, 3),
            "pixel_counts": ph.pixel_counts,
            "inferred_identity": identity["identity"],
            "identity_confidence": identity["confidence"],
        }
        results.append(record)
        sys.stderr.write(json.dumps({"event": "vial_analysed", "vial": i, **record}) + "\n")

    # Save annotated frame
    if annotate:
        from chem0.vision import PHResult
        ph_results = [infer_vial_ph(frame, v) for v in vials[:max_vials]]
        annotated = annotate_frame(frame, vials[:max_vials], ph_results)
        ann_path = path.replace(".jpg", "_annotated.jpg")
        save_frame(annotated, ann_path)
        sys.stderr.write(json.dumps({"event": "annotated_frame", "path": ann_path}) + "\n")

    # Write output
    if output:
        out_path = Path(output)
        with open(out_path, "w") as f:
            for r in results:
                f.write(json.dumps(r) + "\n")
        sys.stderr.write(json.dumps({"event": "output_written", "path": str(out_path), "count": len(results)}) + "\n")

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera", type=int, default=0, help="Camera device index")
    parser.add_argument("--output", "-o", help="Path to JSONL output file")
    parser.add_argument("--annotate", action="store_true", help="Save annotated frame with bounding boxes")
    parser.add_argument("--max-vials", type=int, default=6, help="Maximum vials to report")
    args = parser.parse_args()

    results = analyse(
        camera_id=args.camera,
        output=args.output,
        annotate=args.annotate,
        max_vials=args.max_vials,
    )

    # Print results as JSONL to stdout
    for r in results:
        print(json.dumps(r))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
