# Desktop App

The desktop app is a TypeScript Electron console in:

```text
src/apps/electron
```

It does not talk to the robot directly. Instead, the Electron main process
spawns:

```text
src/apps/mcp/server.py
```

and sends the same stdio MCP JSON-RPC messages that Codex, Claude, Gemini, or
other MCP clients use.

## Why This Shape

The hardware boundary stays in Python because LeRobot, OpenCV, Feetech, and the
current calibration path already work there. The TypeScript layer handles only
desktop UI and MCP orchestration.

This avoids a risky rewrite of the servo protocol while still making the
operator experience richer than raw MCP calls.

## Run

From the repo root:

```sh
npm install
npm run electron:dev
```

The app uses the repo-local Python virtual environment when available:

```text
.venv/bin/python
```

If that path is missing, it falls back to `python3`.

## Current Views

The initial console includes:

- tool discovery,
- pose table readout,
- serial port and camera discovery,
- one-frame camera capture,
- current arm pose and Cartesian position calls,
- gripper open/close calls,
- `ask_export(question)` placeholder call,
- an arbitrary MCP tool-call JSON panel.

Motion tools are exposed through the generic tool-call panel rather than large
buttons, so accidental movement requires an explicit JSON payload.
