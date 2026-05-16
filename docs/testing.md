# Testing

## Syntax And Build

```sh
PYTHONPATH=src/lib .venv/bin/python -m py_compile src/apps/python-bridge/bridge.py src/lib/chem0/core.py
npm run build
npm audit --omit=dev
```

`npm run build` compiles:

- `src/lib/backend`
- `src/apps/mcp-node`
- `src/apps/electron`

## MCP Protocol Smoke Test

Start the built MCP server:

```sh
node src/apps/mcp-node/dist/server.js
```

Expected MCP surfaces:

- `initialize`
- `tools/list`
- `resources/list`
- `resources/read`
- `tools/call`

Expected tools include:

```text
list_serial_ports
list_cameras
view_camera
probe_feetech
connect_so101
observe
get_arm_pose
get_pose_table
get_position
set_arm_pose
set_position
open_gripper
close_gripper
ask_export
speak_to_human
listen_to_human
move_relative
disconnect
create_experiment
list_experiments
list_agent_session_events
list_experiment_artifacts
```

Current expected tool count: `22`.

Expected resource:

```text
lerobot://pose-table
```

Experiment logging smoke path:

1. Call `create_experiment`.
2. Call `ask_export` or `speak_to_human` with the returned `experiment_id`.
3. Call `list_agent_session_events`.
4. Expected event types include `message`, `tool_call`, and `tool_response`.

Voice smoke path without external credentials:

```json
{
  "name": "speak_to_human",
  "arguments": {
    "text": "Smoke test only",
    "provider": "elevenlabs",
    "play": false,
    "experiment_id": "exp_..."
  }
}
```

With no `ELEVENLABS_API_KEY`, the expected response has `configured: false` and
still logs the tool call/response. On macOS, use `provider: "system"` for a real
local playback smoke test without ElevenLabs.

## Camera Test

Run through MCP or Electron:

```json
{
  "name": "list_cameras",
  "arguments": {
    "max_id": 1,
    "experiment_id": "exp_..."
  }
}
```

Known expected result:

```text
camera_id: 0
width: 1280
height: 720
fps: 30
```

Then call `view_camera`:

```json
{
  "name": "view_camera",
  "arguments": {
    "camera_id": 0,
    "width": 320,
    "height": 240,
    "format": "jpeg",
    "quality": 75,
    "experiment_id": "exp_..."
  }
}
```

Expected result has content types:

```text
text
image
```

When `experiment_id` is present, the backend also writes the image into
`data/blobs` and records an `experiment_artifacts` row.

## Robot Test

Read-only probe:

```json
{
  "name": "probe_feetech",
  "arguments": {
    "port": "/dev/cu.usbmodem5AB01815731",
    "max_id": 6,
    "experiment_id": "exp_..."
  }
}
```

Expected IDs:

```text
1, 2, 3, 4, 5, 6
```

Expected model:

```text
777
```

Safe no-op motion path:

1. `create_experiment`.
2. `connect_so101`.
3. `observe`.
4. Build a six-parameter pose from the current observation.
5. Call `set_arm_pose` with that current pose and `max_step <= 5`.
6. Expected `steps: 0`.
7. `disconnect`.

This verifies the absolute pose path without intentionally changing the arm.

## Kinematics Smoke Test

This verifies that the repo-local URDF and `placo` solver import correctly:

```sh
PYTHONPATH=src/lib .venv/bin/python - <<'PY'
from chem0.core import forward_kinematics_for_pose, validate_pose

pose = validate_pose({
    "shoulder_pan": 0,
    "shoulder_lift": 0,
    "elbow_flex": -70,
    "wrist_flex": 0,
    "wrist_roll": -164,
    "gripper": 0.5,
})
transform = forward_kinematics_for_pose(pose)
print([round(float(v), 5) for v in transform[:3, 3]])
PY
```

Expected current output:

```text
[0.18576, 0.00184, 0.50995]
```
