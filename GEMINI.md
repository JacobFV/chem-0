# Agent Handoff For chem-0

This repo contains a stdio MCP server for controlling a calibrated LeRobot
SO-101/SO-100 follower arm and reading a local camera.

## Start Here

Read these files before operating hardware:

1. `README.md`
2. `docs/setup.md`
3. `docs/operations.md`
4. `docs/pose-table.md`
5. `docs/kinematics.md`
6. `docs/troubleshooting.md`

## Known Local Defaults

```text
robot id: mcp_so101
serial port: /dev/cu.usbmodem5AB01815731
camera id: 0
pose resource: lerobot://pose-table
```

Calibration file:

```text
/Users/vibestartup/.cache/huggingface/lerobot/calibration/robots/so_follower/mcp_so101.json
```

## Run Server

```sh
.venv/bin/python lerobot_mcp_server.py
```

## Codex MCP Config

```json
{
  "mcpServers": {
    "chem-0": {
      "command": "/Users/vibestartup/Code/lerobot-test/.venv/bin/python",
      "args": [
        "/Users/vibestartup/Code/lerobot-test/lerobot_mcp_server.py"
      ],
      "env": {}
    }
  }
}
```

## Safe Operating Sequence

1. Read `lerobot://pose-table`.
2. `list_cameras`.
3. `view_camera` with `camera_id: 0`.
4. `probe_feetech` with `max_id: 6`.
5. Confirm servo IDs `1..6`, model `777`, baud `1000000`.
6. `connect_so101`.
7. `observe`.
8. `get_arm_pose`.
9. Move with `set_arm_pose` for joint-space control or `set_position` for IK.
10. Use `move_pose` only as the legacy alias for `set_arm_pose`.
11. Keep `max_step <= 5` unless a human explicitly approves otherwise.
12. `disconnect`.

## Preferred Joint-Space Motion Tool

Use `set_arm_pose`:

```json
{
  "pose": {
    "shoulder_pan": -109,
    "shoulder_lift": 0,
    "elbow_flex": -70,
    "wrist_flex": 0,
    "wrist_roll": -164,
    "gripper": 0.5
  },
  "max_step": 5,
  "allow_out_of_range": false
}
```

All six pose values are required.

## Cartesian IK Tools

Use `get_position` to read `[x, y, z, gripper]` in meters plus percent gripper.
Use `set_position` for bounded IK moves:

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

The server uses `assets/kinematics/so101_kinematics.urdf` with LeRobot's
`RobotKinematics` and `placo`.

## Critical Spatial Note

Physical visual feedback established:

```text
shoulder_lift around +108 looked down/floor-parallel
shoulder_lift around 0 looked roughly 90 degrees/upright
shoulder_lift around -96 overshot past upright
```

Do not assume joint names imply visual direction. Use camera frames.

## Testing

```sh
.venv/bin/python -m py_compile lerobot_mcp_server.py
```

See `docs/testing.md` for MCP-level and hardware-level tests.

## If Hardware Fails

If no servos respond, do not move. Check:

- external servo power,
- USB-C,
- bus cable channel,
- jumper/channel,
- cable polarity,
- serial port already in use.

Then run `probe_feetech` again.
