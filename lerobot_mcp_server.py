#!/usr/bin/env python3
"""Compact stdio MCP server for a Hugging Face LeRobot SO-101 follower.

Run with:
    python lerobot_mcp_server.py

The server intentionally implements only the small MCP surface needed by most
clients: initialize, tools/list, and tools/call.
"""

from __future__ import annotations

import glob
import json
import sys
import time
import traceback
from dataclasses import dataclass
from typing import Any


PROTOCOL_VERSION = "2024-11-05"
DEFAULT_MAX_DELTA = 5.0
DEFAULT_PORT = "/dev/cu.usbmodem5AB01815731"
DEFAULT_ROBOT_ID = "mcp_so101"
POSE_TABLE_URI = "lerobot://pose-table"

JOINTS = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]

# Normalized limits derived from the saved calibration for mcp_so101. The first
# five joints are degrees; gripper is 0..100.
JOINT_LIMITS = {
    "shoulder_pan": (-116.88, 116.88),
    "shoulder_lift": (-113.05, 113.05),
    "elbow_flex": (-81.05, 81.05),
    "wrist_flex": (-103.99, 103.99),
    "wrist_roll": (-180.0, 180.0),
    "gripper": (0.0, 100.0),
}

POSE_TABLE = {
    "neutral_midrange": {
        "description": "All calibrated joints near their midrange. A conservative reference, not necessarily visually folded.",
        "pose": {
            "shoulder_pan": 0.0,
            "shoulder_lift": 0.0,
            "elbow_flex": 0.0,
            "wrist_flex": 0.0,
            "wrist_roll": 0.0,
            "gripper": 50.0,
        },
    },
    "base_left_vertical_extended": {
        "description": "Observed working pose: base left, upper arm about 90 degrees from the down/floor-parallel pose, elbow extended, wrist straight.",
        "pose": {
            "shoulder_pan": -109.0,
            "shoulder_lift": 0.0,
            "elbow_flex": -70.0,
            "wrist_flex": 0.0,
            "wrist_roll": -164.0,
            "gripper": 0.5,
        },
    },
    "base_center_vertical_extended": {
        "description": "Same vertical/extended arm shape, with base centered.",
        "pose": {
            "shoulder_pan": 0.0,
            "shoulder_lift": 0.0,
            "elbow_flex": -70.0,
            "wrist_flex": 0.0,
            "wrist_roll": -164.0,
            "gripper": 0.5,
        },
    },
    "base_left_floor_parallel_down_reference": {
        "description": "User-observed reference where positive shoulder_lift put the upper arm down, nearly parallel to the floor.",
        "pose": {
            "shoulder_pan": -109.0,
            "shoulder_lift": 108.0,
            "elbow_flex": -70.0,
            "wrist_flex": 0.0,
            "wrist_roll": -164.0,
            "gripper": 0.5,
        },
    },
    "base_left_over_upright_reference": {
        "description": "User-observed reference that overshot the desired vertical pose; useful as an upper-side visual bound.",
        "pose": {
            "shoulder_pan": -109.0,
            "shoulder_lift": -96.0,
            "elbow_flex": -70.0,
            "wrist_flex": 0.0,
            "wrist_roll": -164.0,
            "gripper": 0.5,
        },
    },
    "compact_safe": {
        "description": "Compact-ish conservative pose inside the calibrated range. Use visually and adjust as needed.",
        "pose": {
            "shoulder_pan": 0.0,
            "shoulder_lift": 45.0,
            "elbow_flex": 25.0,
            "wrist_flex": 45.0,
            "wrist_roll": 0.0,
            "gripper": 20.0,
        },
    },
}

POSE_TABLE_NOTE = (
    "Pose values are normalized LeRobot action units for robot id 'mcp_so101': "
    "degrees for shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, and wrist_roll; "
    "0..100 for gripper. Based on visual calibration feedback, shoulder_lift around +108 "
    "looked down/floor-parallel, shoulder_lift around 0 looked roughly 90 degrees/upright, "
    "and shoulder_lift around -96 overshot past upright."
)


