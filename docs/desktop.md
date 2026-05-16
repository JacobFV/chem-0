# Chem-0 Lab Console

Chem-0 Lab Console is the TypeScript Electron desktop app in:

```text
src/apps/electron
```

The Electron main process hosts `@chem0/backend` directly. It does not spawn the
MCP server. That means the GUI and stdio MCP use the same backend code path
while keeping their transport layers separate:

```text
Electron renderer -> Electron IPC -> @chem0/backend -> Python bridge -> LeRobot/OpenCV
MCP client        -> stdio MCP    -> @chem0/backend -> Python bridge -> LeRobot/OpenCV
```

## Backend Responsibilities

- Initialize and save `data/chem0.sqlite`.
- Manage `data/blobs` for camera and tool artifacts.
- Create experiments and agent sessions.
- Append `agent_session_events` for messages, assistant deltas, tool calls,
  tool responses, artifacts, and errors.
- Stream GPT-5.5 Responses API events into the GUI.
- Run the tool loop when the model requests a backend tool.
- Forward hardware calls to the small Python bridge.
- Provide optional voice I/O tools for human conversation.

## Run

From the repo root:

```sh
npm install
npm run electron:dev
```

The backend uses the repo-local Python virtual environment:

```text
.venv/bin/python
```

## Current Views

The console includes:

- experiment creation and selection,
- GPT-5.5 streaming agent session chat,
- microphone recording for human speech transcription,
- persisted session event replay,
- tool discovery,
- pose table readout,
- serial port and camera discovery,
- one-frame camera capture,
- current arm pose and Cartesian position calls,
- gripper open/close calls,
- `ask_export(question)` placeholder call,
- `speak_to_human` and `listen_to_human` voice tools,
- an arbitrary backend tool-call JSON panel.

Motion tools are exposed through the generic tool-call panel rather than large
movement buttons, so accidental movement requires an explicit JSON payload.
