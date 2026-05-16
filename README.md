# LeRobot MCP Server

Compact stdio MCP server for a Hugging Face LeRobot SO-101/SO-100 follower arm.

## Run

```sh
.venv/bin/python lerobot_mcp_server.py
```

Example MCP client command configuration:

```json
{
  "command": "/Users/vibestartup/Code/lerobot-test/.venv/bin/python",
  "args": ["/Users/vibestartup/Code/lerobot-test/lerobot_mcp_server.py"]
}
```

## Tools

- `list_serial_ports`: lists likely serial devices.
- `probe_feetech`: scans a port for STS3215 servo IDs without moving motors.
- `connect_so101`: connects to an SO-101/SO-100 follower arm.
- `observe`: reads current joint positions.
- `get_pose_table`: returns calibrated limits and common six-parameter poses.
- `move_pose`: moves to an absolute six-parameter pose.
- `move_relative`: sends small relative joint deltas, capped by `max_delta`.
- `disconnect`: disconnects and lets LeRobot disable torque.

Use `probe_feetech` before `connect_so101`. For the Waveshare Bus Servo Adapter (A),
the servo power supply and USB-control jumper position must be correct or no motor
IDs will be visible.

## Local Calibration

This arm is calibrated as:

- robot id: `mcp_so101`
- port: `/dev/cu.usbmodem5AB01815731`
- calibration file: `/Users/vibestartup/.cache/huggingface/lerobot/calibration/robots/so_follower/mcp_so101.json`

## Pose Context

The server exposes an MCP resource:

- `lerobot://pose-table`

It contains calibrated joint limits, sign notes, and common reference poses.
`move_pose` accepts exactly these six normalized parameters:

```json
{
  "pose": {
    "shoulder_pan": 0,
    "shoulder_lift": 0,
    "elbow_flex": -70,
    "wrist_flex": 0,
    "wrist_roll": -164,
    "gripper": 0.5
  }
}
```

The first five values are degrees in LeRobot's normalized joint space. `gripper`
is `0..100`. The server rejects out-of-range poses by default and interpolates
absolute pose moves using small steps.
