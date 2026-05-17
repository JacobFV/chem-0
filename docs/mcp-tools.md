# MCP Tools

`chem-0` exposes a compact stdio MCP interface for camera viewing, joint-space
robot control, bounded Cartesian IK, and experiment logging. The MCP transport
is implemented in TypeScript at `src/apps/mcp-node`; hardware calls are
forwarded through the shared Node backend to the Python bridge.

Every backend tool accepts an optional `experiment_id` where it makes sense.
When it is present, the backend appends `tool_call` and `tool_response` events
to that experiment. Image and audio responses are also copied into `data/blobs`
and referenced from `experiment_artifacts`.

## Experiments

### `create_experiment`

Creates an experiment and a default GPT-5.5 agent session in SQLite. Each
experiment is scoped to one world. If `world_id` is omitted, the experiment
uses the default physical world.

```json
{
  "name": "Bench run",
  "world_id": "world_physical_default",
  "metadata": {
    "operator": "local"
  }
}
```

### `list_experiments`

Lists tracked experiments.

```json
{}
```

### `list_agent_session_events`

Lists append-only events for an experiment.

```json
{
  "experiment_id": "exp_..."
}
```

### `list_experiment_artifacts`

Lists local blob references for an experiment.

```json
{
  "experiment_id": "exp_..."
}
```

## Robot Selection

Robot motion/state tools accept optional `robot_id`. If omitted or `null`, the
backend uses the default robot for the experiment's world. This means an agent
session only needs `experiment_id`; it does not need to pass `world_id` during
normal experiment work.

The backend creates `world_physical_default` automatically. When
`list_connected_robots` detects a real arm, the backend assigns it to that
default physical world unless the operator later moves it.

Robot-aware tools:

- `connect_so101`
- `observe`
- `get_arm_pose`
- `get_position`
- `set_arm_pose`
- `set_position`
- `open_gripper`
- `close_gripper`
- `move_relative`
- `disconnect`

### `set_default_robot`

Sets the default robot id for a world. If `world_id` is omitted but
`experiment_id` is provided, the experiment world is used.

```json
{
  "robot_id": "left_arm",
  "world_id": "world_physical_default"
}
```

### `get_default_robot`

Returns the default robot id for a world, or `null`.

```json
{
  "world_id": "world_physical_default"
}
```

## Worlds

### `list_worlds`

Lists physical and virtual worlds, robot assignments, and virtual entities.

```json
{}
```

### `create_world`

Creates a physical or virtual world.

```json
{
  "name": "Sim bench A",
  "type": "virtual"
}
```

### `delete_world`

Deletes a world that has no experiments. The default physical world is
protected.

```json
{
  "world_id": "world_..."
}
```

### `update_world`

Updates world settings such as name and metadata.

```json
{
  "world_id": "world_...",
  "name": "Sim bench B",
  "metadata": {
    "notes": "local simulator workspace"
  }
}
```

### `assign_robot_to_world`

Assigns a physical robot to a physical world, or a virtual robot to a virtual
world. Use `make_default` to make that robot the world's default.

```json
{
  "robot_id": "sim_so101_a",
  "world_id": "world_...",
  "robot_kind": "virtual",
  "make_default": true
}
```

### `list_virtual_entities`

Lists virtual arms, cameras, and rigid bodies. Pass `world_id` to filter to one
virtual world.

```json
{
  "world_id": "world_..."
}
```

### `create_virtual_arm`

Places a virtual SO-101 arm in a virtual world and registers it as a virtual
robot. The arm entity is created with collision enabled and `collision_mode:
"full"` so a simulator can include it in collision checks against virtual rigid
bodies.

```json
{
  "world_id": "world_...",
  "name": "SO-101 sim A",
  "make_default": true,
  "pose": { "x": 0, "y": 0, "z": 0, "roll": 0, "pitch": 0, "yaw": 0 },
  "spec": { "collision_mode": "full", "collides_with": ["rigid_body"] }
}
```

### `create_virtual_camera`

Places a virtual camera in a virtual world.

```json
{
  "world_id": "world_...",
  "name": "Overhead camera",
  "pose": { "x": 0.35, "y": -0.35, "z": 0.45, "roll": 0, "pitch": -35, "yaw": 45 }
}
```

### `create_virtual_rigid_body`

Places a virtual rigid body in a virtual world. Collision is enabled by default;
provide the collision shape, dimensions, and mass through `spec`.

```json
{
  "world_id": "world_...",
  "name": "Vial rack block",
  "pose": { "x": 0.18, "y": 0, "z": 0.03, "roll": 0, "pitch": 0, "yaw": 0 },
  "spec": {
    "mass_kg": 0.1,
    "collision_shape": "box",
    "dimensions_m": [0.05, 0.05, 0.05],
    "collision_mode": "full",
    "collides_with": ["arm", "rigid_body"]
  }
}
```

### `delete_virtual_entity`

Deletes a virtual arm, camera, or rigid body.

```json
{
  "entity_id": "body_..."
}
```

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
block. With `experiment_id`, the image is also stored as an artifact.

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

### `list_connected_robots`

