# chem-0

![chem-0 robot arm welcome image](assets/robot_lab_scene.png)

## A small research project in embodied laboratory automation

`chem-0` explores a practical question:

> Can a language-model agent safely operate a low-cost robot arm while using a
> live camera feed as its visual feedback loop?

This repository contains a compact stdio MCP server that lets an MCP-capable
agent, such as Codex, connect to a Hugging Face LeRobot SO-101/SO-100 follower
arm, inspect camera frames, read calibrated joint poses, command the arm
through a six-parameter pose interface, and optionally move the end effector
through a small Cartesian IK interface.

The project is intentionally small enough to understand at a science-fair table:

1. The robot arm is calibrated into a known coordinate space.
2. The camera returns a frame to the agent.
3. The agent receives a table of safe reference poses.
4. The agent chooses a target joint pose or Cartesian position.
5. The MCP server validates the command and moves the arm in small steps.

## Why This Matters

Many lab automation demos assume expensive industrial hardware, custom GUIs, or
hard-coded scripts. `chem-0` asks whether a simple open-source interface can
make robot control more inspectable:

- Every command is a named MCP tool call.
- Every full-arm movement is a six-number pose or a bounded Cartesian target.
- Every pose is checked against calibrated limits.
- Cartesian motion uses a repo-local SO-101 URDF plus LeRobot/`placo` FK.
- Every agent can read the same pose table before moving.
- Camera frames are available through the same MCP channel as motion commands.

That makes the system useful for studying agentic control, safety boundaries,
visual feedback, and the gap between language-model spatial reasoning and real
hardware.

## What Is In The Repo

```text
lerobot_mcp_server.py     Stdio MCP server for robot, camera, pose, and IK tools
README.md                 Visitor-facing project overview
AGENTS.md                 Agent handoff and operating instructions
GEMINI.md                 Same as AGENTS.md
CLAUDE.md                 Same as AGENTS.md
docs/                     Detailed setup, operations, testing, and references
assets/                   Welcome image and SO-101 kinematic URDF
```

## System Diagram

```mermaid
flowchart LR
    agent["MCP Client / LLM Agent<br/>Codex, Claude, Gemini, etc."]
    server["chem-0 stdio MCP Server<br/><code>lerobot_mcp_server.py</code>"]
    pose["Pose Table Resource<br/><code>lerobot://pose-table</code>"]
    ik["SO-101 FK / IK<br/><code>placo</code> + URDF"]
    safety["Validation + Step Interpolation<br/>joint limits, workspace, max_step"]
    expert["Expert Placeholder<br/><code>ask_export(question)</code>"]
    camera["OpenCV Camera<br/>camera_id 0"]
    robot["LeRobot SO-101/SO-100<br/>follower arm"]
    bus["Feetech STS3215 Servo Bus<br/>IDs 1-6 at 1 Mbps"]
    calib["Saved Calibration<br/><code>mcp_so101.json</code>"]

    agent <-->|"stdio MCP<br/>tools + resources"| server
    server -->|"resources/read"| pose
    server -->|"list_cameras<br/>view_camera"| camera
    camera -->|"JPEG / PNG frame<br/>MCP image content"| server
    server -->|"connect_so101<br/>observe|get_arm_pose"| robot
    server -->|"get_position<br/>set_position"| ik
    ik -->|"IK joint target"| safety
    server -->|"set_arm_pose<br/>move_pose alias"| safety
    server -->|"ask_export"| expert
    safety -->|"validated joint action"| robot
    calib -->|"joint limits + homing"| server
    robot <-->|"serial commands"| bus

    classDef agent fill:#eef6ff,stroke:#8fbceb,color:#17324d
    classDef server fill:#f0f8f3,stroke:#92c8a0,color:#1f4d2d
    classDef safety fill:#fff7ec,stroke:#e0ad6e,color:#5d3d16
    classDef ik fill:#eefaf9,stroke:#79bbb4,color:#164d49
    classDef expert fill:#f7f7f7,stroke:#aaa,color:#333
    classDef hardware fill:#f4f1ff,stroke:#a99be8,color:#2f255f
    class agent agent
    class server,pose,calib server
    class safety safety
    class ik ik
    class expert expert
    class camera,robot,bus hardware
```

## Core MCP Tools

The server exposes tools for discovery, vision, robot state, and movement:

