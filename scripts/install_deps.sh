#!/usr/bin/env sh
set -eu

PYTHON="${PYTHON:-.venv/bin/python}"

"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r requirements.txt

# LeRobot 0.5.1 requires NumPy <2.3. Current placo wheels pull a transitive
# package that advertises NumPy >=2.3, even though placo imports and FK works
# after restoring LeRobot's supported NumPy range.
"$PYTHON" -m pip install "placo==0.9.20"
"$PYTHON" -m pip install --force-reinstall --no-deps "libcoal==3.0.2" "libpinocchio==3.8.0"
"$PYTHON" -m pip install "numpy>=2.0,<2.3"
