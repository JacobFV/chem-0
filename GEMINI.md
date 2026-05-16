# Agent Handoff For chem-0

This repo contains a local LeRobot experiment platform. The stdio MCP server
and Electron GUI both use the same TypeScript Node backend. The backend owns
experiments, SQLite persistence, blob artifacts, GPT-5.5 streaming sessions,
and the small Python bridge that talks to LeRobot/OpenCV.

## Start Here

Read these files before operating hardware:

1. `README.md`
2. `docs/architecture.md`
3. `docs/setup.md`
4. `docs/operations.md`
5. `docs/pose-table.md`
6. `docs/kinematics.md`
7. `docs/desktop.md`
8. `docs/troubleshooting.md`

## Known Local Defaults

```text
robot id: mcp_so101
serial port: /dev/cu.usbmodem5AB01815731
camera id: 0
pose resource: lerobot://pose-table
data store: data/chem0.sqlite
blob store: data/blobs
```

Calibration file:

```text
/Users/vibestartup/.cache/huggingface/lerobot/calibration/robots/so_follower/mcp_so101.json
```

## Run Server

```sh
npm install
npm run build
node src/apps/mcp-node/dist/server.js
```

## Codex MCP Config

```json
{
  "mcpServers": {
    "chem-0": {
      "command": "node",
      "args": [
        "/Users/vibestartup/Code/lerobot-test/src/apps/mcp-node/dist/server.js"
      ],
      "env": {}
    }
  }
}
```

## Safe Operating Sequence

1. `create_experiment`; keep the returned `experiment_id`.
2. Read `lerobot://pose-table`.
3. `list_cameras` with the `experiment_id`.
4. `view_camera` with `camera_id: 0` and the `experiment_id`.
5. `probe_feetech` with `max_id: 6` and the `experiment_id`.
6. Confirm servo IDs `1..6`, model `777`, baud `1000000`.
7. `connect_so101`.
8. `observe`.
9. `get_arm_pose`.
10. Move with `set_arm_pose` for joint-space control or `set_position` for IK.
11. Use `ask_export(question)` only as a placeholder for future expert review;
    it currently returns `expert not available`.
12. Keep `max_step <= 5` unless a human explicitly approves otherwise.
13. Use `list_agent_session_events` and `list_experiment_artifacts` to review
    the run.
14. `disconnect`.

MCP clients cannot fully mirror their chat history into chem-0. Passing
`experiment_id` into tool calls is therefore required for useful MCP-side
experiment logs. Electron sessions are preferred when full streaming message
history is needed.

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
PYTHONPATH=src/lib .venv/bin/python -m py_compile src/apps/python-bridge/bridge.py src/lib/chem0/core.py
npm run build
npm audit --omit=dev
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
