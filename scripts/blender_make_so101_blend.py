#!/usr/bin/env python3
"""
Create a Blender scene from the SO-101 visual URDF.

Run with Blender, not system Python:

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender_make_so101_blend.py

The script imports every visual STL from assets/so101/so101_new_calib.urdf,
builds the URDF joint/link hierarchy in an extended review pose, and stores
enough custom properties on each mesh object to later write its local transform
back to a cleaned URDF.
"""

from __future__ import annotations

import math
from pathlib import Path
import xml.etree.ElementTree as ET

import bpy


REPO_ROOT = Path(__file__).resolve().parents[1]
URDF_PATH = REPO_ROOT / "assets" / "so101" / "so101_new_calib.urdf"
ASSET_ROOT = URDF_PATH.parent
OUT_PATH = REPO_ROOT / "assets" / "so101" / "so101_visual_review.blend"
REVIEW_JOINT_POSE_RAD = {
    "shoulder_pan": 0.0,
    "shoulder_lift": 0.0,
    "elbow_flex": math.radians(-70.0),
    "wrist_flex": 0.0,
    "wrist_roll": math.radians(-164.0),
    "gripper": math.radians(20.0),
}


def parse_floats(raw: str | None, default: str) -> list[float]:
    return [float(v) for v in (raw or default).split()]


def import_stl(path: Path) -> bpy.types.Object:
    before = set(bpy.context.scene.objects)
    if hasattr(bpy.ops.wm, "stl_import"):
        bpy.ops.wm.stl_import(filepath=str(path))
    else:
        bpy.ops.import_mesh.stl(filepath=str(path))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    if not imported:
        raise RuntimeError(f"STL import produced no object: {path}")
    return imported[0]


def make_material(name: str, rgba: list[float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    return mat


def make_empty(name: str, display_type: str, display_size: float) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display_type
    obj.empty_display_size = display_size
    obj.hide_select = True
    bpy.context.scene.collection.objects.link(obj)
    return obj


def set_local_rpy(obj: bpy.types.Object, xyz: list[float], rpy: list[float]) -> None:
    obj.location = xyz
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rpy


def main() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    xml = ET.parse(URDF_PATH)
    root = xml.getroot()

    materials = {}
    for material in root.findall("material"):
        color = material.find("color")
        if color is None:
            continue
        name = material.attrib.get("name", "material")
        rgba = parse_floats(color.attrib.get("rgba"), "0.8 0.8 0.8 1")
        materials[name] = make_material(name, rgba)

    link_nodes = {}
    for link_index, link in enumerate(root.findall("link")):
        link_name = link.attrib.get("name", f"link_{link_index}")
        collection = bpy.data.collections.new(link_name)
        bpy.context.scene.collection.children.link(collection)
        link_node = make_empty(f"LINK__{link_name}", "PLAIN_AXES", 0.025)
        link_node["urdf_link_node"] = link_name
        link_nodes[link_name] = link_node
        collection.objects.link(link_node)
        bpy.context.scene.collection.objects.unlink(link_node)

        visual_index = 0
        for child in list(link):
            if child.tag != "visual":
                continue
            mesh = child.find("geometry/mesh")
            if mesh is None:
                visual_index += 1
                continue

            filename = mesh.attrib.get("filename", "")
            if not filename.endswith(".stl"):
                visual_index += 1
                continue

            origin = child.find("origin")
            xyz = parse_floats(origin.attrib.get("xyz") if origin is not None else None, "0 0 0")
            rpy = parse_floats(origin.attrib.get("rpy") if origin is not None else None, "0 0 0")
            material_name = child.find("material").attrib.get("name", "") if child.find("material") is not None else ""

            obj = import_stl(ASSET_ROOT / filename)
            obj.name = f"{link_name}__visual_{visual_index:02d}__{Path(filename).stem}"
            obj.data.name = f"{obj.name}_mesh"
            obj.parent = link_node
            set_local_rpy(obj, xyz, rpy)

            if material_name in materials:
                obj.data.materials.append(materials[material_name])

            for existing in obj.users_collection:
                existing.objects.unlink(obj)
            collection.objects.link(obj)

            obj["urdf_path"] = str(URDF_PATH)
            obj["urdf_link"] = link_name
            obj["urdf_visual_index"] = visual_index
            obj["urdf_mesh"] = filename
            obj["urdf_original_xyz"] = " ".join(f"{v:.12g}" for v in xyz)
            obj["urdf_original_rpy"] = " ".join(f"{v:.12g}" for v in rpy)
            visual_index += 1

    joints = []
    child_links = set()
    for joint in root.findall("joint"):
        parent = joint.find("parent")
        child = joint.find("child")
        origin = joint.find("origin")
        axis = joint.find("axis")
        if parent is None or child is None:
            continue
        entry = {
            "name": joint.attrib.get("name", ""),
            "type": joint.attrib.get("type", ""),
            "parent": parent.attrib.get("link", ""),
            "child": child.attrib.get("link", ""),
            "xyz": parse_floats(origin.attrib.get("xyz") if origin is not None else None, "0 0 0"),
            "rpy": parse_floats(origin.attrib.get("rpy") if origin is not None else None, "0 0 0"),
            "axis": parse_floats(axis.attrib.get("xyz") if axis is not None else None, "0 0 1"),
        }
        joints.append(entry)
        child_links.add(entry["child"])

    root_link = next((name for name in link_nodes if name not in child_links), "base_link")
    link_nodes[root_link].name = f"LINK__{root_link}__ROOT"

    for joint in joints:
        parent_node = link_nodes.get(joint["parent"])
        child_node = link_nodes.get(joint["child"])
        if parent_node is None or child_node is None:
            continue

        origin_node = make_empty(f"JOINT_ORIGIN__{joint['name']}", "ARROWS", 0.018)
        origin_node.parent = parent_node
        set_local_rpy(origin_node, joint["xyz"], joint["rpy"])

        motion_node = make_empty(f"JOINT_MOTION__{joint['name']}", "SINGLE_ARROW", 0.015)
        motion_node.parent = origin_node
        angle = REVIEW_JOINT_POSE_RAD.get(joint["name"], 0.0) if joint["type"] != "fixed" else 0.0
        axis = joint["axis"]
        motion_node.rotation_mode = "AXIS_ANGLE"
        motion_node.rotation_axis_angle = (angle, axis[0], axis[1], axis[2])
        motion_node["review_pose_rad"] = angle

        child_node.parent = motion_node
        child_node.location = (0.0, 0.0, 0.0)
        child_node.rotation_mode = "XYZ"
        child_node.rotation_euler = (0.0, 0.0, 0.0)

    camera_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (0.45, -0.55, 0.34)
    camera.rotation_euler = (math.radians(61), 0, math.radians(41))
    bpy.context.scene.camera = camera

    light_data = bpy.data.lights.new("Key_Light", type="AREA")
    light = bpy.data.objects.new("Key_Light", light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = (0.2, -0.3, 0.6)
    light.data.energy = 400
    light.data.size = 0.5

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_PATH))
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
