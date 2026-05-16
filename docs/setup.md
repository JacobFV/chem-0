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

Run:

```sh
.venv/bin/python lerobot_mcp_server.py
```

## Codex MCP Mount

Add:

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

Restart Codex after changing MCP config.
