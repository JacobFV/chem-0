#!/usr/bin/env bash
# Record three SO-101 teleop datasets (swirl, pick-and-pour, discard) using the
# vendored upstream lerobot_record.py. Override any variable via env, e.g.:
#
#   USER=myhfuser TASKS="swirl discard" bash scripts/record_three_tasks.sh
#
# Keyboard during recording: right=end episode, left=re-record, esc=stop session.

set -euo pipefail

cd "$(dirname "$0")/.."

# Release any lingering macOS serial port locks from failed runs
python3 -c "
import serial
for p in ['/dev/tty.usbmodem5A460833421', '/dev/tty.usbmodem5A7A0187661',
           '/dev/cu.usbmodem5A460833421', '/dev/cu.usbmodem5A7A0187661']:
    try:
        serial.Serial(p, 1000000, timeout=1).close()
    except:
        pass
" 2>/dev/null || true

LEADER_PORT="${LEADER_PORT:-/dev/cu.usbmodem5A7A0187661}"
FOLLOWER_PORT="${FOLLOWER_PORT:-/dev/cu.usbmodem5A460833421}"
LEADER_ID="${LEADER_ID:-mcp_so101}"
FOLLOWER_ID="${FOLLOWER_ID:-mcp_so101}"
HF_USER="${USER:-indiraschka}"
TASKS="${TASKS:-swirl pick-and-pour discard}"
NUM_EPISODES="${NUM_EPISODES:-10}"
EPISODE_TIME_S="${EPISODE_TIME_S:-20}"
RESET_TIME_S="${RESET_TIME_S:-10}"
FPS="${FPS:-30}"
CAMERAS="${CAMERAS:-{}}"
PYTHON="${PYTHON:-uv run python}"
SCRIPT="${SCRIPT:--m lerobot.scripts.lerobot_record}"

for path in "$LEADER_PORT" "$FOLLOWER_PORT"; do
  if [ ! -e "$path" ]; then
    echo "ERROR: serial port not present: $path" >&2
    echo "Detected ports:" >&2
    ls /dev/cu.usbmodem* 2>&1 | sed 's/^/  /' >&2
    exit 1
  fi
done

CAL_LEADER="$HOME/.cache/huggingface/lerobot/calibration/teleoperators/so_leader/${LEADER_ID}.json"
CAL_FOLLOWER="$HOME/.cache/huggingface/lerobot/calibration/robots/so_follower/${FOLLOWER_ID}.json"
for path in "$CAL_LEADER" "$CAL_FOLLOWER"; do
  if [ ! -f "$path" ]; then
    echo "ERROR: calibration missing: $path" >&2
    exit 1
  fi
done

echo "leader  : $LEADER_PORT (id=$LEADER_ID)"
echo "follower: $FOLLOWER_PORT (id=$FOLLOWER_ID)"
echo "user    : $HF_USER"
echo "tasks   : $TASKS"
echo

CLEAN="${CLEAN:-0}"
RESUME="${RESUME:-0}"

for TASK in $TASKS; do
  REPO_ID="${HF_USER}/chem0-${TASK}"
  DATASET_DIR="$HOME/.cache/huggingface/lerobot/${REPO_ID}"
  RESUME_FLAG=""
  if [ -d "$DATASET_DIR" ]; then
    if [ "$CLEAN" = "1" ]; then
      echo "CLEAN=1 -> removing existing $DATASET_DIR"
      rm -rf "$DATASET_DIR"
    elif [ "$RESUME" = "1" ]; then
      echo "RESUME=1 -> appending episodes to existing $DATASET_DIR"
      RESUME_FLAG="--resume=true"
    else
      echo "ERROR: dataset already exists at $DATASET_DIR" >&2
      echo "       rerun with CLEAN=1 to overwrite, or RESUME=1 to append episodes." >&2
      exit 1
    fi
  fi
  echo "=== Recording $NUM_EPISODES episodes of '$TASK' -> $REPO_ID ==="
  printf '\n\n' | $PYTHON $SCRIPT $RESUME_FLAG \
    --robot.type=so101_follower \
    --robot.port="$FOLLOWER_PORT" \
    --robot.id="$FOLLOWER_ID" \
    --robot.cameras="$CAMERAS" \
    --teleop.type=so101_leader \
    --teleop.port="$LEADER_PORT" \
    --teleop.id="$LEADER_ID" \
    --dataset.repo_id="$REPO_ID" \
    --dataset.num_episodes="$NUM_EPISODES" \
    --dataset.single_task="$TASK" \
    --dataset.episode_time_s="$EPISODE_TIME_S" \
    --dataset.reset_time_s="$RESET_TIME_S" \
    --dataset.streaming_encoding=true \
    --dataset.push_to_hub=false \
    --display_data=true
done

echo "All done. Datasets under ~/.cache/huggingface/lerobot/<repo_id>/"