def _jsonrpc_result(msg_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _jsonrpc_error(msg_id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": msg_id, "error": err}


def _write_message(message: dict[str, Any]) -> None:
    body = json.dumps(message, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def _tool_text(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "isError": False}


def _tool_json(value: Any) -> dict[str, Any]:
    return _tool_text(json.dumps(value, indent=2, sort_keys=True))


def _tool_error(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def pose_table_payload() -> dict[str, Any]:
    return {
        "robot_id": DEFAULT_ROBOT_ID,
        "default_port": DEFAULT_PORT,
        "units": {
            "shoulder_pan": "degrees",
            "shoulder_lift": "degrees",
            "elbow_flex": "degrees",
            "wrist_flex": "degrees",
            "wrist_roll": "degrees",
            "gripper": "percent_0_to_100",
        },
        "joint_order": JOINTS,
        "joint_limits": JOINT_LIMITS,
        "notes": POSE_TABLE_NOTE,
        "poses": POSE_TABLE,
    }


def pose_table_markdown() -> str:
    payload = pose_table_payload()
    lines = [
        "# LeRobot SO-101 Pose Table",
        "",
        payload["notes"],
        "",
        "Joint order: `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`.",
        "",
        "## Joint Limits",
        "",
        "| Joint | Min | Max | Unit |",
        "| --- | ---: | ---: | --- |",
    ]
    for joint in JOINTS:
        lo, hi = JOINT_LIMITS[joint]
        lines.append(f"| `{joint}` | {lo:.2f} | {hi:.2f} | {payload['units'][joint]} |")

    lines.extend(["", "## Common Poses", "", "| Name | shoulder_pan | shoulder_lift | elbow_flex | wrist_flex | wrist_roll | gripper | Notes |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"])
    for name, entry in POSE_TABLE.items():
        pose = entry["pose"]
        lines.append(
            f"| `{name}` | {pose['shoulder_pan']:.2f} | {pose['shoulder_lift']:.2f} | "
            f"{pose['elbow_flex']:.2f} | {pose['wrist_flex']:.2f} | "
            f"{pose['wrist_roll']:.2f} | {pose['gripper']:.2f} | {entry['description']} |"
        )
    return "\n".join(lines)


def observe_retry(tries: int = 8, delay_s: float = 0.25) -> dict[str, Any]:
    if not STATE.connected:
        raise RuntimeError("Robot is not connected. Call connect_so101 first.")

    last_exc: Exception | None = None
    for _ in range(tries):
        try:
            return STATE.robot.get_observation()
        except Exception as exc:
            last_exc = exc
            time.sleep(delay_s)
    raise RuntimeError(f"Failed to observe after {tries} tries: {last_exc}") from last_exc


def validate_pose(raw_pose: Any, allow_out_of_range: bool = False) -> dict[str, float]:
    if not isinstance(raw_pose, dict):
        raise ValueError("pose must be an object with exactly the six joint names.")

    missing = [joint for joint in JOINTS if joint not in raw_pose]
    extra = [joint for joint in raw_pose if joint not in JOINTS]
    if missing or extra:
        raise ValueError(f"pose must contain exactly {JOINTS}; missing={missing}; extra={extra}")

    pose = {joint: float(raw_pose[joint]) for joint in JOINTS}
    if not allow_out_of_range:
        violations = []
        for joint, value in pose.items():
            lo, hi = JOINT_LIMITS[joint]
            if value < lo or value > hi:
                violations.append(f"{joint}={value:.2f} outside [{lo:.2f}, {hi:.2f}]")
        if violations:
            raise ValueError("Pose outside calibrated limits: " + "; ".join(violations))
    return pose


def action_from_pose(pose: dict[str, float]) -> dict[str, float]:
    return {f"{joint}.pos": value for joint, value in pose.items()}


@dataclass
class RobotState:
    robot: Any = None
    port: str | None = None
    max_delta: float = DEFAULT_MAX_DELTA

    @property
    def connected(self) -> bool:
        return bool(self.robot is not None and self.robot.is_connected)


STATE = RobotState()


RESOURCES: list[dict[str, Any]] = [
    {
        "uri": POSE_TABLE_URI,
        "name": "LeRobot SO-101 pose table",
        "description": "Calibrated joint limits, sign notes, and common six-parameter poses for mcp_so101.",
        "mimeType": "application/json",
    }
]


TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_serial_ports",
        "description": "List likely serial ports for a LeRobot bus servo adapter.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "probe_feetech",
        "description": "Probe a serial port for Feetech STS3215 servo IDs without moving motors.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "string", "description": "Serial port, for example /dev/cu.usbmodem..."},
                "max_id": {"type": "integer", "minimum": 1, "maximum": 253, "default": 10},
            },
            "required": ["port"],
            "additionalProperties": False,
        },
    },
    {
        "name": "connect_so101",
        "description": "Connect to an SO-101/SO-100 follower arm on a Feetech bus.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "string"},
                "id": {"type": "string", "default": "mcp_so101"},
                "max_delta": {
                    "type": "number",
                    "minimum": 0.1,
                    "maximum": 20,
                    "default": DEFAULT_MAX_DELTA,
                    "description": "Max absolute per-joint delta allowed by move_relative.",
                },
                "calibrate": {"type": "boolean", "default": False},
            },
            "required": ["port"],
            "additionalProperties": False,
        },
    },
    {
        "name": "observe",
        "description": "Read current joint positions from the connected robot.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_pose_table",
        "description": "Return calibrated joint limits and common six-parameter pose references.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "move_pose",
        "description": (
            "Move the connected robot to an absolute six-parameter pose. Values are LeRobot normalized "
            "units: degrees for arm joints and 0..100 for gripper. Requires all six joints."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "pose": {
                    "type": "object",
                    "properties": {
                        "shoulder_pan": {"type": "number"},
                        "shoulder_lift": {"type": "number"},
                        "elbow_flex": {"type": "number"},
                        "wrist_flex": {"type": "number"},
                        "wrist_roll": {"type": "number"},
                        "gripper": {"type": "number"},
                    },
                    "required": JOINTS,
                    "additionalProperties": False,
                },
                "max_step": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20,
                    "default": DEFAULT_MAX_DELTA,
                    "description": "Maximum per-joint change per interpolation step.",
                },
                "hold_seconds": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 5,
                    "default": 0.35,
                    "description": "Delay after each interpolation step.",
                },
                "settle_seconds": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 5,
                    "default": 0.5,
                    "description": "Delay before the final observation.",
                },
                "allow_out_of_range": {
                    "type": "boolean",
                    "default": False,
                    "description": "If false, reject values outside calibrated limits.",
                },
            },
            "required": ["pose"],
            "additionalProperties": False,
        },
    },
    {
        "name": "move_relative",
        "description": "Move connected robot joints by small relative deltas, then return observed state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "deltas": {
                    "type": "object",
                    "description": "Map joint name to delta. Names omit .pos, e.g. elbow_flex.",
                    "additionalProperties": {"type": "number"},
                },
                "return_to_start": {"type": "boolean", "default": False},
                "hold_seconds": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 5,
                    "default": 0.25,
                    "description": "Delay after sending the move, and before restoring if requested.",
                },
            },
            "required": ["deltas"],
            "additionalProperties": False,
        },
    },
    {
        "name": "disconnect",
        "description": "Disconnect from the robot and disable torque using LeRobot defaults.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def list_serial_ports(_: dict[str, Any]) -> dict[str, Any]:
    ports = sorted(set(glob.glob("/dev/cu.*") + glob.glob("/dev/tty.*")))
    likely = [p for p in ports if any(s in p.lower() for s in ("usb", "wch", "serial", "modem"))]
    return _tool_json({"likely": likely, "all": ports})


def probe_feetech(args: dict[str, Any]) -> dict[str, Any]:
    from lerobot.motors import Motor, MotorNormMode
    from lerobot.motors.feetech import FeetechMotorsBus
    from lerobot.motors.feetech.tables import SCAN_BAUDRATES

    port = args["port"]
    max_id = int(args.get("max_id", 10))
    motors = {f"id{i}": Motor(i, "sts3215", MotorNormMode.DEGREES) for i in range(1, max_id + 1)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    hits: list[dict[str, int]] = []
    try:
        bus.connect(handshake=False)
        for baud in SCAN_BAUDRATES:
            bus.set_baudrate(baud)
            for servo_id in range(1, max_id + 1):
                model = bus.ping(servo_id, num_retry=1, raise_on_error=False)
                if model is not None:
                    hits.append({"baud": baud, "id": servo_id, "model": int(model)})
        return _tool_json({"port": port, "hits": hits})
    finally:
        if bus.is_connected:
            bus.disconnect(disable_torque=False)


def connect_so101(args: dict[str, Any]) -> dict[str, Any]:
    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

    if STATE.connected:
        STATE.robot.disconnect()

    port = args.get("port", DEFAULT_PORT)
    STATE.max_delta = float(args.get("max_delta", DEFAULT_MAX_DELTA))
    config = SO101FollowerConfig(
        port=port,
        id=args.get("id", DEFAULT_ROBOT_ID),
        cameras={},
        max_relative_target=STATE.max_delta,
    )
    robot = SO101Follower(config)
    robot.connect(calibrate=bool(args.get("calibrate", False)))
    STATE.robot = robot
    STATE.port = port
    return _tool_json({"connected": True, "port": port, "features": sorted(robot.action_features)})


def observe(_: dict[str, Any]) -> dict[str, Any]:
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")
    return _tool_json(observe_retry())


def get_pose_table(_: dict[str, Any]) -> dict[str, Any]:
    return _tool_json(pose_table_payload())


def move_pose(args: dict[str, Any]) -> dict[str, Any]:
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    pose = validate_pose(args.get("pose"), bool(args.get("allow_out_of_range", False)))
    max_step = max(0.5, min(20.0, float(args.get("max_step", STATE.max_delta))))
    hold_seconds = max(0.0, min(5.0, float(args.get("hold_seconds", 0.35))))
    settle_seconds = max(0.0, min(5.0, float(args.get("settle_seconds", 0.5))))

    start = observe_retry()
    steps: list[dict[str, float]] = []

    for _ in range(200):
        current = observe_retry()
        next_pose: dict[str, float] = {}
        done = True

        for joint in JOINTS:
            key = f"{joint}.pos"
            cur = float(current[key])
            target = pose[joint]
            diff = target - cur
            if abs(diff) > 0.75:
                done = False
            next_pose[joint] = cur + max(-max_step, min(max_step, diff))

        if done:
            break

        sent = STATE.robot.send_action(action_from_pose(next_pose))
        steps.append({key.removesuffix(".pos"): value for key, value in sent.items()})
        time.sleep(hold_seconds)
    else:
        return _tool_error("move_pose exceeded 200 interpolation steps before reaching target.")

    time.sleep(settle_seconds)
    final = observe_retry()
    return _tool_json(
        {
            "start": start,
            "target_pose": pose,
            "final": final,
            "steps": len(steps),
            "last_sent": steps[-1] if steps else None,
        }
    )


def move_relative(args: dict[str, Any]) -> dict[str, Any]:
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    deltas = args["deltas"]
    if not isinstance(deltas, dict) or not deltas:
        return _tool_error("deltas must be a non-empty object.")

    start = observe_retry()
    action: dict[str, float] = {}
    for joint, raw_delta in deltas.items():
        key = joint if joint.endswith(".pos") else f"{joint}.pos"
        if key not in start:
            return _tool_error(f"Unknown joint '{joint}'. Available keys: {sorted(start)}")
        delta = float(raw_delta)
        if abs(delta) > STATE.max_delta:
            return _tool_error(f"Delta for {joint} exceeds max_delta={STATE.max_delta}: {delta}")
        action[key] = float(start[key]) + delta

    hold_seconds = max(0.0, min(5.0, float(args.get("hold_seconds", 0.25))))
    sent = STATE.robot.send_action(action)
    time.sleep(hold_seconds)
    after = observe_retry()

    result: dict[str, Any] = {"start": start, "sent": sent, "after": after}
    if bool(args.get("return_to_start", False)):
        restore = {k: start[k] for k in action}
        result["restore_sent"] = STATE.robot.send_action(restore)
        time.sleep(hold_seconds)
        result["restored"] = observe_retry()
    return _tool_json(result)


def disconnect(_: dict[str, Any]) -> dict[str, Any]:
    was_connected = STATE.connected
    if STATE.robot is not None and STATE.robot.is_connected:
        STATE.robot.disconnect()
    STATE.robot = None
    STATE.port = None
    return _tool_json({"disconnected": was_connected})


HANDLERS = {
    "list_serial_ports": list_serial_ports,
    "probe_feetech": probe_feetech,
    "connect_so101": connect_so101,
    "observe": observe,
    "get_pose_table": get_pose_table,
    "move_pose": move_pose,
    "move_relative": move_relative,
    "disconnect": disconnect,
}


def read_resource(uri: str) -> dict[str, Any]:
    if uri == POSE_TABLE_URI:
        return {
            "contents": [
                {
                    "uri": POSE_TABLE_URI,
                    "mimeType": "application/json",
                    "text": json.dumps(pose_table_payload(), indent=2, sort_keys=True),
                },
                {
                    "uri": "lerobot://pose-table.md",
                    "mimeType": "text/markdown",
                    "text": pose_table_markdown(),
                },
            ]
        }
    raise ValueError(f"Unknown resource URI: {uri}")


def handle(request: dict[str, Any]) -> dict[str, Any] | None:
    method = request.get("method")
    msg_id = request.get("id")

    if msg_id is None:
        return None

    try:
        if method == "initialize":
            return _jsonrpc_result(
                msg_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}, "resources": {}},
                    "serverInfo": {"name": "lerobot-mcp", "version": "0.1.0"},
                },
            )
        if method == "resources/list":
            return _jsonrpc_result(msg_id, {"resources": RESOURCES})
        if method == "resources/read":
            params = request.get("params") or {}
            return _jsonrpc_result(msg_id, read_resource(params.get("uri", "")))
        if method == "tools/list":
            return _jsonrpc_result(msg_id, {"tools": TOOLS})
        if method == "tools/call":
            params = request.get("params") or {}
            name = params.get("name")
            args = params.get("arguments") or {}
            if name not in HANDLERS:
                return _jsonrpc_error(msg_id, -32602, f"Unknown tool: {name}")
            return _jsonrpc_result(msg_id, HANDLERS[name](args))
        return _jsonrpc_error(msg_id, -32601, f"Method not found: {method}")
    except Exception as exc:
        return _jsonrpc_error(
            msg_id,
            -32000,
            str(exc),
            {"traceback": traceback.format_exc(limit=8)},
        )


def _read_message() -> dict[str, Any] | None:
    """Read one MCP stdio message.

    MCP stdio uses Content-Length framing. A newline-delimited JSON fallback is
    kept for easy shell smoke tests.
    """
    first = sys.stdin.buffer.readline()
    if not first:
        return None

    if first.lstrip().startswith(b"{"):
        return json.loads(first)

    headers: dict[str, str] = {}
    line = first
    while line not in (b"\r\n", b"\n", b""):
        name, _, value = line.decode("ascii").partition(":")
        headers[name.lower()] = value.strip()
        line = sys.stdin.buffer.readline()

    length = int(headers["content-length"])
    body = sys.stdin.buffer.read(length)
    return json.loads(body)


def main() -> int:
    while True:
        try:
            request = _read_message()
        except Exception as exc:
            _write_message(_jsonrpc_error(None, -32700, f"Parse error: {exc}"))
            continue

        if request is None:
            break

        response = handle(request)
        if response is not None:
            _write_message(response)

    if STATE.connected:
        STATE.robot.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
