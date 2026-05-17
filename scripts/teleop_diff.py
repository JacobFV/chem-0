#!/usr/bin/env python3
"""Differential teleop — records starting offset, uses wide safe range."""
import os, sys, time, signal
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']
LEADER_PORT = '/dev/tty.usbmodem5A7A0187661'
FOLLOWER_PORT = '/dev/tty.usbmodem5A460833421'

# Wide safe range: 200 ticks from hardware limits (0-4095)
MARGIN = 200
SAFE = {j: (MARGIN, 4095 - MARGIN) for j in JOINTS}
# Gripper has tighter range
SAFE['gripper'] = (MARGIN, 4000)

running = True
signal.signal(signal.SIGINT, lambda s, f: globals().__setitem__('running', False))

def drain(bus):
    try:
        ser = bus.port_handler.ser
        if ser and ser.is_open: ser.reset_input_buffer(); ser.reset_output_buffer()
    except Exception: pass

def make_bus(port):
    motors = {j: Motor(i+1, 'sts3215', MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.connect(handshake=False)
    bus.set_baudrate(1000000)
    return bus

leader = make_bus(LEADER_PORT)
follower = make_bus(FOLLOWER_PORT)

# Low torque on follower
for j in JOINTS:
    limit = 200 if j == 'gripper' else 300
    for _ in range(3):
        try: follower.write('Max_Torque_Limit', j, limit, num_retry=5); break
        except Exception: time.sleep(0.01)

# Record initial offset (arms are in same pose)
drain(leader)
l0 = leader.sync_read('Present_Position', normalize=False, num_retry=5)
drain(follower)
f0 = follower.sync_read('Present_Position', normalize=False, num_retry=5)

OFFSET = {j: l0[j] - f0[j] for j in JOINTS}
print("Arms synced. Starting position recorded.")
for j in JOINTS:
    print(f"  {j}: leader_raw={l0[j]}  follower_raw={f0[j]}  offset={OFFSET[j]:+d}")

print("\nTeleop running. Ctrl+C to stop.")
t_last = time.perf_counter()
while running:
    drain(leader)
    l_raw = leader.sync_read('Present_Position', normalize=False, num_retry=5)

    goal_raw = {}
    for j in JOINTS:
        raw = l_raw[j] - OFFSET[j]
        lo, hi = SAFE[j]
        if raw < lo: raw = lo
        if raw > hi: raw = hi
        goal_raw[j] = raw

    drain(follower)
    follower.sync_write('Goal_Position', goal_raw, normalize=False, num_retry=5)

    now = time.perf_counter()
    hz = 1 / (now - t_last) if (now - t_last) > 0 else 0
    t_last = now

    print(f"[{hz:.0f} Hz] " + " ".join(f"{j}={goal_raw[j]}" for j in JOINTS))
    time.sleep(max(0, 1/30 - (time.perf_counter() - now)))

leader.disconnect(disable_torque=False)
follower.disconnect(disable_torque=False)
print("\nStopped.")
