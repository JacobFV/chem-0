# chem-0 LeRobot MCP Server

`chem-0` is a compact stdio MCP server for controlling a Hugging Face LeRobot
SO-101/SO-100 follower arm and reading a local camera. It is intended for Codex
or another MCP-capable LLM client to:

- inspect camera frames,
- probe and connect to the arm,
- read the current six-joint pose,
- move the arm to an absolute six-parameter pose,
- use a built-in pose table as spatial/calibration context.

The implementation is intentionally a single Python file:

- `lerobot_mcp_server.py`

## Local Machine State

This repo was built and tested on macOS from:

```text
/Users/vibestartup/Code/lerobot-test
```

Current known hardware defaults:

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

Do not delete or overwrite that calibration file unless you intend to recalibrate
the physical arm.

## Hardware Setup

Known working setup:

- Waveshare-style Bus Servo Adapter (A) / ST-SC serial bus servo driver board.
- USB-C from adapter to laptop.
- External servo power supply connected to the adapter board.
- Arm servo bus cable connected to the correct ST/SC servo bus channel.
- Board jumpers/channel configured so USB controls the servo bus.
- Six STS3215 servos visible as IDs `1..6`, model `777`, baud `1000000`.

Before commanding motion, always verify:

```text
probe_feetech -> IDs 1,2,3,4,5,6 all present
connect_so101 -> connected true
observe -> six .pos keys returned
```

If the serial port opens but no servos respond, check external servo power,
jumper/channel position, cable polarity, and whether another process is holding
the serial port.

## Install / Run

The local virtualenv already contains `lerobot[feetech]` and OpenCV:

```sh
.venv/bin/python lerobot_mcp_server.py
```

From scratch, install dependencies with:

```sh
python -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install 'lerobot[feetech]'
```

## Mount In Codex

Configure Codex to launch this server over stdio:

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

Restart Codex after editing MCP config.

Good first prompt for a fresh Codex session:

```text
Use the chem-0 MCP. Read lerobot://pose-table, list cameras, view camera 0,
probe the LeRobot servos, connect to the SO101 arm, observe the current pose,
then only use move_pose with max_step <= 5 and poses inside calibrated limits.
```

Camera permissions: on macOS, the first camera call may require granting camera
permission to the terminal or Codex host process.

## MCP Tools

### `list_serial_ports`

Lists likely serial devices.

```json
{}
```

### `list_cameras`

Probes numeric OpenCV camera indices.

```json
{
  "max_id": 5
}
```

Known test result: camera `0` returned frames at `1280x720`.

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

Supported formats: `jpeg`, `png`.

### `probe_feetech`

Read-only servo probe. Does not move motors.

```json
{
  "port": "/dev/cu.usbmodem5AB01815731",
  "max_id": 6
}
```

Expected working output includes:

```text
id 1 model 777 baud 1000000
id 2 model 777 baud 1000000
id 3 model 777 baud 1000000
id 4 model 777 baud 1000000
id 5 model 777 baud 1000000
id 6 model 777 baud 1000000
```

### `connect_so101`

Connects the calibrated SO follower arm.

```json
{
  "port": "/dev/cu.usbmodem5AB01815731",
  "id": "mcp_so101",
  "max_delta": 5,
  "calibrate": false
}
```

`port` defaults to `/dev/cu.usbmodem5AB01815731`.
`id` defaults to `mcp_so101`.

### `observe`

Reads current normalized LeRobot joint positions.

```json
{}
```

Returned keys:

```text
shoulder_pan.pos
shoulder_lift.pos
elbow_flex.pos
wrist_flex.pos
wrist_roll.pos
gripper.pos
```

### `get_pose_table`

Returns the same pose context as the `lerobot://pose-table` resource, as a tool
result for clients that do not surface resources well.

```json
{}
```

### `move_pose`

Moves to an absolute six-parameter pose. All six values are required.

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

Units:

- `shoulder_pan`: degrees
- `shoulder_lift`: degrees
- `elbow_flex`: degrees
- `wrist_flex`: degrees
- `wrist_roll`: degrees
- `gripper`: `0..100`

By default, `move_pose` rejects values outside calibrated limits and interpolates
in small steps.

### `move_relative`

Moves one or more joints by relative deltas from the current observed pose.

```json
{
  "deltas": {
    "shoulder_pan": -5
  },
  "return_to_start": false,
  "hold_seconds": 0.25
}
```

Prefer `move_pose` for reproducible behavior. Use `move_relative` only for
small nudges.

### `disconnect`

