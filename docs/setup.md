# Setup

This document captures the setup needed to run `chem-0` without relying on chat
history.

## Hardware

Known working setup:

- Hugging Face LeRobot SO-101/SO-100 follower arm.
- Feetech STS3215 serial bus servos.
- Waveshare-style Bus Servo Adapter (A), or equivalent ST/SC serial bus servo
  driver board.
- USB-C from adapter to laptop.
- External servo power supply connected to the adapter board.
- Arm servo bus cable connected to the correct ST/SC servo bus channel.
- Board jumpers/channel configured so USB controls the servo bus.
- Local camera available as OpenCV camera index `0`.

Known tested defaults:

```text
robot id: mcp_so101
serial port: /dev/cu.usbmodem5AB01815731
camera id: 0
```

## Calibration

The tested local calibration file is:

```text
/Users/vibestartup/.cache/huggingface/lerobot/calibration/robots/so_follower/mcp_so101.json
```

Do not delete it unless recalibrating the physical arm.

For a second arm or a newly assembled arm, use a new `robot_id` and create a
separate calibration file instead of overwriting `mcp_so101.json`.

Deterministic endpoint calibration:

```sh
npm run calibrate:so101 -- \
  --port /dev/tty.usbmodem5A460833421 \
  --robot-id mcp_so101_b
```

The Electron app also has a guided calibration window. Start the app with
`npm run electron:dev`, then click **Calibrate** in the top-right toolbar. The
window displays the SO-101 axes, highlights the current joint, records each
endpoint with a button press, and writes the same calibration format as the
terminal script.

The script prompts joint-by-joint in this order:

| Axis | LeRobot joint | Prompted motion |
| --- | --- | --- |
| `Z1` | `shoulder_pan` | base Z roll left, then right |
| `X1` | `shoulder_lift` | base X pitch backward, then forward |
| `X2` | `elbow_flex` | elbow bent/backward, then extended/forward |
| `X3` | `wrist_flex` | wrist down/backward, then up/forward |
| `Z2` | `wrist_roll` | wrist roll counterclockwise/left, then clockwise/right |
| `Hand` | `gripper` | fully closed, then fully open |

It disables torque, resets homing/limits to the factory range, records raw
servo endpoints when you press Enter, writes:

```text
~/.cache/huggingface/lerobot/calibration/robots/so_follower/<robot_id>.json
```

and also writes the calibration back to the servo registers. Use
`--no-write-motors` to create only the JSON file.

## Python Environment

Create and install:

```sh
python -m venv .venv
.venv/bin/python -m pip install --upgrade pip
./scripts/install_deps.sh
```

`requirements.txt` stays resolver-clean with `lerobot[feetech]`. The install
script then installs `placo==0.9.20` for kinematics and restores NumPy to
LeRobot's supported `<2.3` range. It also refreshes the Pinocchio/Coal shared
library wheels used by `placo`.

Build the Node workspaces:

```sh
npm install
npm run build
```

Run the MCP server:

```sh
node src/apps/mcp-node/dist/server.js
```

## Chem-0 Lab Console

Install Node dependencies and run the desktop console:

```sh
npm install
npm run electron:dev
```

The Electron app lives in `src/apps/electron`. Its main process hosts the same
`@chem0/backend` package used by the MCP server. The backend owns
`data/chem0.sqlite`, `data/blobs`, the Python bridge, and GPT-5.5 streaming
agent sessions.

## Codex MCP Mount

Add:

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

Restart Codex after changing MCP config.

MCP clients should call `create_experiment` first, then pass the returned
`experiment_id` into hardware, camera, and robot tool calls so the backend can
append `tool_call` and `tool_response` records to the experiment.

For multi-arm setups, call `set_default_robot(robot_id)` once or pass
`robot_id` into each robot-aware tool. If `robot_id` is omitted, the backend
uses its current default robot id.

## Optional Voice

For Electron-hosted agent sessions and MCP voice tools:

```sh
export OPENAI_API_KEY=...
export ELEVENLABS_API_KEY=... # optional
export ELEVENLABS_VOICE_ID=... # optional
```

The shared backend also loads a repo-root `.env` file automatically when
running on Node versions that support `process.loadEnvFile`.

`OPENAI_API_KEY` is required for GPT-5.5 sessions and `listen_to_human`.
It is also used by default for `speak_to_human` through OpenAI TTS.
`ELEVENLABS_API_KEY` is optional and only needed for `provider: "elevenlabs"`;
without it, ElevenLabs requests fall back to OpenAI TTS when available.
