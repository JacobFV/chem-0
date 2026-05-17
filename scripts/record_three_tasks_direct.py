#!/usr/bin/env python3
"""Record SO-101 teleop datasets directly (bypasses vendored lerobot_record.py)."""

import io
import json
import os
import serial
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

LEADER_PORT = os.environ.get("LEADER_PORT", "/dev/cu.usbmodem5A7A0187661")
FOLLOWER_PORT = os.environ.get("FOLLOWER_PORT", "/dev/cu.usbmodem5A460833421")
HF_USER = os.environ.get("USER", "harvest")
TASKS = os.environ.get("TASKS", "swirl pick-and-pour discard").split()
NUM_EPISODES = int(os.environ.get("NUM_EPISODES", "1"))
EPISODE_TIME_S = int(os.environ.get("EPISODE_TIME_S", "10"))
RESET_TIME_S = int(os.environ.get("RESET_TIME_S", "5"))
FPS = int(os.environ.get("FPS", "30"))


def release_ports():
    for p in [
        "/dev/tty.usbmodem5A460833421", "/dev/tty.usbmodem5A7A0187661",
        "/dev/cu.usbmodem5A460833421", "/dev/cu.usbmodem5A7A0187661",
    ]:
        try:
            serial.Serial(p, 1000000, timeout=1).close()
        except Exception:
            pass


def main():
    release_ports()
    time.sleep(0.3)

    # Pre-feed stdin for any calibration prompts
    sys.stdin = io.StringIO("\n\n")

    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig
    from lerobot.teleoperators.so_leader import SO101Leader
    from lerobot.teleoperators.so_leader.config_so_leader import SOLeaderTeleopConfig
    from lerobot.processor import make_default_processors
    from lerobot.datasets import LeRobotDataset
    from lerobot.datasets.utils import aggregate_pipeline_dataset_features, create_initial_features
    from lerobot.utils.feature_utils import combine_feature_dicts

    for task in TASKS:
        repo_id = f"{HF_USER}/chem0-{task}"
        print(f"\n=== Recording {NUM_EPISODES} episodes of '{task}' -> {repo_id} ===")

        # Connect follower
        f_cfg = SO101FollowerConfig(port=FOLLOWER_PORT, id="mcp_so101", cameras={})
        follower = SO101Follower(f_cfg)
        follower.connect()
        print("follower connected")

        # Connect leader
        l_cfg = SOLeaderTeleopConfig(port=LEADER_PORT, id="mcp_so101")
        leader = SO101Leader(l_cfg)
        leader.connect()
        print("leader connected")

        # Create processors and dataset
        teleop_ap, robot_ap, robot_op = make_default_processors()

        dataset_features = combine_feature_dicts(
            aggregate_pipeline_dataset_features(
                pipeline=teleop_ap,
                initial_features=create_initial_features(action=follower.action_features),
                use_videos=False,
            ),
            aggregate_pipeline_dataset_features(
                pipeline=robot_op,
                initial_features=create_initial_features(observation=follower.observation_features),
                use_videos=False,
            ),
        )

        dataset = LeRobotDataset.create(
            repo_id, FPS,
            root=None,
            robot_type=follower.name,
            features=dataset_features,
            use_videos=False,
            image_writer_processes=0,
            image_writer_threads=0,
            streaming_encoding=True,
        )
        print("dataset created")

        # Record episodes
        for ep in range(NUM_EPISODES):
            print(f"  Episode {ep + 1}/{NUM_EPISODES} recording for {EPISODE_TIME_S}s...")
            dataset.clear_episode_buffer()
            dataset.start_episode()

            end_t = time.perf_counter() + EPISODE_TIME_S
            frame_count = 0
            while time.perf_counter() < end_t:
                loop_t = time.perf_counter()

                obs = follower.get_observation()
                act = leader.get_action()
                teleop_action = teleop_ap((act, obs))
                robot_action = robot_ap((teleop_action, obs))

                follower.send_action(robot_action)

                obs_processed = robot_op(obs)

                from lerobot.utils.feature_utils import build_dataset_frame
                from lerobot.utils.constants import ACTION, OBS_STR

                action_frame = build_dataset_frame(dataset.features, teleop_action, prefix=ACTION)
                frame = {**build_dataset_frame(dataset.features, obs_processed, prefix=OBS_STR), **action_frame, "task": task}
                dataset.add_frame(frame)
                frame_count += 1

                elapsed = time.perf_counter() - loop_t
                sleep_s = max(0, (1.0 / FPS) - elapsed)
                if sleep_s > 0:
                    time.sleep(sleep_s)

            print(f"    recorded {frame_count} frames")
            dataset.save_episode()

            # Reset phase
            if ep < NUM_EPISODES - 1:
                print(f"  Reset for {RESET_TIME_S}s...")
                end_t = time.perf_counter() + RESET_TIME_S
                while time.perf_counter() < end_t:
                    obs = follower.get_observation()
                    time.sleep(1.0 / FPS)

        dataset.finalize()
        print(f"  Dataset finalized: {repo_id}")
        follower.disconnect()
        leader.disconnect()
        print(f"  Disconnected")

        release_ports()
        time.sleep(1)

    print("\nAll done.")


if __name__ == "__main__":
    main()
