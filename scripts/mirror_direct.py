#!/usr/bin/env python3
"""Direct bus-level leader-follower mirror (bypasses SOFollower/SOLeader wrappers)."""

import os, sys, time, json
from pathlib import Path

LEADER_PORT = os.environ.get("LEADER_PORT", "/dev/tty.usbmodem5A7A0187661")
FOLLOWER_PORT = os.environ.get("FOLLOWER_PORT", "/dev/tty.usbmodem5A460833421")
FPS = 30

import serial as _serial
for _p in [FOLLOWER_PORT, LEADER_PORT,
           FOLLOWER_PORT.replace("tty", "cu"), LEADER_PORT.replace("tty", "cu")]:
    try:
        _serial.Serial(_p, 1000000, timeout=1).close()
    except Exception:
        pass
time.sleep(0.5)

from lerobot.motors.feetech import FeetechMotorsBus, OperatingMode
from lerobot.motors import Motor, MotorNormMode

def make_bus(port):
    return FeetechMotorsBus(port=port, motors={
        "shoulder_pan":  Motor(1, "sts3215", MotorNormMode.DEGREES),
        "shoulder_lift": Motor(2, "sts3215", MotorNormMode.DEGREES),
        "elbow_flex":    Motor(3, "sts3215", MotorNormMode.DEGREES),
        "wrist_flex":    Motor(4, "sts3215", MotorNormMode.DEGREES),
        "wrist_roll":    Motor(5, "sts3215", MotorNormMode.DEGREES),
        "gripper":       Motor(6, "sts3215", MotorNormMode.RANGE_0_100),
    })

# Load calibration for each arm
def load_cal(cal_path):
    with open(cal_path) as f:
        return json.load(f)

follower_cal = load_cal(Path.home() / ".cache" / "huggingface" / "lerobot" / "calibration" / "robots" / "so_follower" / "main_follower.json")
leader_cal = load_cal(Path.home() / ".cache" / "huggingface" / "lerobot" / "calibration" / "teleoperators" / "so_leader" / "main_leader.json")

# Connect buses
print("Connecting follower bus...")
follower_bus = make_bus(FOLLOWER_PORT)
follower_bus.connect()
follower_bus.write_calibration({n: type("MC", (), d)() for n, d in follower_cal.items()})  # skip - just verify cache
print("Follower bus connected")

print("Connecting leader bus...")
leader_bus = make_bus(LEADER_PORT)
leader_bus.connect()
leader_bus.write_calibration({n: type("MC", (), d)() for n, d in leader_cal.items()})
print("Leader bus connected")

# Enable torque on follower for motion
follower_bus.enable_torque()
# Disable torque on leader for free movement
leader_bus.disable_torque()

# Set position mode on all motors
for bus in [follower_bus, leader_bus]:
    for name in bus.motors:
        bus.write("Operating_Mode", name, OperatingMode.POSITION.value)

print("\n--- Mirroring. Move the leader arm. Ctrl+C to stop. ---")
try:
    while True:
        t0 = time.perf_counter()

        # Read leader positions
        leader_pos = leader_bus.sync_read("Present_Position")
        # Read follower positions
        follower_pos = follower_bus.sync_read("Present_Position")

        # Normalize leader positions using its calibration
        action = {}
        for name in leader_pos:
            cal = leader_cal[name]
            raw = leader_pos[name]
            # Convert raw to degrees using homing offset
            # STS3215: 0-4095 maps to 0-360 degrees
            deg = (raw - cal["homing_offset"]) * 360.0 / 4095.0
            if name == "gripper":
                # Gripper is 0-100% (percent open)
                action[name] = max(0, min(100, deg / 3.6))
            else:
                action[name] = deg

        # Send to follower (convert degrees back to raw using follower calibration)
        write_cmds = {}
        for name in action:
            cal = follower_cal[name]
            deg = action[name]
            raw = int(cal["homing_offset"] + deg * 4095.0 / 360.0)
            raw = max(cal["range_min"], min(cal["range_max"], raw))
            write_cmds[name] = raw

        # Write to follower
        follower_bus.sync_write(write_cmds)

        dt = time.perf_counter() - t0
        sleep_s = max(0, 1.0 / FPS - dt)
        if sleep_s > 0:
            time.sleep(sleep_s)

        vals = " | ".join(f"{k}:{v:5.1f}" for k, v in list(action.items())[:3])
        print(f"\r{vals}  loop:{dt*1000:.0f}ms", end="", flush=True)

except KeyboardInterrupt:
    print("\n\nStopping...")
finally:
    try:
        follower_bus.disable_torque()
    except Exception:
        pass
    try:
        follower_bus.disconnect()
    except Exception:
        pass
    try:
        leader_bus.disconnect()
    except Exception:
        pass
    print("Disconnected.")
