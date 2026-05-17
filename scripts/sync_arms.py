#!/usr/bin/env python3
"""Move follower to match leader's current pose, then start teleoperation."""
import os, sys, time
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

import draccus
from lerobot.motors import Motor, MotorNormMode, MotorCalibration
from lerobot.motors.feetech import FeetechMotorsBus

LEADER_PORT = '/dev/tty.usbmodem5A7A0187661'
FOLLOWER_PORT = '/dev/tty.usbmodem5A460833421'
JOINTS = ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']

with open('calibration/mcp_so101_leader.json') as f, draccus.config_type('json'):
    leader_cal = draccus.load(dict[str, MotorCalibration], f)
with open('calibration/mcp_so101_follower.json') as f, draccus.config_type('json'):
    follower_cal = draccus.load(dict[str, MotorCalibration], f)

def make_bus(port, cal):
    motors = {j: Motor(i+1, 'sts3215', MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors, calibration=cal)
    bus.connect(handshake=False)
    bus.set_baudrate(1000000)
    return bus

leader = make_bus(LEADER_PORT, leader_cal)
follower = make_bus(FOLLOWER_PORT, follower_cal)

leader_pos = leader.sync_read('Present_Position', normalize=True)
follower_pos = follower.sync_read('Present_Position', normalize=True)

print('Syncing follower to leader pose...')
STEPS = 80
for step in range(1, STEPS + 1):
    frac = step / STEPS
    goal = {j: follower_pos[j] + (leader_pos[j] - follower_pos[j]) * frac for j in JOINTS}
    follower.sync_write('Goal_Position', goal)
    time.sleep(0.015)

print('Synced. Starting teleoperation...')

follower.disconnect(disable_torque=False)
leader.disconnect(disable_torque=False)

# Now launch teleop
import subprocess
cmd = [
    sys.executable, 'scripts/teleop_patched.py',
    '--robot.type=so101_follower',
    f'--robot.port={FOLLOWER_PORT}',
    '--robot.id=mcp_so101_follower',
    '--robot.calibration_dir=calibration',
    '--robot.max_relative_target=30',
    '--robot.cameras={front: {type: opencv, index_or_path: 0, width: 1920, height: 1080, fps: 30}}',
    '--teleop.type=so101_leader',
    f'--teleop.port={LEADER_PORT}',
    '--teleop.id=mcp_so101_leader',
    '--teleop.calibration_dir=calibration',
    '--display_data=true',
]
os.execvp(sys.executable, cmd)