- `list_cameras`
- `view_camera`
- `probe_feetech`
- `connect_so101`
- `observe`
- `get_arm_pose`
- `get_pose_table`
- `get_position`
- `set_arm_pose`
- `move_pose` backward-compatible alias
- `set_position`
- `open_gripper`
- `close_gripper`
- `ask_export`
- `move_relative`
- `disconnect`

It also exposes the MCP resource:

```text
lerobot://pose-table
```

That resource gives agents calibrated limits, units, orientation notes, and
common reference poses.

## Six-Parameter Pose Interface

The preferred joint-space motion interface is `set_arm_pose`. It requires
exactly six values and returns the same ordered tuple. `move_pose` is kept as a
backward-compatible alias.

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
  "max_step": 5
}
```

Units:

- `shoulder_pan`: degrees
- `shoulder_lift`: degrees
- `elbow_flex`: degrees
- `wrist_flex`: degrees
- `wrist_roll`: degrees
- `gripper`: percent, `0..100`

By default, poses outside calibrated limits are rejected.

## Cartesian IK Interface

The Cartesian layer is intentionally small:

- `get_position` returns `[x, y, z, gripper]`.
- `set_position` accepts `x`, `y`, `z`, and optional `gripper`.
- Units are meters in the SO-101 URDF base frame for `x/y/z`.
- The gripper remains percent `0..100`.

The default workspace is conservative:

```text
x: -0.35..0.35 m
y: -0.35..0.35 m
z:  0.02..0.60 m
```

The server uses `assets/kinematics/so101_kinematics.urdf` and LeRobot's
`RobotKinematics`/`placo` FK path. A compact damped-least-squares IK loop
computes a six-joint target, then routes the movement through the same joint
limit checks and step interpolation as `set_arm_pose`.

## Known Local Hardware Defaults

The current physical setup was tested with:

```text
robot id: mcp_so101
serial port: /dev/cu.usbmodem5AB01815731
camera id: 0
calibration: ~/.cache/huggingface/lerobot/calibration/robots/so_follower/mcp_so101.json
```

The last validated visual pose was approximately:

```text
shoulder_pan.pos:  about -109
shoulder_lift.pos: about 0
elbow_flex.pos:    about -70
wrist_flex.pos:    about 0
wrist_roll.pos:    about -164
gripper.pos:       about 0.5
```

## Quick Start

Install dependencies:

```sh
python -m venv .venv
.venv/bin/python -m pip install --upgrade pip
./scripts/install_deps.sh
```

Run the server:

```sh
.venv/bin/python lerobot_mcp_server.py
```

Mount it in Codex:

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

Then ask the agent:

```text
Use the chem-0 MCP. Read lerobot://pose-table, list cameras, view camera 0,
probe the LeRobot servos, connect to the SO101 arm, observe the current pose,
then use get_arm_pose/set_arm_pose for joint-space moves or get_position/set_position
for IK moves. Keep max_step <= 5 and stay inside calibrated limits.
```

## Documentation

- [docs/setup.md](docs/setup.md): hardware and software setup
- [docs/architecture.md](docs/architecture.md): reusable Mermaid architecture diagram
- [docs/mcp-tools.md](docs/mcp-tools.md): full tool contracts and examples
- [docs/pose-table.md](docs/pose-table.md): pose semantics and reference poses
- [docs/kinematics.md](docs/kinematics.md): FK/IK setup and Cartesian conventions
- [docs/operations.md](docs/operations.md): safe operating workflow
- [docs/testing.md](docs/testing.md): validation commands and expected results
- [docs/troubleshooting.md](docs/troubleshooting.md): common hardware and camera issues
- [docs/research-notes.md](docs/research-notes.md): project framing and next experiments

## Current Status

Working and tested:

- camera discovery and JPEG frame capture
- Feetech servo probe for IDs `1..6`
- calibrated robot connection
- six-joint observation
- absolute no-op `set_arm_pose` / `move_pose` test
- repo-local SO-101 URDF loading through `placo`
- FK smoke test for `get_position`
- incremental real movement through `move_pose`

Known limitation:

- The Feetech bus can intermittently drop a status packet immediately after
  motion. The server retries observations, but operators should still keep
  motions small and visually monitored.

## Repository

```text
https://github.com/JacobFV/chem-0
```
