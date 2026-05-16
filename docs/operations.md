# Operations

Use this as the default operating sequence for an agent controlling the arm.

## First Prompt For An Agent

```text
Use the chem-0 MCP. Read lerobot://pose-table, list cameras, view camera 0,
probe the LeRobot servos, connect to the SO101 arm, observe the current pose,
then only use move_pose with max_step <= 5 and poses inside calibrated limits.
```

## Safe Startup Sequence

1. `resources/read` for `lerobot://pose-table`.
2. `list_cameras`.
3. `view_camera` for camera `0`.
4. `probe_feetech` on `/dev/cu.usbmodem5AB01815731` with `max_id: 6`.
5. Confirm IDs `1..6` respond.
6. `connect_so101`.
7. `observe`.
8. Move only with `move_pose` unless doing tiny manual nudges.
9. `disconnect` at the end.

## Motion Guidance

Prefer:

```json
{
  "max_step": 5,
  "allow_out_of_range": false
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
