---
name: vision-to-motion
description: Capture a webcam frame, describe the scene in robot-relevant terms, and generate dual high-level and low-level motion instructions for the SO-101 arm
license: MIT
compatibility: opencode
metadata:
  robot: SO-101
  joints: shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper
---

## What I Do

This skill implements a **vision-guided motion pipeline** for the SO-101 robotic arm. It converts a live camera observation into two levels of motion intent, then executes and verifies.

### Dual-Level Instruction Format

Every motion plan produced by this skill has two layers:

- **High-level instruction** — Natural-language intent describing *what* to do and *why* (e.g., "move the gripper 5 cm left toward the blue object")
- **Low-level instruction** — Concrete tool call with exact numeric values describing *how* to do it (e.g., a `set_arm_pose` or `set_position` call with specific angles/coordinates)

### Pipeline

| # | Step | Description | Tools |
|---|------|-------------|-------|
| 1 | **Observe** | Capture a camera frame | `list_cameras`, `view_camera` |
| 2 | **Describe** | Analyze frame: object positions relative to arm base, spatial layout, distances, obstacles | Agent vision |
| 3 | **Plan (High-Level)** | Write natural-language motion intent | — |
| 4 | **Translate (Low-Level)** | Convert intent into concrete tool-call values | `set_arm_pose` or `set_position` |
| 5 | **Execute** | Run the low-level motion | tool dispatch |
| 6 | **Verify** | Capture new frame, optionally read joints | `view_camera`, `observe`, `get_position` |

## Joint Reference (from calibration script)

These six joints and their endpoint pairs come from `scripts/calibrate_so101_deterministic.py`:

| Axis | Joint | Servo ID | Physical Motion | Unit | First Endpoint | Second Endpoint |
|------|-------|----------|-----------------|------|----------------|-----------------|
| Z1 | shoulder_pan | 1 | Base rotation left/right | deg | all the way left | all the way right |
| X1 | shoulder_lift | 2 | Upper arm backward/forward | deg | all the way backward | all the way forward |
| X2 | elbow_flex | 3 | Elbow bend/extend | deg | fully bent/backward | fully extended/forward |
| X3 | wrist_flex | 4 | Wrist down/up | deg | all the way down/backward | all the way up/forward |
| Z2 | wrist_roll | 5 | Wrist twist CCW/CW | deg | all the way CCW/left | all the way CW/right |
| Hand | gripper | 6 | Open/close | % 0-100 | fully closed | fully open |

Calibration records each joint's two mechanical endpoints as raw servo positions. The midpoint of those two raw values becomes the homed zero. Calibrated limits from the saved `mcp_so101` calibration:

| Joint | Min | Max |
|-------|----:|----:|
| shoulder_pan | –116.88 | 116.88 |
| shoulder_lift | –113.05 | 113.05 |
| elbow_flex | –81.05 | 81.05 |
| wrist_flex | –103.99 | 103.99 |
| wrist_roll | –180.00 | 180.00 |
| gripper | 0.00 | 100.00 |

Cartesian workspace bounds (meters, conservative): x [–0.35, 0.35], y [–0.35, 0.35], z [0.02, 0.60].

**Critical spatial note** — Do *not* assume joint names imply visual direction:
- `shoulder_lift` at +108° → arm points down (floor-parallel)
- `shoulder_lift` at 0° → arm points roughly upright (≈90° from floor)
- `shoulder_lift` at –96° → arm overshoots past upright

## When to Use

**Use when** the task involves:
- Moving the arm based on what the camera sees
- Approaching or manipulating objects visible in the frame
- Visually verifying arm position after motion
- Generating interpretable high-level + low-level motion plans for review

**Do not use for**:
- Pure programmed sequences without vision
- First-time calibration (use the dedicated calibration workflow)

## Scene Description Guidelines

When describing a camera frame, structure the description around these categories:

1. **Arm pose** — Is the arm visible? Approximate joint configuration
2. **Objects** — What objects are in frame? Position relative to arm base (left/right, front/back, high/low). Colors, sizes, shapes for disambiguation
3. **Spatial layout** — Workspace boundaries visible? Obstacles? Clearance paths
4. **Estimated distances** — Approximate positions in the camera's field of view. If the camera-to-base transform is known, estimate x/y/z in meters

## Motion Planning Rules

### High-Level Instructions

Describe the intent clearly. Examples:
- "Move the gripper to the left edge of the workspace (≈ –0.2 m in y)"
- "Approach the blue object near the center of the frame"
- "Lower the arm by ≈3 cm and close the gripper to 80%"
- "Return to the `neutral_midrange` reference pose"

### Low-Level Instructions

Convert intent to one of:

**Joint-space (preferred)** — `set_arm_pose` with all six values:
```json
{
  "pose": {
    "shoulder_pan": -90.0,
    "shoulder_lift": 30.0,
    "elbow_flex": -45.0,
    "wrist_flex": 10.0,
    "wrist_roll": -90.0,
    "gripper": 50.0
  },
  "max_step": 5,
  "allow_out_of_range": false
}
```

**Cartesian IK** — `set_position` (use when target is described in spatial coordinates):
```json
{
  "x": 0.18,
  "y": 0.02,
  "z": 0.45,
  "gripper": 20,
  "max_step": 5,
  "tolerance_m": 0.004,
  "max_position_error_m": 0.03,
  "allow_out_of_workspace": false,
  "allow_out_of_range": false
}
```

Always read the pose table (`lerobot://pose-table` or `get_pose_table`) before computing new poses.

### Known Reference Poses

| Name | shoulder_pan | shoulder_lift | elbow_flex | wrist_flex | wrist_roll | gripper |
|------|------------:|------------:|----------:|----------:|----------:|-------:|
| neutral_midrange | 0 | 0 | 0 | 0 | 0 | 50 |
| base_left_vertical_extended | –109 | 0 | –70 | 0 | –164 | 0.5 |
| base_center_vertical_extended | 0 | 0 | –70 | 0 | –164 | 0.5 |
| base_left_floor_parallel_down | –109 | 108 | –70 | 0 | –164 | 0.5 |
| base_left_over_upright | –109 | –96 | –70 | 0 | –164 | 0.5 |
| compact_safe | 0 | 45 | 25 | 45 | 0 | 20 |

## Safety Rules

1. **Always** read the pose table before moving
2. **Always** call `observe` before the first motion to know the current pose
3. **Always** keep `max_step <= 5` unless a human explicitly approves a higher value
4. **Always** keep `allow_out_of_range: false` and `allow_out_of_workspace: false` unless a human explicitly approves
5. **Always** stay within calibrated `JOINT_LIMITS` and conservative `CARTESIAN_BOUNDS`
6. **Always** verify motion results with `view_camera` after execution
7. **Never** assume joint-name-to-visual-direction mappings — use camera frames
8. **Never** move when servos fail to respond — check power, connections, run `probe_feetech`

## Reference Files

| File | What it provides |
|------|-----------------|
| `scripts/calibrate_so101_deterministic.py` | Joint definitions, calibration methodology, endpoint pairs, servo IDs |
| `src/lib/chem0/core.py` | All tool implementations, `JOINT_LIMITS`, `POSE_TABLE`, `CARTESIAN_BOUNDS`, `CALIBRATION_STEPS` |
| `docs/pose-table.md` | Reference poses, units, limits, spatial notes |
| `assets/kinematics/so101_kinematics.urdf` | Kinematic model for IK solver |
| `docs/architecture.md` | System architecture overview |
| `docs/operations.md` | Safe operating sequence and hardware notes |
