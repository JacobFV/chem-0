#!/usr/bin/env python3
"""Deterministic per-joint SO-101 calibration prompt.

This records each joint endpoint with an explicit prompt, then writes a
LeRobot-compatible calibration file for a distinct robot id.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from dataclasses import asdict
from pathlib import Path
from statistics import median

import serial.tools.list_ports
from lerobot.motors import Motor, MotorCalibration, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus, OperatingMode


DEFAULT_BAUD = 1_000_000
DEFAULT_ROBOT_ID = "mcp_so101_b"
CALIBRATION_DIR = Path.home() / ".cache/huggingface/lerobot/calibration/robots/so_follower"

JOINTS = [
    {
        "axis": "Z1",
        "joint": "shoulder_pan",
        "id": 1,
        "norm_mode": MotorNormMode.DEGREES,
        "label": "base Z roll",
        "first": "all the way to the left",
        "second": "all the way to the right",
    },
    {
        "axis": "X1",
        "joint": "shoulder_lift",
        "id": 2,
        "norm_mode": MotorNormMode.DEGREES,
        "label": "base X pitch",
        "first": "all the way backward",
        "second": "all the way forward",
    },
    {
        "axis": "X2",
        "joint": "elbow_flex",
        "id": 3,
        "norm_mode": MotorNormMode.DEGREES,
        "label": "elbow X pitch",
        "first": "fully bent/backward",
        "second": "fully extended/forward",
    },
    {
        "axis": "X3",
        "joint": "wrist_flex",
        "id": 4,
        "norm_mode": MotorNormMode.DEGREES,
        "label": "wrist X pitch",
        "first": "all the way down/backward",
        "second": "all the way up/forward",
    },
    {
        "axis": "Z2",
        "joint": "wrist_roll",
        "id": 5,
        "norm_mode": MotorNormMode.DEGREES,
        "label": "wrist Z roll",
        "first": "all the way counterclockwise/left",
        "second": "all the way clockwise/right",
    },
    {
        "axis": "Hand",
        "joint": "gripper",
        "id": 6,
        "norm_mode": MotorNormMode.RANGE_0_100,
        "label": "gripper",
        "first": "fully closed",
        "second": "fully open",
    },
]


def find_default_port() -> str:
    ports = [p.device for p in serial.tools.list_ports.comports()]
    usbmodem = [p for p in ports if "usbmodem" in p and p.startswith("/dev/tty.")]
    if len(usbmodem) == 1:
        return usbmodem[0]
    usbserial = [p for p in ports if ("usbserial" in p or "wchusbserial" in p) and p.startswith("/dev/tty.")]
    if len(usbserial) == 1:
        return usbserial[0]
    raise SystemExit(
        "Could not choose a serial port automatically. Pass --port. "
        f"Visible ports: {ports}"
    )


def build_bus(port: str) -> FeetechMotorsBus:
    motors = {
        spec["joint"]: Motor(int(spec["id"]), "sts3215", spec["norm_mode"])
        for spec in JOINTS
    }
    return FeetechMotorsBus(port=port, motors=motors)


def read_stable_position(bus: FeetechMotorsBus, joint: str, samples: int = 5) -> int:
    values: list[int] = []
    for _ in range(samples):
        values.append(int(bus.read("Present_Position", joint, normalize=False, num_retry=3)))
        time.sleep(0.04)
    return int(median(values))


def prompt_position(bus: FeetechMotorsBus, spec: dict[str, object], direction: str) -> int:
    axis = str(spec["axis"])
    label = str(spec["label"])
    joint = str(spec["joint"])
    input(f"\nMove the {label} ({axis}) {direction}, then press ENTER.")
    position = read_stable_position(bus, joint)
    print(f"Recorded {axis} / {joint}: raw position {position}")
    return position


def backup_existing(path: Path) -> None:
    if not path.exists():
        return
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = path.with_suffix(path.suffix + f".bak-{stamp}")
    shutil.copy2(path, backup)
    print(f"Backed up existing calibration to {backup}")


def calibration_from_records(records: dict[str, dict[str, int]]) -> dict[str, MotorCalibration]:
    calibration: dict[str, MotorCalibration] = {}
    for spec in JOINTS:
        joint = str(spec["joint"])
        raw_a = records[joint]["first"]
        raw_b = records[joint]["second"]
        raw_min = min(raw_a, raw_b)
        raw_max = max(raw_a, raw_b)
        if raw_max - raw_min < 8:
            raise ValueError(f"{joint} endpoints are too close together: {raw_a}, {raw_b}")

        # Match LeRobot's convention: after homing, the joint midpoint is near
        # half-turn. Range limits are expressed in the new homed coordinate.
        midpoint = round((raw_min + raw_max) / 2)
        homing_offset = midpoint - 2047
        range_min = raw_min - homing_offset
        range_max = raw_max - homing_offset
        if not (0 <= range_min < range_max <= 4095):
            raise ValueError(
                f"{joint} homed range [{range_min}, {range_max}] is outside 0..4095. "
                f"Raw endpoints were {raw_a}, {raw_b}."
            )

        calibration[joint] = MotorCalibration(
            id=int(spec["id"]),
            drive_mode=0,
            homing_offset=int(homing_offset),
            range_min=int(range_min),
            range_max=int(range_max),
        )
    return calibration


def write_json(path: Path, calibration: dict[str, MotorCalibration], records: dict[str, dict[str, int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {joint: asdict(cal) for joint, cal in calibration.items()}
    path.write_text(json.dumps(payload, indent=4) + "\n")

    sidecar = path.with_suffix(".records.json")
    sidecar.write_text(json.dumps({"records": records, "calibration": payload}, indent=2) + "\n")
    print(f"Saved calibration file: {path}")
    print(f"Saved raw endpoint record: {sidecar}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", help="Serial port, for example /dev/tty.usbmodem5A460833421.")
    parser.add_argument("--robot-id", default=DEFAULT_ROBOT_ID, help="Calibration id/file stem to write.")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    parser.add_argument("--output", type=Path, help="Override calibration output JSON path.")
    parser.add_argument("--no-write-motors", action="store_true", help="Only write the JSON file, not servo registers.")
    parser.add_argument("--yes", action="store_true", help="Skip the safety confirmation prompt.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    port = args.port or find_default_port()
    output = args.output or (CALIBRATION_DIR / f"{args.robot_id}.json")

    print("Deterministic SO-101 calibration")
    print(f"port: {port}")
    print(f"robot id: {args.robot_id}")
    print(f"output: {output}")
    print("\nThis will disable torque, reset the servo homing/limits to factory values,")
    print("record explicit endpoints, and write a LeRobot calibration file.")
    if not args.no_write_motors:
        print("It will also write the resulting calibration back to the servo registers.")
    if not args.yes:
        reply = input("Continue? Type 'yes' and press ENTER: ").strip().lower()
        if reply != "yes":
            print("Canceled.")
            return 1

    bus = build_bus(port)
    try:
        bus.connect(handshake=True)
        bus.set_baudrate(args.baud)
        bus.disable_torque(num_retry=3)
        for spec in JOINTS:
            bus.write("Operating_Mode", str(spec["joint"]), OperatingMode.POSITION.value, normalize=False, num_retry=3)

        print("\nResetting homing offsets and position limits to factory range before recording.")
        bus.reset_calibration()
        bus.disable_torque(num_retry=3)

        records: dict[str, dict[str, int]] = {}
        for spec in JOINTS:
            joint = str(spec["joint"])
            first = prompt_position(bus, spec, str(spec["first"]))
            second = prompt_position(bus, spec, str(spec["second"]))
            records[joint] = {"first": first, "second": second}

        calibration = calibration_from_records(records)

        print("\nComputed calibration:")
        for joint, cal in calibration.items():
            print(
                f"{joint:<14} id={cal.id} homing_offset={cal.homing_offset:>5} "
                f"range=[{cal.range_min:>4}, {cal.range_max:>4}]"
            )

        backup_existing(output)
        write_json(output, calibration, records)

        if args.no_write_motors:
            print("Skipped writing calibration to servo registers because --no-write-motors was set.")
        else:
            bus.write_calibration(calibration, cache=True)
            print("Wrote calibration to servo registers.")

        print("\nUse this arm with:")
        print(f"  robot_id/id: {args.robot_id}")
        print(f"  port: {port}")
        return 0
    finally:
        if bus.is_connected:
            try:
                bus.disable_torque(num_retry=3)
            finally:
                bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    raise SystemExit(main())
