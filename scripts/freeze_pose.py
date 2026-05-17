#!/usr/bin/env python3
"""Freeze both arms — enable torque at current position (skips overloaded motors)."""
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
    # Read current raw position and set as goal
    pos = bus.sync_read('Present_Position', normalize=False, num_retry=5)
    bus.sync_write('Goal_Position', pos, normalize=False, num_retry=5)
    # Enable torque per-joint, skip overloaded
    ok = []
    fail = []
    for j in JOINTS:
        try:
            bus.write("Torque_Enable", j, 1, num_retry=5)
            ok.append(j)
        except Exception as e:
            fail.append((j, str(e)))
    bus.disconnect(disable_torque=False)
    print(f"{label}: torque ON on {', '.join(ok)}")
    if fail:
        for j, e in fail:
            print(f"  {j}: SKIPPED ({e.split('.')[-1]})")

print("\nReady. Start teleop with:")
print("  uv run python scripts/teleop_safe.py")
