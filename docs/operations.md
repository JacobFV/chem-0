# Operations

Use this as the default operating sequence for an agent controlling the arm.

## First Prompt For An Agent

```text
Use the chem-0 MCP. Create an experiment first and pass the returned
experiment_id into each hardware/camera/robot tool call. Read
lerobot://pose-table, list cameras, view camera 0, probe the LeRobot servos,
connect to the SO101 arm, observe the current pose, then use
get_arm_pose/set_arm_pose for joint-space moves or get_position/set_position
for IK moves. Use speak_to_human/listen_to_human when human confirmation is
needed. Keep max_step <= 5 and stay inside calibrated limits.
```

## Safe Startup Sequence

1. `create_experiment`.
2. `resources/read` for `lerobot://pose-table`.
3. `list_cameras`.
4. `view_camera` for camera `0`.
5. `probe_feetech` on `/dev/cu.usbmodem5AB01815731` with `max_id: 6`.
6. Confirm IDs `1..6` respond.
7. `connect_so101`.
8. `observe`, then `get_arm_pose`.
9. Move with `set_arm_pose` for joint-space commands or `set_position` for
   Cartesian IK commands.
10. Use `ask_export(question)` only as a placeholder for future expert review;
    it currently returns `expert not available`.
11. Use `speak_to_human` before risky or ambiguous actions and
    `listen_to_human` to capture the reply.
12. `list_agent_session_events` and `list_experiment_artifacts` when reviewing
    the run.
13. `disconnect` at the end.

## Deterministic Calibration

Use deterministic endpoint calibration when an arm is new, rebuilt, or attached
to a different servo set. Give each physical arm its own `robot_id`.

GUI flow:

```sh
npm run electron:dev
```

Click **Calibrate** in the top-right toolbar. The calibration window displays
detected robot buses, the actual upstream SO-101 visual URDF/STL mesh model, a
live raw-position arm overlay, and an amber guide pose for the active endpoint.
It records each raw servo position as you step through the prompts.

Terminal flow:

```sh
npm run calibrate:so101 -- \
  --port /dev/tty.usbmodem5A460833421 \
  --robot-id mcp_so101_b
```

The script prompts for `Z1`, `X1`, `X2`, `X3`, `Z2`, and `Hand` endpoints one at
a time, records each raw servo position after Enter, and writes a LeRobot
calibration file under the matching `robot_id`. After calibrating, connect with
the same id:

```json
{
  "port": "/dev/tty.usbmodem5A460833421",
  "id": "mcp_so101_b",
  "robot_id": "mcp_so101_b",
  "calibrate": false
}
```

## Motion Guidance

Prefer:

```json
{
  "max_step": 5,
  "allow_out_of_range": false
}
```

For Cartesian IK, also prefer:

```json
{
  "tolerance_m": 0.004,
  "max_position_error_m": 0.03,
  "allow_out_of_workspace": false
}
```

Use camera frames before and after meaningful motion. The LLM should treat the
pose table as calibration context, not as a guarantee that the physical world is
clear of obstacles.

## Current Known Pose

The latest tested pose was approximately:

```text
shoulder_pan.pos:  about -109
shoulder_lift.pos: about 0
elbow_flex.pos:    about -70
wrist_flex.pos:    about 0
wrist_roll.pos:    about -164
gripper.pos:       about 0.5
```

## Shutdown

Always call:

```text
disconnect
```

This releases the serial connection and lets LeRobot apply its disconnect
behavior.
