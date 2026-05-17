#!/usr/bin/env python3
"""Enable torque on follower arm after manual adjustment."""
import os, time
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

FOLLOWER_PORT = '/dev/tty.usbmodem5A460833421'
JOINTS = ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']

motors = {j: Motor(i+1, 'sts3215', MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
bus = FeetechMotorsBus(port=FOLLOWER_PORT, motors=motors)
bus.connect(handshake=False)
bus.set_baudrate(1000000)

limit = 200 if True else 300  # gripper
for j in JOINTS:
    try:
        bus.write("Torque_Enable", j, 1, num_retry=5)
        print(f"  {j}: torque ON")
    except Exception as e:
        print(f"  {j}: FAILED - {e}")

bus.disconnect(disable_torque=False)
print("\nTorque enabled.")
