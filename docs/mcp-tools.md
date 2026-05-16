# MCP Tools

`chem-0` exposes a compact stdio MCP interface for camera viewing and robot
control.

## Discovery

### `list_serial_ports`

Lists likely serial devices.

```json
{}
```

### `list_cameras`

Probes OpenCV camera indices.

```json
{
  "max_id": 5
}
```

Known test result:

```text
camera 0: 1280x720 at 30 fps
```

## Vision

### `view_camera`

Captures one frame and returns MCP content with text metadata plus an `image`
block.

```json
{
  "camera_id": 0,
  "width": 1280,
  "height": 720,
  "format": "jpeg",
  "quality": 85
}
```

Formats:

- `jpeg`
- `png`

## Robot Connection

### `probe_feetech`

Read-only servo bus probe. Does not move motors.

```json
{
  "port": "/dev/cu.usbmodem5AB01815731",
  "max_id": 6
}
```

Expected working result includes IDs `1..6`, model `777`, baud `1000000`.

### `connect_so101`

Connects the calibrated follower arm.

```json
{
  "port": "/dev/cu.usbmodem5AB01815731",
  "id": "mcp_so101",
  "max_delta": 5,
  "calibrate": false
}
```

`port` and `id` default to the known local setup.

### `observe`

Reads current normalized LeRobot joint positions.

```json
{}
```

Expected keys:

```text
shoulder_pan.pos
shoulder_lift.pos
elbow_flex.pos
wrist_flex.pos
wrist_roll.pos
gripper.pos
```

### `disconnect`

Disconnects from the robot.

```json
{}
```

## Pose Context

### `get_pose_table`

Returns calibrated limits and common poses as JSON.

```json
{}
```

The same information is available as:

```text
lerobot://pose-table
```

## Motion

### `move_pose`

Preferred full-arm motion primitive. Requires all six joint values.

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
  "hold_seconds": 0.35,
  "settle_seconds": 0.5,
  "allow_out_of_range": false
}
```

By default, out-of-range poses are rejected and movement is interpolated in
small steps.

### `move_relative`

Small nudge primitive.

```json
{
  "deltas": {
    "shoulder_pan": -5
  },
  "return_to_start": false,
  "hold_seconds": 0.25
}
```

Prefer `move_pose` when reproducibility matters.
