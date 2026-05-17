#!/usr/bin/env python3
"""Safe SO-101 teleop with calibration-aware position mapping."""
import os, sys, time, signal
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

import draccus
from lerobot.motors import Motor, MotorNormMode, MotorCalibration
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']
LEADER_PORT = '/dev/tty.usbmodem5A7A0187661'
FOLLOWER_PORT = '/dev/tty.usbmodem5A460833421'

with open('calibration/mcp_so101_leader.json') as f, draccus.config_type('json'):
    L_CAL = draccus.load(dict[str, MotorCalibration], f)
with open('calibration/mcp_so101_follower.json') as f, draccus.config_type('json'):
    F_CAL = draccus.load(dict[str, MotorCalibration], f)

# Safe normalized range for follower (10% margin inside calibration range)
SAFE_NORM = {}
for j in JOINTS:
    mn = F_CAL[j].range_min
    mx = F_CAL[j].range_max
    mid = (mn + mx) / 2
    span = mx - mn
    margin = span * 0.1
    lo_raw = mn + margin
    hi_raw = mx - margin
    # norm = (raw - mid) * 360 / 4095
    lo_norm = (lo_raw - mid) * 360 / 4095
    hi_norm = (hi_raw - mid) * 360 / 4095
    SAFE_NORM[j] = (lo_norm, hi_norm)

# Normalization helpers using calibration
def raw_to_norm(cal, joint, raw):
    mn = cal[joint].range_min
    mx = cal[joint].range_max
    mid = (mn + mx) / 2
    return (raw - mid) * 360 / 4095

def norm_to_raw(cal, joint, norm):
    mn = cal[joint].range_min
    mx = cal[joint].range_max
    mid = (mn + mx) / 2
    return int(norm * 4095 / 360 + mid)

running = True
signal.signal(signal.SIGINT, lambda s, f: globals().__setitem__('running', False))

def drain(bus):
    try:
        ser = bus.port_handler.ser
        if ser and ser.is_open: ser.reset_input_buffer(); ser.reset_output_buffer()
    except Exception: pass

def make_bus(port, cal):
    motors = {j: Motor(i+1, 'sts3215', MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors, calibration=cal)
    bus.connect(handshake=False)
    bus.set_baudrate(1000000)
    return bus

leader = make_bus(LEADER_PORT, L_CAL)
follower = make_bus(FOLLOWER_PORT, F_CAL)

# Low torque on follower
for j in JOINTS:
    limit = 200 if j == 'gripper' else 300
    for _ in range(3):
        try: follower.write('Max_Torque_Limit', j, limit, num_retry=5); break
        except Exception: time.sleep(0.01)

print("Teleop running. Ctrl+C to stop.")
print(f"{'Joint':>15s}  {'L_raw':>6s}  {'L_norm':>7s}  {'F_raw':>6s}  {'Safe':>6s}")
print("-" * 50)

t_last = time.perf_counter()
while running:
    drain(leader)
    l_raw = leader.sync_read('Present_Position', normalize=False, num_retry=5)

    clamped_any = False
    goal_raw = {}
    for j in JOINTS:
        norm = raw_to_norm(L_CAL, j, l_raw[j])
        lo, hi = SAFE_NORM[j]
        if norm < lo: norm = lo; clamped_any = True
        if norm > hi: norm = hi; clamped_any = True
        goal_raw[j] = norm_to_raw(F_CAL, j, norm)

    drain(follower)
    follower.sync_write('Goal_Position', goal_raw, normalize=False, num_retry=5)

    now = time.perf_counter()
    hz = 1 / (now - t_last) if (now - t_last) > 0 else 0
    t_last = now

    for j in JOINTS:
        norm = raw_to_norm(L_CAL, j, l_raw[j])
        clamped = norm < SAFE_NORM[j][0] or norm > SAFE_NORM[j][1]
        print(f"{j:>15s}  {l_raw[j]:5d}  {norm:7.2f}  {goal_raw[j]:5d}  {'CLAMP' if clamped else '':>6s}")
    print(f"  [{hz:.0f} Hz]")
    print()

    time.sleep(max(0, 1/30 - (time.perf_counter() - now)))

leader.disconnect(disable_torque=False)
follower.disconnect(disable_torque=False)
print("\nStopped.")
