# Architecture

This diagram is the reusable source for the README architecture overview.

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

## MCP Affordance Map

This map enumerates every current MCP tool and resource by what it lets an
agent do.

```mermaid
flowchart TB
    client["MCP Client / Agent"]
    server["chem-0 MCP Server"]

    discovery["Discovery<br/><code>list_serial_ports</code><br/><code>list_cameras</code>"]
    vision["Vision<br/><code>view_camera</code><br/>JPEG / PNG MCP image"]
    bus_tools["Servo Bus + Connection<br/><code>probe_feetech</code><br/><code>connect_so101</code><br/><code>disconnect</code>"]
    state["State + Context<br/><code>observe</code><br/><code>get_arm_pose</code><br/><code>get_pose_table</code><br/><code>lerobot://pose-table</code>"]
    joint_motion["Joint-Space Motion<br/><code>set_arm_pose</code><br/><code>move_pose</code> alias<br/><code>move_relative</code>"]
    cart_motion["Cartesian Motion<br/><code>get_position</code><br/><code>set_position</code><br/>position-only IK"]
    gripper["Gripper<br/><code>open_gripper</code><br/><code>close_gripper</code>"]
    expert_tool["Expert Placeholder<br/><code>ask_export(question)</code><br/>returns expert not available"]

    client -->|"stdio MCP"| server
    server --> discovery
    server --> vision
    server --> bus_tools
    server --> state
    server --> joint_motion
    server --> cart_motion
    server --> gripper
    server --> expert_tool

    classDef client fill:#eef6ff,stroke:#8fbceb,color:#17324d
    classDef server fill:#f0f8f3,stroke:#92c8a0,color:#1f4d2d
    classDef affordance fill:#fffdf7,stroke:#d2bd7d,color:#3d3416
    class client client
    class server server
    class discovery,vision,bus_tools,state,joint_motion,cart_motion,gripper,expert_tool affordance
```

## Data Flow

1. The MCP client starts `lerobot_mcp_server.py` over stdio.
2. The client reads `lerobot://pose-table` for calibrated limits and reference poses.
3. The client calls `view_camera` to get visual context as an MCP image.
4. The client calls `probe_feetech`, `connect_so101`, and `observe`.
5. The client calls `get_arm_pose`/`set_arm_pose` for joint-space motion or
   `get_position`/`set_position` for Cartesian IK.
6. The client may call `ask_export(question)` when it needs external expertise;
   the current placeholder returns `expert not available`.
7. The server validates the target and interpolates the move in small steps.
8. The server disconnects from the robot when the session is complete.
