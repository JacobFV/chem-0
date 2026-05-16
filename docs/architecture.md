# Architecture

This diagram is the reusable source for the README architecture overview.

```mermaid
flowchart LR
    agent["MCP Client / LLM Agent<br/>Codex, Claude, Gemini, etc."]
    server["chem-0 stdio MCP Server<br/><code>lerobot_mcp_server.py</code>"]
    pose["Pose Table Resource<br/><code>lerobot://pose-table</code>"]
    safety["Pose Validation + Step Interpolation<br/>calibrated limits, max_step"]
    camera["OpenCV Camera<br/>camera_id 0"]
    robot["LeRobot SO-101/SO-100<br/>follower arm"]
    bus["Feetech STS3215 Servo Bus<br/>IDs 1-6 at 1 Mbps"]
    calib["Saved Calibration<br/><code>mcp_so101.json</code>"]

    agent <-->|"stdio MCP<br/>tools + resources"| server
    server -->|"resources/read"| pose
    server -->|"list_cameras<br/>view_camera"| camera
    camera -->|"JPEG / PNG frame<br/>MCP image content"| server
    server -->|"connect_so101<br/>observe"| robot
    server -->|"move_pose"| safety
    safety -->|"validated absolute pose"| robot
    calib -->|"joint limits + homing"| server
    robot <-->|"serial commands"| bus

    classDef agent fill:#eef6ff,stroke:#8fbceb,color:#17324d
    classDef server fill:#f0f8f3,stroke:#92c8a0,color:#1f4d2d
    classDef safety fill:#fff7ec,stroke:#e0ad6e,color:#5d3d16
    classDef hardware fill:#f4f1ff,stroke:#a99be8,color:#2f255f
    class agent agent
    class server,pose,calib server
    class safety safety
    class camera,robot,bus hardware
```

## Data Flow

1. The MCP client starts `lerobot_mcp_server.py` over stdio.
2. The client reads `lerobot://pose-table` for calibrated limits and reference poses.
3. The client calls `view_camera` to get visual context as an MCP image.
4. The client calls `probe_feetech`, `connect_so101`, and `observe`.
5. The client calls `move_pose` with a complete six-parameter pose.
6. The server validates the target and interpolates the move in small steps.
7. The server disconnects from the robot when the session is complete.
