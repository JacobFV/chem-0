#!/usr/bin/env python3
"""
Write edited Blender object transforms back to a cleaned SO-101 visual URDF.

Run after saving assets/so101/so101_visual_review.blend:

  /Applications/Blender.app/Contents/MacOS/Blender --background \
    assets/so101/so101_visual_review.blend \
    --python scripts/blender_apply_so101_blend_transforms.py

The original URDF is left unchanged. Output:

  assets/so101/so101_new_calib.cleaned.urdf
"""

from __future__ import annotations

from pathlib import Path
import xml.etree.ElementTree as ET

import bpy


REPO_ROOT = Path(__file__).resolve().parents[1]
URDF_PATH = REPO_ROOT / "assets" / "so101" / "so101_new_calib.urdf"
OUT_PATH = REPO_ROOT / "assets" / "so101" / "so101_new_calib.cleaned.urdf"
EPS = 1e-8


def fmt(value: float) -> str:
    if abs(value) < EPS:
        value = 0.0
    return f"{value:.8g}"


def transform_strings(obj: bpy.types.Object) -> tuple[str, str]:
    obj.rotation_mode = "XYZ"
    xyz = " ".join(fmt(v) for v in obj.location)
    rpy = " ".join(fmt(v) for v in obj.rotation_euler)
    return xyz, rpy


def visual_key(obj: bpy.types.Object) -> tuple[str, int] | None:
    link = obj.get("urdf_link")
    index = obj.get("urdf_visual_index")
    if not isinstance(link, str):
        return None
    try:
        return link, int(index)
    except (TypeError, ValueError):
        return None


def main() -> None:
    edited = {}
    for obj in bpy.context.scene.objects:
        key = visual_key(obj)
        if key is None:
            continue
        edited[key] = transform_strings(obj)

    if not edited:
        raise RuntimeError("No URDF-tagged Blender objects found in this scene.")

    tree = ET.parse(URDF_PATH)
    root = tree.getroot()

    changed = []
    for link in root.findall("link"):
        link_name = link.attrib.get("name", "")
        visual_index = 0
        collision_index = 0
        visual_updates: dict[int, tuple[str, str]] = {}

        for child in list(link):
            if child.tag == "visual":
                key = (link_name, visual_index)
                if key in edited:
                    origin = child.find("origin")
                    if origin is None:
                        origin = ET.SubElement(child, "origin")
                    xyz, rpy = edited[key]
                    origin.set("xyz", xyz)
                    origin.set("rpy", rpy)
                    visual_updates[visual_index] = (xyz, rpy)
                    changed.append(f"{link_name} visual {visual_index}: xyz={xyz} rpy={rpy}")
                visual_index += 1

        # The vendored URDF mirrors each visual with a matching collision entry.
        # Keep collision transforms paired with edited visual transforms.
        for child in list(link):
            if child.tag != "collision":
                continue
            if collision_index in visual_updates:
                origin = child.find("origin")
                if origin is None:
                    origin = ET.SubElement(child, "origin")
                xyz, rpy = visual_updates[collision_index]
                origin.set("xyz", xyz)
                origin.set("rpy", rpy)
            collision_index += 1

    tree.write(OUT_PATH, encoding="utf-8", xml_declaration=True)
    print(f"Wrote {OUT_PATH}")
    print("Updated transforms:")
    for line in changed:
        print(f"  {line}")


if __name__ == "__main__":
    main()
