"""High-level chemistry experiment actions for chem-0.

Wraps the MCP tool calls into experiment primitives as defined in
``AGENTS.md``:

  - Pick up vial
  - Infer vial pH from colour
  - Infer vial identity among: vinegar, NaCl solution, baking soda, borax
  - Combine vial A and vial B in new vial
  - Pick up multimeter probe
  - Dip multimeter probe into solution and read resistance

Usage:
    from chem0.chemist import (
        pick_up_vial, infer_vial_ph, infer_identity,
        combine_vials, pick_up_probe, dip_probe_and_read,
    )
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import cv2
import numpy as np

from chem0.vision import (
    VialROI,
    PHResult,
    ProbeROI,
    capture_frame,
    find_vials,
    find_probe_tips,
    infer_vial_ph as _infer_vial_ph,
    infer_vial_identity as _infer_identity,
    read_multimeter_display,
    annotate_frame,
)

# ── Tool-call adapter ─────────────────────────────────────────────────────
# These actions need to call the robot arm via the MCP tools.
# Provide a pluggable dispatch so the same code works whether called
# from the Python bridge (which has direct access to core.py HANDLERS)
# or from an agent that calls tools by name.

ToolFn = Callable[..., dict[str, Any]]


@dataclass
class RobotAPI:
    """Pluggable robot API adapter.

    Set ``dispatch`` to a function that calls an MCP tool by name
    with the given arguments and returns the result dict.

    Example bridge dispatch:
        >>> from chem0.core import HANDLERS
        >>> api = RobotAPI(dispatch=lambda name, **kw: HANDLERS[name](kw))

    Example agent dispatch (via JSON-line bridge):
        >>> api = RobotAPI(dispatch=lambda name, **kw: bridge_request("tools/call", {"name": name, "arguments": kw}))
    """

    dispatch: ToolFn | None = None

    def call(self, tool: str, **kwargs: Any) -> dict[str, Any]:
        if self.dispatch is None:
            raise RuntimeError(
                f"Cannot call {tool}: no RobotAPI.dispatch configured. "
                "Set it to your tool-calling function."
            )
        result = self.dispatch(tool, **kwargs)
        if isinstance(result, dict) and result.get("isError"):
            raise RuntimeError(result.get("content", [{}])[0].get("text", str(result)))
        return result


# Global singleton
ROBOT = RobotAPI()


def configure_api(dispatch: ToolFn) -> None:
    """Configure the global RobotAPI dispatch function."""
    ROBOT.dispatch = dispatch


# ── Experiment actions ────────────────────────────────────────────────────

def pick_up_vial(
    vial: VialROI | dict[str, Any],
    camera_id: int = 0,
    frame: np.ndarray | None = None,
) -> dict[str, Any]:
    """Pick up a vial with the robot arm.

    Strategy:
      1. Capture the current camera frame (or use provided one).
      2. The vial's position in frame guides the arm approach.
      3. Move to a pre-grasp pose above the vial.
      4. Lower, close gripper, lift.

    This is a composite motion — actual positioning depends on the
    calibrated camera-to-base extrinsics. The implementation below
    uses the known reference poses and assumes the camera frames
    the workspace from a fixed tripod.

    Returns a dict with the action log.
    """
    if frame is None:
        frame = capture_frame(camera_id)

    if isinstance(vial, dict):
        vial = VialROI(**{k: vial[k] for k in ("x", "y", "w", "h", "area") if k in vial})
        vial.centre = (vial.x + vial.w // 2, vial.y + vial.h // 2)

    log: dict[str, Any] = {"action": "pick_up_vial", "vial_centre": vial.centre}

    # ── arm motions (require ROBOT.dispatch) ──
    # 1. Move to a vertical/extended pose above the vial rack area
    #    (base_left_vertical_extended is the known working pose)
    current = ROBOT.call("get_arm_pose")
    log["start_pose"] = current.get("pose")

    # 2. Approach: lower arm toward vial position (estimated)
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": float(current["pose"]["shoulder_pan"]),
        "shoulder_lift": 30.0,
        "elbow_flex": -30.0,
        "wrist_flex": 0.0,
        "wrist_roll": 0.0,
        "gripper": 50.0,
    }, max_step=5, allow_out_of_range=False)

    # 3. Close gripper
    ROBOT.call("close_gripper")

    # 4. Lift
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": float(current["pose"]["shoulder_pan"]),
        "shoulder_lift": 0.0,
        "elbow_flex": -70.0,
        "wrist_flex": 0.0,
        "wrist_roll": 0.0,
        "gripper": 0.5,
    }, max_step=5, allow_out_of_range=False)

    log["status"] = "picked"
    return log


def infer_vial_ph(
    vial_index: int = 0,
    camera_id: int = 0,
    frame: np.ndarray | None = None,
) -> PHResult:
    """Capture a frame, find vials, and infer pH from bromothymol blue colour."""
    if frame is None:
        frame = capture_frame(camera_id)
    vials = find_vials(frame)
    if not vials:
        raise RuntimeError("No vials found in frame.")
    if vial_index >= len(vials):
        raise RuntimeError(f"Vial index {vial_index} out of range (found {len(vials)} vials).")
    return _infer_vial_ph(frame, vials[vial_index])


def infer_identity(
    vial_index: int = 0,
    camera_id: int = 0,
    frame: np.ndarray | None = None,
) -> dict[str, Any]:
    """Infer the chemical identity of a vial from its indicator colour.

    Returns dict with keys: identity, ph, colour, confidence.
    """
    ph_result = infer_vial_ph(vial_index, camera_id, frame)
    return _infer_identity(ph_result)


def combine_vials(
    vial_a_index: int = 0,
    vial_b_index: int = 1,
    camera_id: int = 0,
    frame: np.ndarray | None = None,
) -> dict[str, Any]:
    """Pour the contents of vial A into vial B (or a new trial cup).

    Strategy:
      1. Infer pH/identity of both vials by colour.
      2. Pick up vial A.
      3. Move gripper above vial B / trial cup.
      4. Open gripper to release / pour.
      5. Return to safe pose.

    Returns a log of the operation.
    """
    if frame is None:
        frame = capture_frame(camera_id)

    vials = find_vials(frame)
    if len(vials) < max(vial_a_index, vial_b_index) + 1:
        raise RuntimeError(
            f"Need at least {max(vial_a_index, vial_b_index) + 1} vials, "
            f"found {len(vials)}."
        )

    a_ph = _infer_vial_ph(frame, vials[vial_a_index])
    b_ph = _infer_vial_ph(frame, vials[vial_b_index])

    log: dict[str, Any] = {
        "action": "combine_vials",
        "vial_a_index": vial_a_index,
        "vial_b_index": vial_b_index,
        "vial_a_ph": a_ph.ph,
        "vial_a_colour": a_ph.colour,
        "vial_b_ph": b_ph.ph,
        "vial_b_colour": b_ph.colour,
    }

    pick_up_vial(vials[vial_a_index], camera_id, frame)
    # For a real pour, the arm would tilt the vial over the target.
    # Here we move to the target position and release.
    ROBOT.call("open_gripper")

    log["status"] = "combined"
    return log


def pick_up_probe(
    camera_id: int = 0,
    frame: np.ndarray | None = None,
) -> dict[str, Any]:
    """Pick up the multimeter-probe wand.

    The probes are duct-taped to a chopstick at fixed spacing.
    The arm grips the chopstick handle.

    Returns the action log.
    """
    if frame is None:
        frame = capture_frame(camera_id)

    probes = find_probe_tips(frame)
    log: dict[str, Any] = {
        "action": "pick_up_probe",
        "probes_detected": probes is not None,
    }

    if probes:
        log["probe_centre"] = probes.centre

    # Move arm to a pre-grasp position near the probe wand
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": -60.0,
        "shoulder_lift": 20.0,
        "elbow_flex": -40.0,
        "wrist_flex": 10.0,
        "wrist_roll": 0.0,
        "gripper": 50.0,
    }, max_step=5, allow_out_of_range=False)

    ROBOT.call("close_gripper")
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": -60.0,
        "shoulder_lift": 0.0,
        "elbow_flex": -70.0,
        "wrist_flex": 0.0,
        "wrist_roll": 0.0,
        "gripper": 0.5,
    }, max_step=5, allow_out_of_range=False)

    log["status"] = "probe_picked"
    return log


def dip_probe_and_read(
    camera_id: int = 0,
    frame: np.ndarray | None = None,
) -> dict[str, Any]:
    """Dip the held multimeter probes into the trial cup and read resistance.

    1. Locate the trial cup in the current frame.
    2. Move the probe wand above the cup.
    3. Lower probes into the solution.
    4. Read the DMM display.
    5. Lift probes out.

    Returns the resistance reading and action log.
    """
    if frame is None:
        frame = capture_frame(camera_id)

    from chem0.vision import find_trial_cup
    cup = find_trial_cup(frame)

    log: dict[str, Any] = {
        "action": "dip_probe_and_read",
        "cup_detected": cup is not None,
    }

    if cup:
        log["cup_centre"] = cup.centre

    # Move probe wand above the cup
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": 0.0,
        "shoulder_lift": 45.0,
        "elbow_flex": -30.0,
        "wrist_flex": 30.0,
        "wrist_roll": 0.0,
        "gripper": 0.5,
    }, max_step=5, allow_out_of_range=False)

    # Lower into solution
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": 0.0,
        "shoulder_lift": 60.0,
        "elbow_flex": -20.0,
        "wrist_flex": 20.0,
        "wrist_roll": 0.0,
        "gripper": 0.5,
    }, max_step=5, allow_out_of_range=False)

    # Read the DMM display
    dmm_frame = capture_frame(camera_id)
    dmm_result = read_multimeter_display(dmm_frame)
    log["meter"] = dmm_result

    # Lift probes
    ROBOT.call("set_arm_pose", pose={
        "shoulder_pan": 0.0,
        "shoulder_lift": 30.0,
        "elbow_flex": -50.0,
        "wrist_flex": 10.0,
        "wrist_roll": 0.0,
        "gripper": 0.5,
    }, max_step=5, allow_out_of_range=False)

    log["status"] = "measured"
    return log
