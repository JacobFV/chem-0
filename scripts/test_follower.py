#!/usr/bin/env python3
"""Simple follower arm test: connect, read state, send small motions."""

import io
import time
import sys
import os

sys.stdin = io.StringIO("\n")

from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

FOLLOWER_PORT = os.environ.get("FOLLOWER_PORT", "/dev/tty.usbmodem5A460833421")

follower = SO101FollowerConfig(port=FOLLOWER_PORT, id="main_follower", cameras={})
robot = SO101Follower(follower)
robot.connect()
print(f"Connected: {robot.is_connected}")

obs = robot.get_observation()
print(f"Joint positions: { {k: f'{v:.1f}' for k, v in obs.items()} }")

time.sleep(0.5)
obs2 = robot.get_observation()
print(f"After 0.5s:      { {k: f'{v:.1f}' for k, v in obs2.items()} }")

robot.disconnect()
print("Done.")
