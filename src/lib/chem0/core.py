#!/usr/bin/env python3
"""Core robot, camera, kinematics, and tool implementation for chem-0."""

from __future__ import annotations

import glob
import json
import base64
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_MAX_DELTA = 5.0
DEFAULT_PORT = "/dev/cu.usbmodem5AB01815731"
DEFAULT_ROBOT_ID = "mcp_so101"
POSE_TABLE_URI = "lerobot://pose-table"
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_URDF_PATH = REPO_ROOT / "assets" / "kinematics" / "so101_kinematics.urdf"
DEFAULT_TARGET_FRAME = "gripper_frame_link"
DEFAULT_OPEN_GRIPPER = 0.0
DEFAULT_CLOSE_GRIPPER = 100.0

JOINTS = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]
ARM_JOINTS = JOINTS[:-1]

CALIBRATION_STEPS = [
    {
        "axis": "Z1",
        "joint": "shoulder_pan",
        "id": 1,
        "label": "base Z roll",
        "first": "all the way to the left",
        "second": "all the way to the right",
    },
    {
        "axis": "X1",
        "joint": "shoulder_lift",
        "id": 2,
        "label": "base X pitch",
        "first": "all the way backward",
        "second": "all the way forward",
    },
    {
        "axis": "X2",
        "joint": "elbow_flex",
        "id": 3,
        "label": "elbow X pitch",
        "first": "fully bent/backward",
        "second": "fully extended/forward",
    },
    {
        "axis": "X3",
        "joint": "wrist_flex",
        "id": 4,
        "label": "wrist X pitch",
        "first": "all the way down/backward",
        "second": "all the way up/forward",
    },
    {
        "axis": "Z2",
        "joint": "wrist_roll",
        "id": 5,
        "label": "wrist Z roll",
        "first": "all the way counterclockwise/left",
        "second": "all the way clockwise/right",
    },
    {
        "axis": "Hand",
        "joint": "gripper",
        "id": 6,
        "label": "gripper",
        "first": "fully closed",
        "second": "fully open",
    },
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

# Conservative default bounds for the SO-101 end-effector frame in URDF base
# coordinates, in meters. These are intentionally smaller than the theoretical
# reach and can be overridden per call only with allow_out_of_workspace=true.
CARTESIAN_BOUNDS = {
    "x": (-0.35, 0.35),
    "y": (-0.35, 0.35),
    "z": (0.02, 0.60),
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


def _tool_text(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "isError": False}


def _tool_json(value: Any) -> dict[str, Any]:
    return _tool_text(json.dumps(value, indent=2, sort_keys=True))


def _tool_error(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _tool_image(data: bytes, mime_type: str, metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": [
            {"type": "text", "text": json.dumps(metadata, indent=2, sort_keys=True)},
            {"type": "image", "data": base64.b64encode(data).decode("ascii"), "mimeType": mime_type},
        ],
        "isError": False,
    }


def _camera_backend() -> int:
    import cv2

    if sys.platform == "darwin" and hasattr(cv2, "CAP_AVFOUNDATION"):
        return cv2.CAP_AVFOUNDATION
    return cv2.CAP_ANY


def _open_camera(camera_id: int, width: int | None = None, height: int | None = None) -> Any:
    import cv2

    cap = cv2.VideoCapture(camera_id, _camera_backend())
    if width is not None:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(width))
    if height is not None:
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(height))
    return cap


def _capture_frame(camera_id: int, width: int | None = None, height: int | None = None) -> tuple[Any, dict[str, Any]]:
    import cv2

    cap = _open_camera(camera_id, width, height)
    try:
        if not cap.isOpened():
            raise RuntimeError(f"Camera {camera_id} could not be opened.")

        frame = None
        ok = False
        for _ in range(5):
            ok, frame = cap.read()
            if ok and frame is not None:
                break
            time.sleep(0.1)

        if not ok or frame is None:
            raise RuntimeError(f"Camera {camera_id} opened but did not return a frame.")

        actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        return frame, {"camera_id": camera_id, "width": actual_width, "height": actual_height, "fps": fps}
    finally:
        cap.release()


def pose_table_payload() -> dict[str, Any]:
    return {
        "robot_id": DEFAULT_ROBOT_ID,
        "default_port": DEFAULT_PORT,
        "kinematics": {
            "urdf_path": str(DEFAULT_URDF_PATH),
            "target_frame": DEFAULT_TARGET_FRAME,
            "cartesian_units": "meters",
            "cartesian_bounds": CARTESIAN_BOUNDS,
            "cartesian_tuple_order": ["x", "y", "z", "gripper"],
            "arm_pose_tuple_order": JOINTS,
            "open_gripper": DEFAULT_OPEN_GRIPPER,
            "close_gripper": DEFAULT_CLOSE_GRIPPER,
        },
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
        "Cartesian position order: `x`, `y`, `z`, `gripper`; meters for `x/y/z`, percent 0..100 for `gripper`.",
        "",
        "## Joint Limits",
        "",
        "| Joint | Min | Max | Unit |",
        "| --- | ---: | ---: | --- |",
    ]
    for joint in JOINTS:
        lo, hi = JOINT_LIMITS[joint]
        lines.append(f"| `{joint}` | {lo:.2f} | {hi:.2f} | {payload['units'][joint]} |")

    lines.extend(["", "## Cartesian Bounds", "", "| Axis | Min | Max | Unit |", "| --- | ---: | ---: | --- |"])
    for axis, (lo, hi) in CARTESIAN_BOUNDS.items():
        lines.append(f"| `{axis}` | {lo:.3f} | {hi:.3f} | meters |")

    lines.extend(["", "## Common Poses", "", "| Name | shoulder_pan | shoulder_lift | elbow_flex | wrist_flex | wrist_roll | gripper | Notes |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"])
    for name, entry in POSE_TABLE.items():
        pose = entry["pose"]
        lines.append(
            f"| `{name}` | {pose['shoulder_pan']:.2f} | {pose['shoulder_lift']:.2f} | "
            f"{pose['elbow_flex']:.2f} | {pose['wrist_flex']:.2f} | "
            f"{pose['wrist_roll']:.2f} | {pose['gripper']:.2f} | {entry['description']} |"
        )
    return "\n".join(lines)


def _robot_id_from_args(args: dict[str, Any] | None = None) -> str:
    if args and args.get("robot_id"):
        return str(args["robot_id"])
    return DEFAULT_ROBOT_ID


def robot_state(args_or_id: dict[str, Any] | str | None = None) -> "RobotState":
    if isinstance(args_or_id, str):
        robot_id = args_or_id or DEFAULT_ROBOT_ID
    else:
        robot_id = _robot_id_from_args(args_or_id)
    if robot_id not in ROBOTS:
        ROBOTS[robot_id] = RobotState(robot_id=robot_id)
    return ROBOTS[robot_id]


def observe_retry(state: "RobotState", tries: int = 8, delay_s: float = 0.25) -> dict[str, Any]:
    if not state.connected:
        raise RuntimeError("Robot is not connected. Call connect_so101 first.")

    last_exc: Exception | None = None
    for _ in range(tries):
        try:
            return state.robot.get_observation()
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


def arm_pose_from_observation(observation: dict[str, Any]) -> dict[str, float]:
    return {joint: float(observation[f"{joint}.pos"]) for joint in JOINTS}


def arm_pose_tuple(pose: dict[str, float]) -> list[float]:
    return [float(pose[joint]) for joint in JOINTS]


def arm_array(pose: dict[str, float]) -> Any:
    import numpy as np

    return np.array([pose[joint] for joint in ARM_JOINTS], dtype=float)


def action_from_pose(pose: dict[str, float]) -> dict[str, float]:
    return {f"{joint}.pos": value for joint, value in pose.items()}


def validate_position(x: float, y: float, z: float, allow_out_of_workspace: bool = False) -> dict[str, float]:
    position = {"x": float(x), "y": float(y), "z": float(z)}
    if allow_out_of_workspace:
        return position

    violations = []
    for axis, value in position.items():
        lo, hi = CARTESIAN_BOUNDS[axis]
        if value < lo or value > hi:
            violations.append(f"{axis}={value:.4f} outside [{lo:.4f}, {hi:.4f}]")
    if violations:
        raise ValueError("Position outside conservative workspace: " + "; ".join(violations))
    return position