Disconnects from the robot and lets LeRobot disable torque using its defaults.

```json
{}
```

## MCP Resources

### `lerobot://pose-table`

Provides both JSON and Markdown contents. It contains:

- robot id and default port,
- joint order,
- units,
- calibrated limits,
- sign/orientation notes,
- common reference poses.

Important orientation note from physical testing:

```text
shoulder_lift around +108 looked down/floor-parallel
shoulder_lift around 0 looked roughly 90 degrees/upright
shoulder_lift around -96 overshot past upright
```

## Calibrated Joint Limits

These limits are encoded in `lerobot_mcp_server.py` and derived from the saved
calibration:

| Joint | Min | Max | Unit |
| --- | ---: | ---: | --- |
| `shoulder_pan` | -116.88 | 116.88 | degrees |
| `shoulder_lift` | -113.05 | 113.05 | degrees |
| `elbow_flex` | -81.05 | 81.05 | degrees |
| `wrist_flex` | -103.99 | 103.99 | degrees |
| `wrist_roll` | -180.00 | 180.00 | degrees |
| `gripper` | 0.00 | 100.00 | percent |

## Useful Common Poses

These are also available from `lerobot://pose-table`.

### Base Left, Vertical, Extended

The best known pose after visual feedback: base left, upper arm about 90 degrees
from the initial floor-parallel-down pose, elbow extended, wrist straight.

```json
{
  "shoulder_pan": -109,
  "shoulder_lift": 0,
  "elbow_flex": -70,
  "wrist_flex": 0,
  "wrist_roll": -164,
  "gripper": 0.5
}
```

### Centered Vertical, Extended

```json
{
  "shoulder_pan": 0,
  "shoulder_lift": 0,
  "elbow_flex": -70,
  "wrist_flex": 0,
  "wrist_roll": -164,
  "gripper": 0.5
}
```

### Neutral Midrange

```json
{
  "shoulder_pan": 0,
  "shoulder_lift": 0,
  "elbow_flex": 0,
  "wrist_flex": 0,
  "wrist_roll": 0,
  "gripper": 50
}
```

## Tested End-to-End

Last full local test pass covered:

- `initialize`
- `tools/list`
- `resources/list`
- `resources/read`
- `get_pose_table`
- `list_cameras`
- `view_camera`
- `probe_feetech`
- `connect_so101`
- `observe`
- `move_pose` using the current pose, with `steps: 0`
- `disconnect`
- `python -m py_compile lerobot_mcp_server.py`

Known latest robot observation during testing:

```text
shoulder_pan.pos:  about -109
shoulder_lift.pos: about 0
elbow_flex.pos:    about -70
wrist_flex.pos:    about 0
wrist_roll.pos:    about -164
gripper.pos:       about 0.5
```

## Manual Test Commands

Syntax check:

```sh
.venv/bin/python -m py_compile lerobot_mcp_server.py
```

Run server manually:

```sh
.venv/bin/python lerobot_mcp_server.py
```

Direct LeRobot read:

```sh
.venv/bin/python - <<'PY'
from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig
robot = SO101Follower(SO101FollowerConfig(
    port="/dev/cu.usbmodem5AB01815731",
    id="mcp_so101",
    cameras={},
    max_relative_target=None,
))
try:
    robot.connect(calibrate=False)
    print(robot.get_observation())
finally:
    if robot.is_connected:
        robot.disconnect()
PY
```

## Troubleshooting

### No Servos Found

Symptoms:

```text
No status packet
Missing motor IDs 1..6
probe_feetech returns no hits
```

Likely causes:

- external servo power supply is off,
- USB-C is connected but servo power is not,
- servo bus cable is on the wrong channel,
- board jumper/channel is wrong,
- cable polarity is wrong,
- another process has the serial port open.

Fix: power-cycle the servo board and USB, verify wiring, then run
`probe_feetech` before connecting.

### Intermittent Status Packet Failures

The Feetech bus sometimes returns a transient no-status-packet error immediately
after motion. The server retries observations in `observe_retry`, and raw pings
usually recover. If repeated failures occur, disconnect/reconnect or power-cycle.

### Camera Permission

On macOS, OpenCV camera access may require granting camera permission to the
terminal or MCP host. `list_cameras` may print OpenCV warnings for missing
indices; that is harmless if camera `0` works.

## Repository

GitHub:

```text
https://github.com/JacobFV/chem-0
```

Main commits:

```text
c3f5963 Add LeRobot MCP server
8c7b8b7 Add MCP camera frame tools
```