Lists likely Feetech servo buses and detected servo IDs so GUI users can pick a
connected arm instead of typing a serial port.

```json
{
  "max_id": 12
}
```

### `prepare_so101_calibration`

GUI-friendly deterministic calibration setup. Disables torque, resets homing
and range registers to factory values, and returns the ordered calibration
steps.

```json
{
  "port": "/dev/tty.usbmodem5A460833421"
}
```

### `read_so101_calibration_endpoint`

Reads one stable raw servo position after the human has moved the prompted
joint to an endpoint.

```json
{
  "port": "/dev/tty.usbmodem5A460833421",
  "joint": "shoulder_pan",
  "samples": 5
}
```

### `read_so101_raw_positions`

Reads all raw servo positions for the calibration GUI's live arm preview.

```json
{
  "port": "/dev/tty.usbmodem5A460833421"
}
```

### `finalize_so101_calibration`

Computes and saves a LeRobot-compatible calibration file and optionally writes
the calibration back to the servo registers.

```json
{
  "port": "/dev/tty.usbmodem5A460833421",
  "robot_id": "mcp_so101_b",
  "records": {
    "shoulder_pan": { "first": 900, "second": 3200 }
  },
  "write_motors": true
}
```

### `connect_so101`

Connects the calibrated follower arm.

```json
{
  "port": "/dev/cu.usbmodem5AB01815731",
  "robot_id": "left_arm",
  "id": "mcp_so101",
  "max_delta": 5,
  "calibrate": false
}
```

`port` and `id` default to the known local setup.

### `observe`

Reads raw current normalized LeRobot observation fields.

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

### `get_arm_pose`

Returns the current six-joint pose as both a named object and ordered tuple.

```json
{}
```

Tuple order:

```text
shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper
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

### `set_arm_pose`

Preferred full-arm joint-space motion primitive. Requires all six joint values.

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

## Cartesian IK

### `get_position`

Computes FK for the current joint pose and returns `[x, y, z, gripper]`.
`x/y/z` are meters in the SO-101 URDF base frame.

```json
{}
```

Optional fields:

```json
{
  "urdf_path": "assets/kinematics/so101_kinematics.urdf",
  "target_frame": "gripper_frame_link"
}
```

### `set_position`

Solves IK for an end-effector target, then sends the resulting six-joint pose
through the same validation and interpolation path as `set_arm_pose`.

```json
{
  "x": 0.18,
  "y": 0.02,
  "z": 0.45,
  "gripper": 20,
  "max_step": 5,
  "tolerance_m": 0.004,
  "max_position_error_m": 0.03,
  "allow_out_of_workspace": false,
  "allow_out_of_range": false
}
```

Default workspace:

```text
x: -0.35..0.35 m
y: -0.35..0.35 m
z:  0.02..0.60 m
```

The solver is position-only IK. It uses damped least squares over LeRobot FK,
then rejects the move if the final IK error is above `max_position_error_m`.

### `open_gripper`

Sets only the gripper joint to the calibrated open value while holding the
other joints.

```json
{}
```

### `close_gripper`

Sets only the gripper joint to the calibrated close value while holding the
other joints.

```json
{}
```

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

Prefer `set_arm_pose` or `set_position` when reproducibility matters.

## Expert Placeholder

### `ask_export`

Accepts a question for a future human/domain expert bridge. The current
implementation is intentionally a placeholder and returns:

```text
expert not available
```

```json
{
  "question": "Is this pose safe for the next lab step?"
}
```

## Experiment Measurements

### `record_ph`

Records a pH sample for the current experiment. The Electron app can use
`ph_sample` events to update a real-time chart while preserving the value in
`agent_session_events`.

```json
{
  "value": 7.9,
  "note": "Estimated from universal indicator color.",
  "experiment_id": "exp_..."
}
```

## Human Voice

### `speak_to_human`

Speaks a short message to the nearby human and records the audio as an artifact
when `experiment_id` is provided.

OpenAI TTS is the default and requires `OPENAI_API_KEY`:

```json
{
  "text": "Please confirm the beaker is clear before I move the arm.",
  "provider": "openai",
  "voice": "coral",
  "play": true,
  "experiment_id": "exp_..."
}
```

ElevenLabs mode is optional and requires `ELEVENLABS_API_KEY`. If ElevenLabs is
requested without that key, the backend falls back to OpenAI TTS when available:

```json
{
  "text": "Please confirm the beaker is clear before I move the arm.",
  "provider": "elevenlabs",
  "play": true,
  "experiment_id": "exp_..."
}
```

macOS fallback:

```json
{
  "text": "Please confirm the beaker is clear before I move the arm.",
  "provider": "system",
  "experiment_id": "exp_..."
}
```

### `listen_to_human`

Transcribes human speech. Electron sends microphone recordings as
`audio_base64`; MCP clients can pass a local audio file path that is visible to
the backend process. The returned `text` can be sent as the next user message
in an Electron-hosted agent session.

Requires `OPENAI_API_KEY`.

```json
{
  "audio_path": "/tmp/human-response.webm",
  "mime_type": "audio/webm",
  "experiment_id": "exp_..."
}
```
