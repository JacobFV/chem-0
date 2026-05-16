#!/usr/bin/env python3
"""Core robot, camera, kinematics, and tool implementation for chem-0."""

from __future__ import annotations

import glob
import json
import base64
import sys
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


def get_kinematics(urdf_path: str | None = None, target_frame: str | None = None) -> Any:
    from lerobot.model.kinematics import RobotKinematics

    resolved_urdf = str(Path(urdf_path or STATE.urdf_path or DEFAULT_URDF_PATH).expanduser().resolve())
    resolved_target = target_frame or STATE.target_frame or DEFAULT_TARGET_FRAME

    if not Path(resolved_urdf).exists():
        raise FileNotFoundError(f"URDF not found: {resolved_urdf}")

    if (
        STATE.kinematics is None
        or STATE.urdf_path != resolved_urdf
        or STATE.target_frame != resolved_target
    ):
        STATE.kinematics = RobotKinematics(
            urdf_path=resolved_urdf,
            target_frame_name=resolved_target,
            joint_names=ARM_JOINTS,
        )
        STATE.urdf_path = resolved_urdf
        STATE.target_frame = resolved_target

    return STATE.kinematics


def forward_kinematics_for_pose(pose: dict[str, float], urdf_path: str | None = None, target_frame: str | None = None) -> Any:
    return get_kinematics(urdf_path, target_frame).forward_kinematics(arm_array(pose))


def forward_kinematics_for_arm_array(q: Any, urdf_path: str | None = None, target_frame: str | None = None) -> Any:
    return get_kinematics(urdf_path, target_frame).forward_kinematics(q)


def rotation_vector_from_matrix(matrix: Any) -> list[float]:
    from lerobot.utils.rotation import Rotation

    return [float(v) for v in Rotation.from_matrix(matrix[:3, :3]).as_rotvec()]


def solve_position_ik(
    start_pose: dict[str, float],
    target_xyz: dict[str, float],
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
    kinematics = get_kinematics(urdf_path, target_frame)
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
    if not STATE.connected:
        raise RuntimeError("Robot is not connected. Call connect_so101 first.")

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
        raise RuntimeError("set_arm_pose exceeded 200 interpolation steps before reaching target.")

    time.sleep(settle_seconds)
    final = observe_retry()
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
    robot: Any = None
    port: str | None = None
    max_delta: float = DEFAULT_MAX_DELTA
    kinematics: Any = None
    urdf_path: str = str(DEFAULT_URDF_PATH)
    target_frame: str = DEFAULT_TARGET_FRAME

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


def get_arm_pose(_: dict[str, Any]) -> dict[str, Any]:
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    observation = observe_retry()
    pose = arm_pose_from_observation(observation)
    return _tool_json(
        {
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
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    observation = observe_retry()
    pose = arm_pose_from_observation(observation)
    transform = forward_kinematics_for_pose(pose, args.get("urdf_path"), args.get("target_frame"))
    position = [float(v) for v in transform[:3, 3]]
    gripper = float(pose["gripper"])
    return _tool_json(
        {
            "position": {"x": position[0], "y": position[1], "z": position[2], "gripper": gripper},
            "tuple": [position[0], position[1], position[2], gripper],
            "tuple_order": ["x", "y", "z", "gripper"],
            "units": {"x": "meters", "y": "meters", "z": "meters", "gripper": "percent_0_to_100"},
            "frame": STATE.target_frame,
            "urdf_path": STATE.urdf_path,
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
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    try:
        target_position = validate_position(
            float(args["x"]),
            float(args["y"]),
            float(args["z"]),
            bool(args.get("allow_out_of_workspace", False)),
        )

        observation = observe_retry()
        start_pose = arm_pose_from_observation(observation)
        ik = solve_position_ik(
            start_pose,
            target_position,
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
        final_transform = forward_kinematics_for_pose(final_pose, STATE.urdf_path, STATE.target_frame)
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
                "frame": STATE.target_frame,
                "urdf_path": STATE.urdf_path,
            }
        )
        return _tool_json(result)
    except Exception as exc:
        return _tool_error(str(exc))


def set_gripper(args: dict[str, Any], value: float) -> dict[str, Any]:
    if not STATE.connected:
        return _tool_error("Robot is not connected. Call connect_so101 first.")

    try:
        observation = observe_retry()
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
    STATE.kinematics = None
    return _tool_json({"disconnected": was_connected})


HANDLERS = {
    "list_serial_ports": list_serial_ports,
    "list_cameras": list_cameras,
    "view_camera": view_camera,
    "probe_feetech": probe_feetech,
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