def get_kinematics(state: "RobotState", urdf_path: str | None = None, target_frame: str | None = None) -> Any:
    from lerobot.model.kinematics import RobotKinematics

    resolved_urdf = str(Path(urdf_path or state.urdf_path or DEFAULT_URDF_PATH).expanduser().resolve())
    resolved_target = target_frame or state.target_frame or DEFAULT_TARGET_FRAME

    if not Path(resolved_urdf).exists():
        raise FileNotFoundError(f"URDF not found: {resolved_urdf}")

    if (
        state.kinematics is None
        or state.urdf_path != resolved_urdf
        or state.target_frame != resolved_target
    ):
        state.kinematics = RobotKinematics(
            urdf_path=resolved_urdf,
            target_frame_name=resolved_target,
            joint_names=ARM_JOINTS,
        )
        state.urdf_path = resolved_urdf
        state.target_frame = resolved_target

    return state.kinematics


def forward_kinematics_for_pose(
    pose: dict[str, float],
    urdf_path: str | None = None,
    target_frame: str | None = None,
    state: "RobotState" | None = None,
) -> Any:
    return get_kinematics(state or robot_state(DEFAULT_ROBOT_ID), urdf_path, target_frame).forward_kinematics(arm_array(pose))


def forward_kinematics_for_arm_array(q: Any, urdf_path: str | None = None, target_frame: str | None = None, state: "RobotState" | None = None) -> Any:
    return get_kinematics(state or robot_state(DEFAULT_ROBOT_ID), urdf_path, target_frame).forward_kinematics(q)


def rotation_vector_from_matrix(matrix: Any) -> list[float]:
    from lerobot.utils.rotation import Rotation

    return [float(v) for v in Rotation.from_matrix(matrix[:3, :3]).as_rotvec()]


def solve_position_ik(
    start_pose: dict[str, float],
    target_xyz: dict[str, float],
    state: "RobotState",
    urdf_path: str | None = None,
    target_frame: str | None = None,
    tolerance_m: float = 0.004,
    max_iterations: int = 120,
    damping: float = 0.005,
    max_joint_step_deg: float = 5.0,
) -> dict[str, Any]:
    import numpy as np

    q = arm_array(start_pose)
    target = np.array([target_xyz["x"], target_xyz["y"], target_xyz["z"]], dtype=float)
    limits = np.array([JOINT_LIMITS[joint] for joint in ARM_JOINTS], dtype=float)
    kinematics = get_kinematics(state, urdf_path, target_frame)
    last_error = None

    for iteration in range(max_iterations + 1):
        pos = kinematics.forward_kinematics(q)[:3, 3]
        error = target - pos
        error_norm = float(np.linalg.norm(error))
        last_error = error_norm
        if error_norm <= tolerance_m:
            break
        if iteration == max_iterations:
            break

        jacobian = np.zeros((3, len(q)), dtype=float)
        eps_deg = 0.5
        for i in range(len(q)):
            qp = q.copy()
            qm = q.copy()
            qp[i] = min(limits[i, 1], qp[i] + eps_deg)
            qm[i] = max(limits[i, 0], qm[i] - eps_deg)
            if qp[i] == qm[i]:
                continue
            pp = kinematics.forward_kinematics(qp)[:3, 3]
            pm = kinematics.forward_kinematics(qm)[:3, 3]
            jacobian[:, i] = (pp - pm) / (qp[i] - qm[i])

        lhs = jacobian @ jacobian.T + (damping * damping) * np.eye(3)
        dq = jacobian.T @ np.linalg.solve(lhs, error)
        largest_step = float(np.max(np.abs(dq)))
        if largest_step > max_joint_step_deg:
            dq *= max_joint_step_deg / largest_step
        q = np.clip(q + dq, limits[:, 0], limits[:, 1])

    solved_pose = dict(start_pose)
    for i, joint in enumerate(ARM_JOINTS):
        solved_pose[joint] = float(q[i])

    final_transform = kinematics.forward_kinematics(q)
    final_xyz = [float(v) for v in final_transform[:3, 3]]
    return {
        "pose": solved_pose,
        "tuple": arm_pose_tuple(solved_pose),
        "iterations": iteration,
        "position_error_m": float(last_error if last_error is not None else 0.0),
        "final_xyz": final_xyz,
        "target_xyz": [float(v) for v in target],
        "tolerance_m": float(tolerance_m),
    }


