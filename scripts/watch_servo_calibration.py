#!/usr/bin/env python3
"""Poll and display live servo raw positions during calibration.

Reads all joints once per port per cycle. Shows raw positions.

Usage:
    uv run python scripts/watch_servo_calibration.py /dev/tty.usbmodem5A460833421
    uv run python scripts/watch_servo_calibration.py --all
"""

import os, sys, time, json, signal
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]

ARM_DB = [
    {"port": "/dev/tty.usbmodem5A7A0187661", "label": "LEADER"},
    {"port": "/dev/tty.usbmodem5A460833421", "label": "FOLLOWER"},
]

CAL_DIR = Path.home() / ".cache/huggingface/lerobot/calibration/robots/so_follower"
CAL_LEADER = Path("calibration/so101_leader.json")

running = True
def handler(s, f):
    global running; running = False
signal.signal(signal.SIGINT, handler)

def load_calibration(path):
    try:
        d = json.loads(Path(path).read_text())
        if "motors" in d:
            return {m["name"]: m["calibration"] for m in d["motors"]}
        return {}
    except: return {}

def connect_bus(port):
    motors = {j: Motor(i+1, "sts3215", MotorNormMode.DEGREES) for i, j in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.connect(handshake=False)
    bus.set_baudrate(1000000)
    return bus


def main():
    ports = []
    if "--all" in sys.argv:
        ports = [a["port"] for a in ARM_DB]
    else:
        ports = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not ports:
        print(f"Usage: uv run python {sys.argv[0]} <port> [port2 ...]  or  --all")
        for a in ARM_DB:
            print(f"  {a['label']:8s} {a['port']}")
        sys.exit(1)

    arm_labels = {a["port"]: a["label"] for a in ARM_DB}

    # Load previous calibration offsets
    cal_follower = load_calibration(CAL_DIR / "mcp_so101_follower.json")
    cal_leader = load_calibration(CAL_LEADER)

    cal_map = {
        "/dev/tty.usbmodem5A460833421": cal_follower,
        "/dev/tty.usbmodem5A7A0187661": cal_leader,
    }

    # Open buses
    buses = {}
    for p in ports:
        try:
            buses[p] = connect_bus(p)
        except Exception as e:
            print(f"FAILED to open {p}: {e}")
            sys.exit(1)

    header = f"{'Joint':>15s}"
    for p in ports:
        header += f"  {arm_labels.get(p, p[-8:]):>11s}"
    print(header)
    print("-" * len(header))

    while running:
        readings = {}
        for p in ports:
            try:
                readings[p] = buses[p].sync_read("Present_Position", normalize=False, num_retry=2)
            except Exception as e:
                readings[p] = None

        for j in JOINTS:
            row = f"{j:>15s}"
            for p in ports:
                r = readings.get(p)
                if r is None:
                    row += f"  {'ERR':>11s}"
                    continue
                raw = r.get(j)
                if raw is None:
                    row += f"  {'?':>11s}"
                    continue
                prev_ho = cal_map.get(p, {}).get(j, {}).get("homing_offset", 0)
                delta = raw - prev_ho
                row += f"  {raw:>5d} ({delta:>+5d})"
            print(row)

        print(f"  [Ctrl+C to stop]")
        for _ in range(40):
            if not running: break
            time.sleep(0.05)

    for bus in buses.values():
        try: bus.disconnect(disable_torque=False)
        except: pass
    print("\nDone.")


if __name__ == "__main__":
    main()
