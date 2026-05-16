# Shared Backend

The shared backend lives in:

```text
src/lib/backend
```

Both app frontends use it:

- `src/apps/mcp-node` exposes the backend through stdio MCP.
- `src/apps/electron` hosts the backend in the Electron main process and
  exposes it to the renderer through IPC.

## Persistence

The backend creates local data under:

```text
data/
  chem0.sqlite
  blobs/
```

`data/` is intentionally ignored by Git.

## Tables

### `experiments`

One row per experimental run.

Key fields:

- `id`
- `name`
- `status`
- `created_at`
- `updated_at`
- `metadata_json`

### `agent_sessions`

One row per LLM session attached to an experiment.

Key fields:

- `id`
- `experiment_id`
- `model`
- `status`
- `created_at`
- `updated_at`

### `agent_session_events`

Append-only event log for experiment/session activity.

Current event types:

- `message`
- `assistant_delta`
- `assistant_done`
- `tool_call`
- `tool_response`
- `artifact`
- `ph_sample`
- `audio`
- `error`

Messages, tool calls, and tool responses are all stored here so experiment
review can reconstruct what happened.

### `experiment_artifacts`

Blob references for files managed by the backend.

Current artifacts are mostly camera/tool images. The SQLite row stores metadata
and a relative path under `data/blobs`.

## MCP Tracking

MCP clients do not expose the full client-side chat transcript to a tool
server. For that reason, MCP tools accept an optional `experiment_id`.

When `experiment_id` is present:

1. The backend logs a `tool_call`.
2. The Python bridge executes the tool.
3. Image payloads are copied to `data/blobs`.
4. The backend logs a `tool_response`.

Electron sessions are preferred when a complete streaming agent session should
be tracked.

## GPT-5.5 Agent Sessions

The Electron app sends user messages to `Chem0Backend.streamAgentMessage`.
The backend calls the OpenAI Responses API with `gpt-5.5`, streams deltas to
the GUI, handles model-requested tool calls, and persists every event.

`OPENAI_API_KEY` must be present in the process environment or repo-root `.env`
for live agent responses.

## Voice I/O

Backend voice tools:

- `speak_to_human(text, provider?, voice?, voice_id?, play?)`
- `listen_to_human(audio_path? | audio_base64?, mime_type?)`

`speak_to_human` uses OpenAI TTS by default with `gpt-4o-mini-tts`. It writes
an audio file under `data/audio`, plays it locally by default, and when an
`experiment_id` is provided the backend also copies the audio into `data/blobs`
as an experiment artifact.

ElevenLabs remains available with `provider: "elevenlabs"`. If ElevenLabs is
requested but `ELEVENLABS_API_KEY` is missing, the backend falls back to OpenAI
TTS when `OPENAI_API_KEY` is configured.

On macOS, `speak_to_human` can be called with `provider: "system"` to use the
local `say` command without ElevenLabs.

`listen_to_human` uses the OpenAI audio transcription API and requires
`OPENAI_API_KEY` in the process environment or repo-root `.env`. Electron
records microphone clips in the renderer and sends them as `audio_base64`; MCP
clients can pass a backend-visible `audio_path`.