def perform_set_arm_pose(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        raise RuntimeError("Robot is not connected. Call connect_so101 first.")

    pose = validate_pose(args.get("pose"), bool(args.get("allow_out_of_range", False)))
    max_step = max(0.5, min(20.0, float(args.get("max_step", state.max_delta))))
    hold_seconds = max(0.0, min(5.0, float(args.get("hold_seconds", 0.35))))
    settle_seconds = max(0.0, min(5.0, float(args.get("settle_seconds", 0.5))))

    start = observe_retry(state)
    steps: list[dict[str, float]] = []

    for _ in range(200):
        current = observe_retry(state)
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

        sent = state.robot.send_action(action_from_pose(next_pose))
        steps.append({key.removesuffix(".pos"): value for key, value in sent.items()})
        time.sleep(hold_seconds)
    else:
        raise RuntimeError("set_arm_pose exceeded 200 interpolation steps before reaching target.")

    time.sleep(settle_seconds)
    final = observe_retry(state)
    return {
        "start": start,
        "start_pose": arm_pose_from_observation(start),
        "start_tuple": arm_pose_tuple(arm_pose_from_observation(start)),
        "target_pose": pose,
        "target_tuple": arm_pose_tuple(pose),
        "final": final,
        "final_pose": arm_pose_from_observation(final),
        "final_tuple": arm_pose_tuple(arm_pose_from_observation(final)),
        "steps": len(steps),
        "last_sent": steps[-1] if steps else None,
    }


@dataclass
class RobotState:
    robot_id: str = DEFAULT_ROBOT_ID
    robot: Any = None
    port: str | None = None
    max_delta: float = DEFAULT_MAX_DELTA
    kinematics: Any = None
    urdf_path: str = str(DEFAULT_URDF_PATH)
    target_frame: str = DEFAULT_TARGET_FRAME

    @property
    def connected(self) -> bool:
        return bool(self.robot is not None and self.robot.is_connected)


ROBOTS: dict[str, RobotState] = {}
STATE = robot_state(DEFAULT_ROBOT_ID)


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
        "name": "list_cameras",
        "description": "Probe local OpenCV camera indices and return cameras that can provide a frame.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "max_id": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 20,
                    "default": 5,
                    "description": "Highest numeric camera index to probe, inclusive.",
                }
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "view_camera",
        "description": "Capture one camera frame and return it as an MCP image content block.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "camera_id": {
                    "type": "integer",
                    "minimum": 0,
                    "default": 0,
                    "description": "OpenCV camera index to capture from.",
                },
                "width": {"type": "integer", "minimum": 1, "maximum": 4096},
                "height": {"type": "integer", "minimum": 1, "maximum": 4096},
                "format": {
                    "type": "string",
                    "enum": ["jpeg", "png"],
                    "default": "jpeg",
                    "description": "Encoded image format returned in the MCP image content.",
                },
                "quality": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "default": 85,
                    "description": "JPEG quality; ignored for PNG.",
                },
            },
            "additionalProperties": False,
        },
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
        "name": "list_connected_robots",
        "description": "List likely connected LeRobot/Feetech servo buses with detected servo IDs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "max_id": {"type": "integer", "minimum": 1, "maximum": 253, "default": 12},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "prepare_so101_calibration",
        "description": "Prepare an SO-101 arm for deterministic GUI calibration by disabling torque and resetting homing/limits.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "string"},
                "baud": {"type": "integer", "default": 1000000},
            },
            "required": ["port"],
            "additionalProperties": False,
        },
    },
    {
        "name": "read_so101_calibration_endpoint",
        "description": "Read one raw SO-101 servo position for deterministic calibration.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "string"},
                "joint": {"type": "string", "enum": JOINTS},
                "samples": {"type": "integer", "minimum": 1, "maximum": 25, "default": 5},
                "baud": {"type": "integer", "default": 1000000},
            },
            "required": ["port", "joint"],
            "additionalProperties": False,
        },
    },
    {
        "name": "read_so101_raw_positions",
        "description": "Read all raw SO-101 servo positions without applying calibration.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "string"},
                "baud": {"type": "integer", "default": 1000000},
            },
            "required": ["port"],
            "additionalProperties": False,
        },
    },
    {
        "name": "finalize_so101_calibration",
        "description": "Compute and save a deterministic SO-101 calibration file, optionally writing it to servo registers.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "string"},
                "robot_id": {"type": "string"},
                "records": {"type": "object", "additionalProperties": True},
                "write_motors": {"type": "boolean", "default": True},
                "baud": {"type": "integer", "default": 1000000},
            },
            "required": ["port", "robot_id", "records"],
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
        "description": "Read raw current LeRobot observation fields from the connected robot.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_arm_pose",
        "description": "Return the current six-joint arm pose as both a named object and ordered 6-tuple.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_pose_table",
        "description": "Return calibrated joint limits and common six-parameter pose references.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_position",
        "description": (
            "Return the current Cartesian end-effector position from FK as [x, y, z, gripper]. "
            "Coordinates are meters in the SO-101 URDF base frame."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "urdf_path": {"type": "string", "description": "Optional URDF path. Defaults to the repo-local SO101 kinematic URDF."},
                "target_frame": {"type": "string", "default": DEFAULT_TARGET_FRAME},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "set_arm_pose",
        "description": (
            "Move the connected robot to an absolute six-parameter arm pose. Values are LeRobot normalized "
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
        "name": "set_position",
        "description": (
            "Move the end-effector to Cartesian x/y/z in meters using position-only IK over LeRobot FK, "
            "optionally setting gripper."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "x": {"type": "number"},
                "y": {"type": "number"},
                "z": {"type": "number"},
                "gripper": {"type": "number", "minimum": 0, "maximum": 100},
                "urdf_path": {"type": "string", "description": "Optional URDF path. Defaults to the repo-local SO101 kinematic URDF."},
                "target_frame": {"type": "string", "default": DEFAULT_TARGET_FRAME},
                "tolerance_m": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 0.05,
                    "default": 0.004,
                    "description": "Target Cartesian error tolerance before the IK loop stops.",
                },
                "max_position_error_m": {
                    "type": "number",
                    "minimum": 0.001,
                    "maximum": 0.10,
                    "default": 0.03,
                    "description": "Reject the move if IK cannot get this close to the requested position.",
                },
                "max_step": {"type": "number", "minimum": 0.5, "maximum": 20, "default": DEFAULT_MAX_DELTA},
                "hold_seconds": {"type": "number", "minimum": 0, "maximum": 5, "default": 0.35},
                "settle_seconds": {"type": "number", "minimum": 0, "maximum": 5, "default": 0.5},
                "allow_out_of_workspace": {"type": "boolean", "default": False},
                "allow_out_of_range": {"type": "boolean", "default": False},
            },
            "required": ["x", "y", "z"],
            "additionalProperties": False,
        },
    },
    {
        "name": "open_gripper",
        "description": "Open the gripper by setting the gripper joint to the calibrated open value while holding other joints.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "value": {"type": "number", "minimum": 0, "maximum": 100, "default": DEFAULT_OPEN_GRIPPER},
                "max_step": {"type": "number", "minimum": 0.5, "maximum": 20, "default": DEFAULT_MAX_DELTA},
                "hold_seconds": {"type": "number", "minimum": 0, "maximum": 5, "default": 0.35},
                "settle_seconds": {"type": "number", "minimum": 0, "maximum": 5, "default": 0.5},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "close_gripper",
        "description": "Close the gripper by setting the gripper joint to the calibrated close value while holding other joints.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "value": {"type": "number", "minimum": 0, "maximum": 100, "default": DEFAULT_CLOSE_GRIPPER},
                "max_step": {"type": "number", "minimum": 0.5, "maximum": 20, "default": DEFAULT_MAX_DELTA},
                "hold_seconds": {"type": "number", "minimum": 0, "maximum": 5, "default": 0.35},
                "settle_seconds": {"type": "number", "minimum": 0, "maximum": 5, "default": 0.5},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "ask_export",
        "description": "Ask a human/domain expert a question. Placeholder implementation currently reports that the expert is unavailable.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "minLength": 1,
                    "description": "Question to ask the expert.",
                }
            },
            "required": ["question"],
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
    {
        "name": "start_lerobot_session",
        "description": "Start a LeRobot recording session: connect leader (torque off), connect follower (SO101Follower with cameras), create LeRobotDataset, start mirror thread. Returns session_id and camera info.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "leader_port": {"type": "string", "description": "Serial port for the leader arm (torque disabled)."},
                "follower_port": {"type": "string", "description": "Serial port for the follower arm (with cameras)."},
                "repo_id": {"type": "string", "description": "HF dataset repo id, e.g. myuser/pick-and-pour-demo"},
                "task": {"type": "string", "description": "Task name, e.g. pick-and-pour"},
                "fps": {"type": "integer", "default": 30},
                "cameras": {
                    "type": "object",
                    "description": "Camera config dict, e.g. {\"front\": {\"type\": \"opencv\", \"index_or_path\": 0, \"width\": 640, \"height\": 480, \"fps\": 30}}",
                },
                "push_to_hub": {"type": "boolean", "default": False},
                "root": {"type": "string", "description": "Local dataset root directory."},
            },
            "required": ["leader_port", "follower_port", "repo_id", "task"],
            "additionalProperties": False,
        },
    },
    {
        "name": "start_lerobot_episode",
        "description": "Start a new episode in the LeRobot dataset buffer. Call before capturing frames for a new episode.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "capture_lerobot_frame",
        "description": "Read follower observation (state + camera images) and leader positions, add frame to dataset buffer. Returns frame index and observation keys.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "save_lerobot_episode",
        "description": "Save the current episode buffer to disk as a LeRobot dataset episode.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "stop_lerobot_session",
        "description": "Stop the recording session: finalize dataset, disconnect arms, optionally push to HF Hub.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string", "description": "Session id from start_lerobot_session."}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "start_lerobot_teleop",
        "description": "Start leader-follower teleoperation without recording. Mirrors leader arm to follower until stop_lerobot_teleop.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "leader_port": {"type": "string", "description": "Serial port for the leader arm (torque disabled)."},
                "follower_port": {"type": "string", "description": "Serial port for the follower arm."},
                "fps": {"type": "integer", "default": 50, "description": "Mirror loop frequency."},
            },
            "required": ["leader_port", "follower_port"],
            "additionalProperties": False,
        },
    },
    {
        "name": "stop_lerobot_teleop",
        "description": "Stop an active teleoperation session and disconnect arms.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "replay_episode",
        "description": "Replay a recorded dataset episode on the robot. Connects, replays all frames, then disconnects.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "repo_id": {"type": "string", "description": "HF dataset repo id, e.g. myuser/pick-and-pour-demo"},
                "episode": {"type": "integer", "default": 0},
                "port": {"type": "string", "description": "Serial port for the robot."},
                "robot_id": {"type": "string", "default": DEFAULT_ROBOT_ID},
                "fps": {"type": "integer", "default": 30},
                "play_sounds": {"type": "boolean", "default": False},
            },
            "required": ["repo_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "train_policy",
        "description": "Start training a policy (ACT, Diffusion, etc.) on a dataset in a background thread. Returns a session_id for status polling.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "dataset_repo_id": {"type": "string", "description": "HF dataset repo id to train on."},
                "policy_type": {"type": "string", "default": "act", "enum": ["act", "diffusion", "tdmpc"]},
                "output_dir": {"type": "string", "default": "outputs/train"},
                "steps": {"type": "integer", "default": 50000},
                "batch_size": {"type": "integer", "default": 8},
                "device": {"type": "string", "default": "cuda"},
                "wandb_enable": {"type": "boolean", "default": False},
            },
            "required": ["dataset_repo_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_training_status",
        "description": "Poll training progress: returns done flag, alive flag, and recent log lines.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "stop_training",
        "description": "Stop an active training session.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_checkpoints",
        "description": "List trained policy checkpoints in the output directory.",
        "inputSchema": {
            "type": "object",
            "properties": {"output_dir": {"type": "string", "default": "outputs/train"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "run_policy",
        "description": "Deploy a trained policy on the robot for autonomous control. Runs until stop_policy is called.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "policy_path": {"type": "string", "description": "Path or HF hub id to the pretrained policy."},
                "port": {"type": "string", "description": "Serial port for the robot."},
                "robot_id": {"type": "string", "default": DEFAULT_ROBOT_ID},
                "fps": {"type": "integer", "default": 30},
                "single_task": {"type": "string", "default": "perform task"},
            },
            "required": ["policy_path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "stop_policy",
        "description": "Stop a running policy deployment session.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
            "additionalProperties": False,
        },
    },
]


def list_serial_ports(_: dict[str, Any]) -> dict[str, Any]:
    ports = sorted(set(glob.glob("/dev/cu.*") + glob.glob("/dev/tty.*")))
    likely = [p for p in ports if any(s in p.lower() for s in ("usb", "wch", "serial", "modem"))]
    return _tool_json({"likely": likely, "all": ports})


def list_cameras(args: dict[str, Any]) -> dict[str, Any]:
    max_id = int(args.get("max_id", 5))
    cameras = []
    errors = {}

    for camera_id in range(max_id + 1):
        try:
            _, metadata = _capture_frame(camera_id)
            cameras.append(metadata)
        except Exception as exc:
            errors[str(camera_id)] = str(exc)

    return _tool_json({"cameras": cameras, "errors": errors})


def view_camera(args: dict[str, Any]) -> dict[str, Any]:
    import cv2

    camera_id = int(args.get("camera_id", 0))
    width = int(args["width"]) if "width" in args else None
    height = int(args["height"]) if "height" in args else None
    image_format = args.get("format", "jpeg")
    quality = int(args.get("quality", 85))

    frame, metadata = _capture_frame(camera_id, width, height)
    if image_format == "png":
        ok, encoded = cv2.imencode(".png", frame)
        mime_type = "image/png"
    else:
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        mime_type = "image/jpeg"

    if not ok:
        return _tool_error(f"Failed to encode camera {camera_id} frame as {image_format}.")

    metadata = {**metadata, "format": image_format, "mime_type": mime_type}
    return _tool_image(encoded.tobytes(), mime_type, metadata)


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


def list_connected_robots(args: dict[str, Any]) -> dict[str, Any]:
    from lerobot.motors import Motor, MotorNormMode
    from lerobot.motors.feetech import FeetechMotorsBus

    max_id = int(args.get("max_id", 12))
    ports = sorted(set(glob.glob("/dev/tty.usb*") + glob.glob("/dev/tty.wch*") + glob.glob("/dev/cu.usb*") + glob.glob("/dev/cu.wch*")))
    robots = []
    seen_devices: set[str] = set()
    for port in ports:
        canonical = port.replace("/dev/cu.", "/dev/tty.")
        if canonical in seen_devices:
            continue
        seen_devices.add(canonical)
        motors = {f"id{i}": Motor(i, "sts3215", MotorNormMode.DEGREES) for i in range(1, max_id + 1)}
        bus = FeetechMotorsBus(port=canonical, motors=motors)
        hits = []
        try:
            bus.connect(handshake=False)
            bus.set_baudrate(1000000)
            for servo_id in range(1, max_id + 1):
                model = bus.ping(servo_id, num_retry=1, raise_on_error=False)
                if model is not None:
                    hit: dict[str, Any] = {"id": servo_id, "model": int(model)}
                    try:
                        hit["voltage"] = bus.read("Present_Voltage", f"id{servo_id}", normalize=False, num_retry=1)
                    except Exception:
                        pass
                    hits.append(hit)
        except Exception as exc:
            robots.append({"port": canonical, "hits": hits, "error": str(exc)})
            continue
        finally:
            if bus.is_connected:
                bus.disconnect(disable_torque=False)
        if hits:
            ids = [hit["id"] for hit in hits]
            robots.append(
                {
                    "port": canonical,
                    "hits": hits,
                    "servo_ids": ids,
                    "looks_like_so101": ids[:6] == [1, 2, 3, 4, 5, 6],
                    "suggested_robot_id": "mcp_so101_b" if "5A460833421" in canonical else DEFAULT_ROBOT_ID,
                }
            )
    return _tool_json({"robots": robots})


def calibration_bus(port: str) -> Any:
    from lerobot.motors import Motor, MotorNormMode
    from lerobot.motors.feetech import FeetechMotorsBus

    motors = {
        "shoulder_pan": Motor(1, "sts3215", MotorNormMode.DEGREES),
        "shoulder_lift": Motor(2, "sts3215", MotorNormMode.DEGREES),
        "elbow_flex": Motor(3, "sts3215", MotorNormMode.DEGREES),
        "wrist_flex": Motor(4, "sts3215", MotorNormMode.DEGREES),
        "wrist_roll": Motor(5, "sts3215", MotorNormMode.DEGREES),
        "gripper": Motor(6, "sts3215", MotorNormMode.RANGE_0_100),
    }
    return FeetechMotorsBus(port=port, motors=motors)


def calibration_path(robot_id: str) -> Path:
    if not robot_id.strip():
        raise ValueError("robot_id is required.")
    return Path.home() / ".cache/huggingface/lerobot/calibration/robots/so_follower" / f"{robot_id}.json"


def read_stable_raw_position(bus: Any, joint: str, samples: int = 5) -> int:
    from statistics import median

    values = []
    for _ in range(max(1, min(25, int(samples)))):
        values.append(int(bus.read("Present_Position", joint, normalize=False, num_retry=3)))
        time.sleep(0.04)
    return int(median(values))


def compute_calibration(records: dict[str, Any]) -> dict[str, Any]:
    calibration: dict[str, Any] = {}
    for spec in CALIBRATION_STEPS:
        joint = spec["joint"]
        if joint not in records or not isinstance(records[joint], dict):
            raise ValueError(f"Missing calibration records for {joint}.")
        entry = records[joint]
        raw_a = int(entry["first"])
        raw_b = int(entry["second"])
        raw_min = min(raw_a, raw_b)
        raw_max = max(raw_a, raw_b)
        if raw_max - raw_min < 8:
            raise ValueError(f"{joint} endpoints are too close together: {raw_a}, {raw_b}")

        midpoint = round((raw_min + raw_max) / 2)
        homing_offset = midpoint - 2047
        range_min = raw_min - homing_offset
        range_max = raw_max - homing_offset
        if not (0 <= range_min < range_max <= 4095):
            raise ValueError(
                f"{joint} homed range [{range_min}, {range_max}] is outside 0..4095. "
                f"Raw endpoints were {raw_a}, {raw_b}."
            )
        calibration[joint] = {
            "id": int(spec["id"]),
            "drive_mode": 0,
            "homing_offset": int(homing_offset),
            "range_min": int(range_min),
            "range_max": int(range_max),
        }
    return calibration


def prepare_so101_calibration(args: dict[str, Any]) -> dict[str, Any]:
    from lerobot.motors.feetech import OperatingMode

    port = args["port"]
    baud = int(args.get("baud", 1000000))
    bus = calibration_bus(port)
    try:
        bus.connect(handshake=True)
        bus.set_baudrate(baud)
        bus.disable_torque(num_retry=3)
        for joint in JOINTS:
            bus.write("Operating_Mode", joint, OperatingMode.POSITION.value, normalize=False, num_retry=3)
        bus.reset_calibration()
        bus.disable_torque(num_retry=3)
        positions = bus.sync_read("Present_Position", normalize=False, num_retry=3)
        return _tool_json({"port": port, "baud": baud, "steps": CALIBRATION_STEPS, "positions": positions})
    finally:
        if bus.is_connected:
            bus.disconnect(disable_torque=False)


def read_so101_calibration_endpoint(args: dict[str, Any]) -> dict[str, Any]:
    port = args["port"]
    joint = args["joint"]
    if joint not in JOINTS:
        return _tool_error(f"Unknown joint: {joint}")
    bus = calibration_bus(port)
    try:
        bus.connect(handshake=True)
        bus.set_baudrate(int(args.get("baud", 1000000)))
        bus.disable_torque(num_retry=3)
        position = read_stable_raw_position(bus, joint, int(args.get("samples", 5)))
        return _tool_json({"port": port, "joint": joint, "raw_position": position})
    finally:
        if bus.is_connected:
            bus.disconnect(disable_torque=False)


def read_so101_raw_positions(args: dict[str, Any]) -> dict[str, Any]:
    port = args["port"]
    bus = calibration_bus(port)
    try:
        bus.connect(handshake=True)
        bus.set_baudrate(int(args.get("baud", 1000000)))
        bus.disable_torque(num_retry=1)
        positions = bus.sync_read("Present_Position", normalize=False, num_retry=2)
        return _tool_json({"port": port, "positions": positions})
    finally:
        if bus.is_connected:
            bus.disconnect(disable_torque=False)


def finalize_so101_calibration(args: dict[str, Any]) -> dict[str, Any]:
    from lerobot.motors import MotorCalibration

    port = args["port"]
    robot_id = str(args["robot_id"])
    records = args.get("records")
    if not isinstance(records, dict):
        return _tool_error("records must be an object keyed by joint.")
    calibration = compute_calibration(records)
    path = calibration_path(robot_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = path.with_suffix(path.suffix + f".bak-{time.strftime('%Y%m%d-%H%M%S')}")
        backup.write_text(path.read_text())
    else:
        backup = None
    path.write_text(json.dumps(calibration, indent=4) + "\n")
    records_path = path.with_suffix(".records.json")
    records_path.write_text(json.dumps({"records": records, "calibration": calibration}, indent=2) + "\n")

    wrote_motors = False
    if bool(args.get("write_motors", True)):
        bus = calibration_bus(port)
        try:
            bus.connect(handshake=True)
            bus.set_baudrate(int(args.get("baud", 1000000)))
            motor_calibration = {joint: MotorCalibration(**values) for joint, values in calibration.items()}
            bus.write_calibration(motor_calibration, cache=True)
            bus.disable_torque(num_retry=3)
            wrote_motors = True
        finally:
            if bus.is_connected:
                bus.disconnect(disable_torque=False)

    return _tool_json(
        {
            "robot_id": robot_id,
            "port": port,
            "calibration_path": str(path),
            "records_path": str(records_path),
            "backup_path": str(backup) if backup else None,
            "wrote_motors": wrote_motors,
            "calibration": calibration,
        }
    )


def connect_so101(args: dict[str, Any]) -> dict[str, Any]:
    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

    state = robot_state(args)
    if state.connected:
        state.robot.disconnect()

    port = args.get("port", DEFAULT_PORT)
    state.max_delta = float(args.get("max_delta", DEFAULT_MAX_DELTA))
    config = SO101FollowerConfig(
        port=port,
        id=args.get("id") or state.robot_id,
        cameras={},
        max_relative_target=state.max_delta,
    )
    robot = SO101Follower(config)
    robot.connect(calibrate=bool(args.get("calibrate", False)))
    state.robot = robot
    state.port = port
    return _tool_json({"connected": True, "robot_id": state.robot_id, "port": port, "features": sorted(robot.action_features)})


def observe(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")
    return _tool_json(observe_retry(state))


def get_arm_pose(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    observation = observe_retry(state)
    pose = arm_pose_from_observation(observation)
    return _tool_json(
        {
            "robot_id": state.robot_id,
            "pose": pose,
            "tuple": arm_pose_tuple(pose),
            "tuple_order": JOINTS,
            "units": pose_table_payload()["units"],
            "raw_observation": observation,
        }
    )


def get_pose_table(_: dict[str, Any]) -> dict[str, Any]:
    return _tool_json(pose_table_payload())


def get_position(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    observation = observe_retry(state)
    pose = arm_pose_from_observation(observation)
    transform = forward_kinematics_for_pose(pose, args.get("urdf_path"), args.get("target_frame"), state)
    position = [float(v) for v in transform[:3, 3]]
    gripper = float(pose["gripper"])
    return _tool_json(
        {
            "position": {"x": position[0], "y": position[1], "z": position[2], "gripper": gripper},
            "tuple": [position[0], position[1], position[2], gripper],
            "tuple_order": ["x", "y", "z", "gripper"],
            "units": {"x": "meters", "y": "meters", "z": "meters", "gripper": "percent_0_to_100"},
            "robot_id": state.robot_id,
            "frame": state.target_frame,
            "urdf_path": state.urdf_path,
            "orientation_rotvec": rotation_vector_from_matrix(transform),
            "arm_pose": pose,
            "arm_tuple": arm_pose_tuple(pose),
        }
    )


def set_arm_pose(args: dict[str, Any]) -> dict[str, Any]:
    try:
        return _tool_json(perform_set_arm_pose(args))
    except Exception as exc:
        return _tool_error(str(exc))


def set_position(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    try:
        target_position = validate_position(
            float(args["x"]),
            float(args["y"]),
            float(args["z"]),
            bool(args.get("allow_out_of_workspace", False)),
        )

        observation = observe_retry(state)
        start_pose = arm_pose_from_observation(observation)
        ik = solve_position_ik(
            start_pose,
            target_position,
            state,
            urdf_path=args.get("urdf_path"),
            target_frame=args.get("target_frame"),
            tolerance_m=max(0.0, min(0.05, float(args.get("tolerance_m", 0.004)))),
        )

        max_position_error_m = max(0.001, min(0.10, float(args.get("max_position_error_m", 0.03))))
        if ik["position_error_m"] > max_position_error_m:
            return _tool_error(
                "IK did not converge inside max_position_error_m: "
                f"error={ik['position_error_m']:.4f}m, max={max_position_error_m:.4f}m, "
                f"best_pose={ik['pose']}"
            )

        target_pose = dict(ik["pose"])
        if "gripper" in args:
            target_pose["gripper"] = float(args["gripper"])

        validate_pose(target_pose, bool(args.get("allow_out_of_range", False)))
        result = perform_set_arm_pose({**args, "pose": target_pose})
        final_pose = result["final_pose"]
        final_transform = forward_kinematics_for_pose(final_pose, state.urdf_path, state.target_frame, state)
        final_position = [float(v) for v in final_transform[:3, 3]]
        import numpy as np

        result.update(
            {
                "requested_position": {
                    "x": target_position["x"],
                    "y": target_position["y"],
                    "z": target_position["z"],
                    "gripper": target_pose["gripper"],
                },
                "requested_tuple": [
                    target_position["x"],
                    target_position["y"],
                    target_position["z"],
                    target_pose["gripper"],
                ],
                "requested_tuple_order": ["x", "y", "z", "gripper"],
                "ik_target_pose": target_pose,
                "ik_target_tuple": arm_pose_tuple(target_pose),
                "ik": ik,
                "final_position": {
                    "x": final_position[0],
                    "y": final_position[1],
                    "z": final_position[2],
                    "gripper": final_pose["gripper"],
                },
                "final_position_tuple": [final_position[0], final_position[1], final_position[2], final_pose["gripper"]],
                "position_error_m": float(
                    np.linalg.norm(
                        final_transform[:3, 3]
                        - np.array([target_position["x"], target_position["y"], target_position["z"]], dtype=float)
                    )
                ),
                "robot_id": state.robot_id,
                "frame": state.target_frame,
                "urdf_path": state.urdf_path,
            }
        )
        return _tool_json(result)
    except Exception as exc:
        return _tool_error(str(exc))


def set_gripper(args: dict[str, Any], value: float) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    try:
        observation = observe_retry(state)
        pose = arm_pose_from_observation(observation)
        pose["gripper"] = max(JOINT_LIMITS["gripper"][0], min(JOINT_LIMITS["gripper"][1], float(args.get("value", value))))
        return _tool_json(perform_set_arm_pose({**args, "pose": pose}))
    except Exception as exc:
        return _tool_error(str(exc))


def open_gripper(args: dict[str, Any]) -> dict[str, Any]:
    return set_gripper(args, DEFAULT_OPEN_GRIPPER)


def close_gripper(args: dict[str, Any]) -> dict[str, Any]:
    return set_gripper(args, DEFAULT_CLOSE_GRIPPER)


def ask_export(args: dict[str, Any]) -> dict[str, Any]:
    question = str(args.get("question", "")).strip()
    if not question:
        return _tool_error("question is required.")
    return _tool_json({"question": question, "answer": "expert not available"})


def move_relative(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    if not state.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    deltas = args["deltas"]
    if not isinstance(deltas, dict) or not deltas:
        return _tool_error("deltas must be a non-empty object.")

    start = observe_retry(state)
    action: dict[str, float] = {}
    for joint, raw_delta in deltas.items():
        key = joint if joint.endswith(".pos") else f"{joint}.pos"
        if key not in start:
            return _tool_error(f"Unknown joint '{joint}'. Available keys: {sorted(start)}")
        delta = float(raw_delta)
        if abs(delta) > state.max_delta:
            return _tool_error(f"Delta for {joint} exceeds max_delta={state.max_delta}: {delta}")
        action[key] = float(start[key]) + delta

    hold_seconds = max(0.0, min(5.0, float(args.get("hold_seconds", 0.25))))
    sent = state.robot.send_action(action)
    time.sleep(hold_seconds)
    after = observe_retry(state)

    result: dict[str, Any] = {"robot_id": state.robot_id, "start": start, "sent": sent, "after": after}
    if bool(args.get("return_to_start", False)):
        restore = {k: start[k] for k in action}
        result["restore_sent"] = state.robot.send_action(restore)
        time.sleep(hold_seconds)
        result["restored"] = observe_retry(state)
    return _tool_json(result)


def disconnect(args: dict[str, Any]) -> dict[str, Any]:
    state = robot_state(args)
    was_connected = state.connected
    if state.robot is not None and state.robot.is_connected:
        state.robot.disconnect()
    state.robot = None
    state.port = None
    state.kinematics = None
    return _tool_json({"robot_id": state.robot_id, "disconnected": was_connected})


# ---------------------------------------------------------------------------
# LeRobot recording session
# ---------------------------------------------------------------------------

from uuid import uuid4 as _uuid4

_lerobot_sessions: dict[str, dict[str, Any]] = {}


def _build_lerobot_cameras(cameras_raw: Any) -> dict[str, Any]:
    """Parse camera config from tool args into LeRobot CameraConfig objects."""
    from lerobot.cameras.opencv import OpenCVCameraConfig

    if not cameras_raw:
        return {}
    if isinstance(cameras_raw, str):
        cameras_raw = json.loads(cameras_raw)
    cam_configs = {}
    for name, cfg in cameras_raw.items():
        cfg = dict(cfg)
        ctype = cfg.pop("type", "opencv")
        if ctype == "opencv":
            cam_configs[name] = OpenCVCameraConfig(**cfg)
        else:
            cam_configs[name] = cfg
    return cam_configs


def _connect_leader_bus(port: str, baud: int = 1000000) -> Any:
    """Connect a raw FeetechMotorsBus with torque disabled for leader arm."""
    from lerobot.motors.feetech import FeetechMotorsBus

    bus = FeetechMotorsBus(port=port)
    bus.connect(handshake=True)
    bus.set_baudrate(baud)
    bus.disable_torque(num_retry=3)
    return bus


def _connect_follower_with_cameras(
    port: str, robot_id: str, camera_configs: dict[str, Any], fps: int = 30
) -> RobotState:
    """Connect follower SO101Follower with camera support."""
    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

    config = SO101FollowerConfig(
        port=port,
        id=robot_id,
        cameras=camera_configs if camera_configs else {},
        max_relative_target=DEFAULT_MAX_DELTA,
    )
    robot = SO101Follower(config)
    robot.connect(calibrate=False)
    state = RobotState(robot_id=robot_id, robot=robot, port=port)
    ROBOTS[robot_id] = state
    return state


def _create_lerobot_dataset(
    repo_id: str,
    fps: int,
    robot: Any,
    root: str | None = None,
) -> Any:
    """Create a LeRobotDataset from robot features."""
    from lerobot.datasets import LeRobotDataset
    from lerobot.datasets.utils import create_initial_features

    obs_features = getattr(robot, "observation_features", None)
    act_features = getattr(robot, "action_features", None)

    if obs_features is not None and act_features is not None:
        features = create_initial_features(
            action=act_features,
            observation=obs_features,
        )
    else:
        features = {}
        for joint in JOINTS:
            features[f"observation.{joint}.pos"] = {"dtype": "float32", "shape": (1,), "names": None}
        features["action"] = {"dtype": "float32", "shape": (len(JOINTS),), "names": JOINTS}
        if hasattr(robot, "cameras") and robot.cameras:
            for cam_name in robot.cameras:
                features[f"observation.images.{cam_name}"] = {"dtype": "image", "shape": (3, 480, 640)}

    num_cameras = len(robot.cameras) if hasattr(robot, "cameras") else 0
    dataset = LeRobotDataset.create(
        repo_id,
        fps,
        root=root,
        robot_type=getattr(robot, "name", "so101_follower") or "so101_follower",
        features=features,
        use_videos=num_cameras > 0,
        image_writer_processes=2 if num_cameras > 0 else 0,
        image_writer_threads=num_cameras if num_cameras > 0 else 0,
    )
    return dataset


def _mirror_loop(stop: threading.Event, leader_bus: Any, follower_state: RobotState) -> None:
    """Background thread: read leader bus → send_action to follower at ~50 Hz."""
    while not stop.is_set():
        try:
            if follower_state.connected and leader_bus.is_connected:
                positions = leader_bus.sync_read("Present_Position", normalize=False, num_retry=1)
                if positions:
                    action = {}
                    for i, joint in enumerate(JOINTS):
                        key = f"id{i + 1}"
                        raw = positions.get(key, 2047)
                        action[f"{joint}.pos"] = float(raw)
                    if action:
                        follower_state.robot.send_action(action)
        except Exception:
            pass
        stop.wait(0.02)


def _read_leader_pose(leader_bus: Any) -> dict[str, float]:
    """Read raw leader positions as normalized joint dict."""
    if leader_bus is None or not leader_bus.is_connected:
        return {}
    try:
        positions = leader_bus.sync_read("Present_Position", normalize=False, num_retry=2)
        if positions:
            return {joint: float(positions.get(f"id{i + 1}", 2047)) for i, joint in enumerate(JOINTS)}
    except Exception:
        pass
    return {}


def start_lerobot_session(args: dict[str, Any]) -> dict[str, Any]:
    leader_port = str(args["leader_port"])
    follower_port = str(args["follower_port"])
    repo_id = str(args["repo_id"])
    task = str(args.get("task", "unknown"))
    fps = int(args.get("fps", 30))
    push_to_hub = bool(args.get("push_to_hub", False))
    root = args.get("root")

    cameras_raw = args.get("cameras")
    camera_configs = _build_lerobot_cameras(cameras_raw) if cameras_raw else {}

    session_id = f"lr_{_uuid4().hex[:8]}"
    session = {
        "session_id": session_id,
        "leader_port": leader_port,
        "follower_port": follower_port,
        "repo_id": repo_id,
        "task": task,
        "fps": fps,
        "push_to_hub": push_to_hub,
        "mirror_stop": threading.Event(),
        "mirror_thread": None,
        "leader_bus": None,
        "dataset": None,
    }

    try:
        leader_bus = _connect_leader_bus(leader_port)
        session["leader_bus"] = leader_bus

        follower_id = f"follower_{Path(follower_port).stem}"
        follower_state = _connect_follower_with_cameras(follower_port, follower_id, camera_configs, fps)
        session["follower_robot_id"] = follower_id

        dataset = _create_lerobot_dataset(repo_id, fps, follower_state.robot, root)
        session["dataset"] = dataset

        stop_flag = threading.Event()
        thread = threading.Thread(
            target=_mirror_loop,
            args=(stop_flag, leader_bus, follower_state),
            daemon=True,
        )
        thread.stop_flag = stop_flag
        thread.start()
        session["mirror_thread"] = thread
        session["mirror_stop"] = stop_flag

        cam_info = {}
        if hasattr(follower_state.robot, "cameras"):
            for name, cam in (follower_state.robot.cameras or {}).items():
                cam_info[name] = str(type(cam).__name__)

        _lerobot_sessions[session_id] = session

        return _tool_json({
            "session_id": session_id,
            "leader_port": leader_port,
            "follower_port": follower_port,
            "repo_id": repo_id,
            "task": task,
            "fps": fps,
            "cameras": cam_info,
            "dataset_root": str(dataset.root) if dataset.root else None,
        })

    except Exception as exc:
        if session["leader_bus"] and session["leader_bus"].is_connected:
            try:
                session["leader_bus"].disconnect(disable_torque=False)
            except Exception:
                pass
        follower_id = session.get("follower_robot_id")
        if follower_id and follower_id in ROBOTS:
            try:
                ROBOTS[follower_id].robot.disconnect()
            except Exception:
                pass
        return _tool_error(f"Failed to start session: {exc}")


def start_lerobot_episode(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _lerobot_sessions.get(session_id)
    if not session:
        return _tool_error(f"Session not found: {session_id}")

    dataset = session["dataset"]
    try:
        dataset.clear_episode_buffer()
        return _tool_json({"session_id": session_id, "episode_cleared": True})
    except Exception as exc:
        return _tool_error(f"Failed to start episode: {exc}")


def capture_lerobot_frame(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _lerobot_sessions.get(session_id)
    if not session:
        return _tool_error(f"Session not found: {session_id}")

    dataset = session["dataset"]
    leader_bus = session["leader_bus"]
    follower_id = session.get("follower_robot_id")
    task = session.get("task", "unknown")

    follower_state = ROBOTS.get(follower_id)
    if not follower_state or not follower_state.connected:
        return _tool_error("Follower not connected.")

    try:
        obs = follower_state.robot.get_observation()
    except Exception as exc:
        return _tool_error(f"Failed to read follower observation: {exc}")

    leader_pose = _read_leader_pose(leader_bus)

    from lerobot.datasets import LeRobotDataset

    if not hasattr(dataset, "features"):
        return _tool_error("Dataset not initialized.")

    frame = {"task": task}
    features = dataset.features

    for feat_name in features:
        if feat_name.startswith("observation.images."):
            cam_key = feat_name.split(".", 2)[2]
            if cam_key in obs:
                frame[feat_name] = obs[cam_key]
        elif feat_name == "observation.state":
            state = []
            for joint in JOINTS:
                val = obs.get(f"{joint}.pos", 0.0)
                if hasattr(val, "item"):
                    val = val.item()
                state.append(float(val))
            frame[feat_name] = state
        elif feat_name.startswith("observation."):
            rest = feat_name[len("observation."):]
            if rest in obs:
                frame[feat_name] = obs[rest]

    if "action" in features:
        leader_action = []
        for joint in JOINTS:
            val = leader_pose.get(joint, 0.0)
            if hasattr(val, "item"):
                val = val.item()
            leader_action.append(float(val))
        frame["action"] = leader_action

    try:
        dataset.add_frame(frame)
    except Exception as exc:
        return _tool_error(f"Failed to add frame: {exc}")

    return _tool_json({
        "session_id": session_id,
        "frame_added": True,
        "observation_keys": list(obs.keys()),
        "leader_pose": leader_pose,
    })


def save_lerobot_episode(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _lerobot_sessions.get(session_id)
    if not session:
        return _tool_error(f"Session not found: {session_id}")

    dataset = session["dataset"]
    try:
        dataset.save_episode()
        num_episodes = dataset.num_episodes
        return _tool_json({"session_id": session_id, "episode_saved": True, "num_episodes": num_episodes})
    except Exception as exc:
        return _tool_error(f"Failed to save episode: {exc}")


def stop_lerobot_session(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _lerobot_sessions.get(session_id)
    if not session:
        return _tool_error(f"Session not found: {session_id}")

    result = {"session_id": session_id}

    try:
        session["mirror_stop"].set()
        if session.get("mirror_thread"):
            session["mirror_thread"].join(timeout=2)
    except Exception as exc:
        result["mirror_stop_error"] = str(exc)

    try:
        dataset = session.get("dataset")
        if dataset:
            dataset.finalize()
            result["dataset_finalized"] = True
            if session.get("push_to_hub"):
                try:
                    dataset.push_to_hub(private=False)
                    result["pushed_to_hub"] = True
                except Exception as exc:
                    result["push_error"] = str(exc)
    except Exception as exc:
        result["finalize_error"] = str(exc)

    follower_id = session.get("follower_robot_id")
    if follower_id and follower_id in ROBOTS:
        try:
            ROBOTS[follower_id].robot.disconnect()
        except Exception:
            pass
        result["follower_disconnected"] = True

    try:
        if session.get("leader_bus") and session["leader_bus"].is_connected:
            session["leader_bus"].disconnect(disable_torque=False)
            result["leader_disconnected"] = True
    except Exception:
        pass

    _lerobot_sessions.pop(session_id, None)
    return _tool_json(result)


# ---------------------------------------------------------------------------
# Teleoperation-only mode (no recording)
# ---------------------------------------------------------------------------

_teleop_sessions: dict[str, dict[str, Any]] = {}


def start_lerobot_teleop(args: dict[str, Any]) -> dict[str, Any]:
    leader_port = str(args["leader_port"])
    follower_port = str(args["follower_port"])
    fps = int(args.get("fps", 50))

    session_id = f"tel_{_uuid4().hex[:8]}"

    try:
        leader_bus = _connect_leader_bus(leader_port)
        from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

        config = SO101FollowerConfig(port=follower_port, id=f"follower_{Path(follower_port).stem}", cameras={}, max_relative_target=DEFAULT_MAX_DELTA)
        follower = SO101Follower(config)
        follower.connect(calibrate=False)
        follower_state = RobotState(robot_id=f"follower_{Path(follower_port).stem}", robot=follower, port=follower_port)
        ROBOTS[follower_state.robot_id] = follower_state

        stop_flag = threading.Event()
        thread = threading.Thread(target=_mirror_loop, args=(stop_flag, leader_bus, follower_state), daemon=True)
        thread.start()

        session = {"leader_bus": leader_bus, "follower_robot_id": follower_state.robot_id, "stop_flag": stop_flag, "thread": thread}
        _teleop_sessions[session_id] = session

        return _tool_json({"session_id": session_id, "leader_port": leader_port, "follower_port": follower_port, "fps": fps})
    except Exception as exc:
        if leader_bus and leader_bus.is_connected:
            try:
                leader_bus.disconnect(disable_torque=False)
            except Exception:
                pass
        return _tool_error(f"Failed to start teleop: {exc}")


def stop_lerobot_teleop(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _teleop_sessions.pop(session_id, None)
    if not session:
        return _tool_error(f"Teleop session not found: {session_id}")

    result = {"session_id": session_id}
    try:
        session["stop_flag"].set()
        if session.get("thread"):
            session["thread"].join(timeout=2)
    except Exception as exc:
        result["stop_error"] = str(exc)

    follower_id = session.get("follower_robot_id")
    if follower_id and follower_id in ROBOTS:
        try:
            ROBOTS[follower_id].robot.disconnect()
            del ROBOTS[follower_id]
        except Exception:
            pass
        result["follower_disconnected"] = True

    try:
        if session.get("leader_bus") and session["leader_bus"].is_connected:
            session["leader_bus"].disconnect(disable_torque=False)
            result["leader_disconnected"] = True
    except Exception:
        pass

    return _tool_json(result)


# ---------------------------------------------------------------------------
# Replay a dataset episode on the robot
# ---------------------------------------------------------------------------


def replay_episode(args: dict[str, Any]) -> dict[str, Any]:
    repo_id = str(args["repo_id"])
    episode = int(args.get("episode", 0))
    port = str(args.get("port", DEFAULT_PORT))
    robot_id = str(args.get("robot_id", DEFAULT_ROBOT_ID))
    fps = int(args.get("fps", 30))
    play_sounds = bool(args.get("play_sounds", False))

    from lerobot.datasets import LeRobotDataset
    from lerobot.processor import make_default_robot_action_processor
    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig
    from lerobot.utils.constants import ACTION

    try:
        robot_config = SO101FollowerConfig(port=port, id=robot_id, cameras={}, max_relative_target=DEFAULT_MAX_DELTA)
        robot = SO101Follower(robot_config)
        robot.connect(calibrate=False)

        dataset = LeRobotDataset(repo_id, episodes=[episode])
        actions = dataset.select_columns(ACTION)
        robot_action_processor = make_default_robot_action_processor()

        replayed = 0
        errors = []
        for idx in range(dataset.num_frames):
            try:
                action_array = actions[idx][ACTION]
                action = {}
                for i, name in enumerate(dataset.features[ACTION]["names"]):
                    action[name] = float(action_array[i])
                robot_obs = robot.get_observation()
                processed = robot_action_processor((action, robot_obs))
                robot.send_action(processed)
                replayed += 1
                if idx < dataset.num_frames - 1:
                    time.sleep(max(0.0, 1.0 / fps - 0.01))
            except Exception as exc:
                errors.append({"frame": idx, "error": str(exc)})

        robot.disconnect()
        return _tool_json({"repo_id": repo_id, "episode": episode, "frames_replayed": replayed, "total_frames": dataset.num_frames, "errors": errors})
    except Exception as exc:
        return _tool_error(f"Replay failed: {exc}")


# ---------------------------------------------------------------------------
# Train a policy (background process)
# ---------------------------------------------------------------------------

_training_sessions: dict[str, dict[str, Any]] = {}


def train_policy(args: dict[str, Any]) -> dict[str, Any]:
    dataset_repo_id = str(args["dataset_repo_id"])
    policy_type = str(args.get("policy_type", "act"))
    output_dir = str(args.get("output_dir", "outputs/train"))
    steps = int(args.get("steps", 50000))
    batch_size = int(args.get("batch_size", 8))
    device = str(args.get("device", "cuda"))
    wandb_enable = bool(args.get("wandb_enable", False))

    session_id = f"tr_{_uuid4().hex[:8]}"
    log_buffer: list[str] = []
    out_dir = Path(output_dir) / f"{policy_type}_{dataset_repo_id.replace('/', '_')}"
    out_dir.mkdir(parents=True, exist_ok=True)

    python = sys.executable or "python3"

    cmd = [
        python, "-m", "lerobot.scripts.lerobot_train",
        f"--dataset.repo_id={dataset_repo_id}",
        f"--policy.type={policy_type}",
        f"--output_dir={out_dir}",
        f"--steps={steps}",
        f"--batch_size={batch_size}",
        f"--policy.device={device}",
    ]
    if not wandb_enable:
        cmd.append("--wandb.enable=false")

    process = None

    def _worker():
        nonlocal process
        import subprocess as sp
        try:
            process = sp.Popen(cmd, stdout=sp.PIPE, stderr=sp.STDOUT, text=True)
            for line in process.stdout:
                log_buffer.append(line.rstrip())
            process.wait()
        except Exception as exc:
            log_buffer.append(f"TRAIN ERROR: {exc}")
        finally:
            log_buffer.append("TRAINING_DONE")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    session = {"thread": thread, "process_ref": lambda: process, "log_buffer": log_buffer, "output_dir": str(out_dir)}
    _training_sessions[session_id] = session

    return _tool_json({
        "session_id": session_id,
        "dataset_repo_id": dataset_repo_id,
        "policy_type": policy_type,
        "output_dir": str(out_dir),
        "steps": steps,
    })


def get_training_status(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _training_sessions.get(session_id)
    if not session:
        return _tool_error(f"Training session not found: {session_id}")

    logs = list(session["log_buffer"])
    done = any("TRAINING_DONE" in line for line in logs)
    alive = session["thread"].is_alive()
    return _tool_json({
        "session_id": session_id,
        "done": done,
        "alive": alive,
        "log_lines": logs[-50:],
        "output_dir": session["output_dir"],
    })


def stop_training(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _training_sessions.pop(session_id, None)
    if not session:
        return _tool_error(f"Training session not found: {session_id}")

    try:
        proc = session.get("process_ref")
        if callable(proc):
            p = proc()
            if p is not None and p.poll() is None:
                p.terminate()
                p.wait(timeout=5)
        session["thread"].join(timeout=5)
    except Exception:
        pass
    logs = list(session["log_buffer"])
    return _tool_json({"session_id": session_id, "stopped": True, "log_lines": logs[-50:]})


def list_checkpoints(args: dict[str, Any]) -> dict[str, Any]:
    output_dir = str(args.get("output_dir", "outputs/train"))
    checkpoints = []
    for path in sorted(Path(output_dir).glob("**/checkpoints/*/pretrained_model")):
        step_dir = path.parent
        try:
            step = int(step_dir.name)
        except ValueError:
            step = 0
        checkpoints.append({"path": str(path), "step": step, "parent": str(step_dir.parent.name)})
    return _tool_json({"output_dir": output_dir, "checkpoints": checkpoints})


# ---------------------------------------------------------------------------
# Run a trained policy on the robot (rollout)
# ---------------------------------------------------------------------------

_policy_sessions: dict[str, dict[str, Any]] = {}


def run_policy(args: dict[str, Any]) -> dict[str, Any]:
    policy_path = str(args["policy_path"])
    port = str(args.get("port", DEFAULT_PORT))
    robot_id = str(args.get("robot_id", DEFAULT_ROBOT_ID))
    fps = int(args.get("fps", 30))
    single_task = str(args.get("single_task", "perform task"))

    session_id = f"pol_{_uuid4().hex[:8]}"
    stop_flag = threading.Event()

    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig
    from lerobot.policies import make_policy
    from lerobot.processor import make_pre_post_processors

    def _policy_worker():
        try:
            robot_config = SO101FollowerConfig(port=port, id=robot_id, cameras={}, max_relative_target=DEFAULT_MAX_DELTA)
            robot = SO101Follower(robot_config)
            robot.connect(calibrate=False)

            policy = make_policy(pretrained_path=policy_path)
            policy.eval()
            preprocessor, postprocessor = make_pre_post_processors(policy_cfg=policy.config, pretrained_path=policy_path)

            import torch

            while not stop_flag.is_set():
                obs = robot.get_observation()
                processed = preprocessor(obs)
                with torch.inference_mode():
                    action = policy.select_action(processed)
                action = postprocessor(action)
                robot_action = {}
                for i, name in enumerate(robot.action_features):
                    robot_action[name] = float(action[i])
                robot.send_action(robot_action)
                stop_flag.wait(1.0 / fps)

            robot.disconnect()
        except Exception as exc:
            log_buffer.append(f"POLICY ERROR: {exc}")

    log_buffer: list[str] = []
    thread = threading.Thread(target=_policy_worker, daemon=True)
    thread.start()

    session = {"thread": thread, "stop_flag": stop_flag, "log_buffer": log_buffer, "policy_path": policy_path}
    _policy_sessions[session_id] = session

    return _tool_json({
        "session_id": session_id,
        "policy_path": policy_path,
        "robot_id": robot_id,
        "port": port,
        "fps": fps,
        "task": single_task,
    })


def stop_policy(args: dict[str, Any]) -> dict[str, Any]:
    session_id = args.get("session_id", "")
    session = _policy_sessions.pop(session_id, None)
    if not session:
        return _tool_error(f"Policy session not found: {session_id}")

    try:
        session["stop_flag"].set()
        session["thread"].join(timeout=5)
    except Exception:
        pass

    return _tool_json({"session_id": session_id, "stopped": True})


HANDLERS = {
    "list_serial_ports": list_serial_ports,
    "list_cameras": list_cameras,
    "view_camera": view_camera,
    "probe_feetech": probe_feetech,
    "list_connected_robots": list_connected_robots,
    "prepare_so101_calibration": prepare_so101_calibration,
    "read_so101_calibration_endpoint": read_so101_calibration_endpoint,
    "read_so101_raw_positions": read_so101_raw_positions,
    "finalize_so101_calibration": finalize_so101_calibration,
    "connect_so101": connect_so101,
    "observe": observe,
    "get_arm_pose": get_arm_pose,
    "get_pose_table": get_pose_table,
    "get_position": get_position,
    "set_arm_pose": set_arm_pose,
    "set_position": set_position,
    "open_gripper": open_gripper,
    "close_gripper": close_gripper,
    "ask_export": ask_export,
    "move_relative": move_relative,
    "disconnect": disconnect,
    "start_lerobot_session": start_lerobot_session,
    "start_lerobot_episode": start_lerobot_episode,
    "capture_lerobot_frame": capture_lerobot_frame,
    "save_lerobot_episode": save_lerobot_episode,
    "stop_lerobot_session": stop_lerobot_session,
    "start_lerobot_teleop": start_lerobot_teleop,
    "stop_lerobot_teleop": stop_lerobot_teleop,
    "replay_episode": replay_episode,
    "train_policy": train_policy,
    "get_training_status": get_training_status,
    "stop_training": stop_training,
    "list_checkpoints": list_checkpoints,
    "run_policy": run_policy,
    "stop_policy": stop_policy,
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
