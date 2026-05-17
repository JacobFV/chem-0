#!/usr/bin/env python3
"""Toggle torque on follower arm (off=manual adjust, on=hold)."""
import os, sys, time
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

FOLLOWER_PORT = '/dev/tty.usbmodem5A460833421'
JOINTS = ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']

action = sys.argv[1] if len(sys.argv) > 1 else 'off'
value = 0 if action == 'off' else 1
label = 'OFF' if action == 'off' else 'ON'

motors = {j: Motor(i+1, 'sts3215', MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
bus = FeetechMotorsBus(port=FOLLOWER_PORT, motors=motors)
bus.connect(handshake=False)
bus.set_baudrate(1000000)

print(f"Setting torque {label} on follower...")
for j in JOINTS:
    try:
        bus.write("Torque_Enable", j, value, num_retry=5)
        print(f"  {j}: {label}")
    except Exception as e:
        print(f"  {j}: {e}")

bus.disconnect(disable_torque=False)
print(f"\nDone. Torque {label}.")
