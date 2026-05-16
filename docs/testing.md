# Testing

## Syntax Check

```sh
.venv/bin/python -m py_compile lerobot_mcp_server.py
```

## MCP Protocol Smoke Test

Expected MCP surfaces:

- `initialize`
- `tools/list`
- `resources/list`
- `resources/read`

Expected tools:

```text
list_serial_ports
list_cameras
view_camera
probe_feetech
connect_so101
observe
get_pose_table
move_pose
move_relative
disconnect
```

Expected resource:

```text
lerobot://pose-table
```

## Camera Test

Run through MCP:

```json
{
  "name": "list_cameras",
  "arguments": {
    "max_id": 1
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
    "quality": 75
  }
}
```

Expected result has content types:

```text
text
image
```

## Robot Test

Read-only probe:

```json
{
  "name": "probe_feetech",
  "arguments": {
    "port": "/dev/cu.usbmodem5AB01815731",
    "max_id": 6
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

1. `connect_so101`.
2. `observe`.
3. Build a six-parameter pose from the current observation.
4. Call `move_pose` with that current pose.
5. Expected `steps: 0`.
6. `disconnect`.

This verifies the absolute pose path without intentionally changing the arm.
