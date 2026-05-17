#!/usr/bin/env python3
"""Leader-follower teleop mirror test with safety clamping."""

import io, json, os, sys, time
from pathlib import Path

sys.stdin = io.StringIO("\n" * 20)

from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig
from lerobot.teleoperators.so_leader import SO101Leader
from lerobot.teleoperators.so_leader.config_so_leader import SOLeaderTeleopConfig
from lerobot.processor import make_default_processors

LEADER_PORT = os.environ.get("LEADER_PORT", "/dev/tty.usbmodem5A7A0187661")
FOLLOWER_PORT = os.environ.get("FOLLOWER_PORT", "/dev/tty.usbmodem5A460833421")
FPS = int(os.environ.get("FPS", "30"))

# Load follower calibration for safety clamping
with open(Path.home() / ".cache" / "huggingface" / "lerobot" / "calibration" / "robots" / "so_follower" / "mcp_so101_follower.json") as f:
    fcal = json.load(f)

# Safe degree limits for follower (clamp targets to stay within range)
FOLLOWER_SAFE = {}
for name, c in fcal.items():
    min_deg = (c["range_min"] - c["homing_offset"]) * 360.0 / 4095.0
    max_deg = (c["range_max"] - c["homing_offset"]) * 360.0 / 4095.0
    FOLLOWER_SAFE[name] = (min_deg, max_deg)
    print(f"  {name:15s} safe_deg=[{min_deg:+.0f}, {max_deg:+.0f}]")

# Release stale serial port locks
import serial as _serial
for _p in ['/dev/tty.usbmodem5A460833421', '/dev/tty.usbmodem5A7A0187661',
           '/dev/cu.usbmodem5A460833421', '/dev/cu.usbmodem5A7A0187661']:
    try:
        _serial.Serial(_p, 1000000, timeout=1).close()
    except Exception:
        pass
time.sleep(0.5)

def connect_with_retry(robot_or_leader, label, retries=5, delay=1):
    for attempt in range(retries):
        try:
            try:
                robot_or_leader.disconnect()
            except Exception:
                pass
            robot_or_leader.connect()
            print(f"{label} connected")
            return
        except Exception as e:
            print(f"{label} attempt {attempt+1}/{retries}: {str(e)[:60]}")
            if attempt < retries - 1:
                time.sleep(delay)
    raise RuntimeError(f"{label} failed after {retries} attempts")

print(f"Leader:   {LEADER_PORT}")
print(f"Follower: {FOLLOWER_PORT}")
print("Ctrl+C to stop.\n")

f_cfg = SO101FollowerConfig(port=FOLLOWER_PORT, id="mcp_so101_follower", cameras={})
follower = SO101Follower(f_cfg)
connect_with_retry(follower, "Follower")

l_cfg = SOLeaderTeleopConfig(port=LEADER_PORT, id="main_leader")
leader = SO101Leader(l_cfg)
connect_with_retry(leader, "Leader")

teleop_ap, robot_ap, robot_op = make_default_processors()

import functools

# Patch sync_write to drain stale RX bytes that corrupt subsequent sync_read
for bus in [follower.bus, leader.bus]:
    orig_sw = bus.sync_write
    @functools.wraps(orig_sw)
    def _patched_sw(data_name, values, orig=orig_sw, **kw):
        result = orig(data_name, values, **kw)
        time.sleep(0.01)
        try:
            ser = orig.__self__.port.ser
            if ser.in_waiting:
                ser.read(ser.in_waiting)
        except Exception:
            pass
        return result
    bus.sync_write = _patched_sw

# Retry sync_read on transient bus errors
for bus in [follower.bus, leader.bus]:
    orig_sr = bus.sync_read
    @functools.wraps(orig_sr)
    def _retried_sr(data_name, orig=orig_sr, **kw):
        for attempt in range(5):
            try:
                return orig(data_name, **kw)
            except Exception:
                if attempt < 4:
                    time.sleep(0.02)
                else:
                    raise
    bus.sync_read = _retried_sr

print("\n--- Mirroring started. Move the leader arm. ---")
try:
    while True:
        t0 = time.perf_counter()

        try:
            obs = follower.get_observation()
            act = leader.get_action()
        except Exception:
            print("\nBus error, reconnecting...")
            for obj in [follower, leader]:
                for _ in range(3):
                    try:
                        obj.disconnect()
                    except Exception:
                        pass
                    time.sleep(0.3)
            connect_with_retry(follower, "Follower")
            connect_with_retry(leader, "Leader")
            continue

        teleop_action = teleop_ap((act, obs))
        robot_action = robot_ap((teleop_action, obs))
        # Safety clamp follower targets within calibrated range
        for k in robot_action:
            if k in FOLLOWER_SAFE:
                lo, hi = FOLLOWER_SAFE[k]
                robot_action[k] = max(lo, min(hi, robot_action[k]))
        try:
            follower.send_action(robot_action)
        except Exception:
            pass

        dt = time.perf_counter() - t0
        sleep_s = max(0, 1.0 / FPS - dt)
        if sleep_s > 0:
            time.sleep(sleep_s)

        if int(t0 * 2) % 2 == 0:
            vals = " | ".join(f"{k.split('.')[0]}:{v:>6.1f}" for k, v in robot_action.items())
            print(f"\r{vals}  loop:{dt*1000:.0f}ms", end="", flush=True)

except KeyboardInterrupt:
    print("\n\nStopping...")
finally:
    for obj, name in [(leader, "Leader"), (follower, "Follower")]:
        for _ in range(3):
            try:
                obj.disconnect()
                print(f"{name} disconnected")
                break
            except Exception:
                time.sleep(0.5)


