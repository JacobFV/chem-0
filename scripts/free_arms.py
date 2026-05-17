#!/usr/bin/env python3
"""Disable torque on both arms so you can manually match poses."""
import os, sys
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

PORTS = [
    ('/dev/tty.usbmodem5A7A0187661', 'LEADER'),
    ('/dev/tty.usbmodem5A460833421', 'FOLLOWER'),
]
JOINTS = ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']

for port, label in PORTS:
    motors = {j: Motor(i+1, 'sts3215', MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.connect(handshake=False)
    bus.set_baudrate(1000000)
    for j in JOINTS:
        try:
            bus.write("Torque_Enable", j, 0, num_retry=5)
        except Exception:
            pass
    bus.disconnect(disable_torque=False)
    print(f"{label}: torque OFF")

print("\nBoth arms are free. Move them to match by hand.")
print("Then run: uv run python scripts/freeze_pose.py")
