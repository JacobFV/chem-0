#!/usr/bin/env python3
"""
Wrapper around lerobot-teleoperate with bus retry and backoff.
"""
import os, sys, time, logging
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)

import lerobot.motors.motors_bus as mb
import lerobot.motors.feetech.feetech as ft

logger = logging.getLogger(__name__)

_orig_sync_read = mb.MotorsBus.sync_read
_orig_write = mb.MotorsBus.write
_orig_disable_torque = ft.FeetechMotorsBus.disable_torque
_orig_enable_torque = ft.FeetechMotorsBus.enable_torque
_orig_disconnect = mb.MotorsBus.disconnect

def _drain(bus):
    try:
        ser = bus.port_handler.ser
        if ser and ser.is_open:
            ser.reset_input_buffer()
            ser.reset_output_buffer()
    except Exception:
        pass

def _retry_with_backoff(fn, bus, max_attempts=5):
    for attempt in range(max_attempts):
        try:
            return fn()
        except ConnectionError:
            if attempt == max_attempts - 1:
                raise
            _drain(bus)
            time.sleep(0.005 * (2 ** attempt))
    raise RuntimeError("unreachable")

def _patched_sync_read(self, data_name, motors=None, *, normalize=True, num_retry=10):
    _drain(self)
    return _retry_with_backoff(
        lambda: _orig_sync_read(self, data_name, motors, normalize=normalize, num_retry=num_retry),
        self
    )

def _patched_write(self, addr, name_or_id, value, normalize=True, num_retry=10):
    return _retry_with_backoff(
        lambda: _orig_write(self, addr, name_or_id, value, normalize=normalize, num_retry=num_retry),
        self
    )

def _patched_disable_torque(self, motors=None, num_retry=10):
    return _orig_disable_torque(self, motors, num_retry=num_retry)

def _patched_enable_torque(self, motors=None, num_retry=10):
    return _orig_enable_torque(self, motors, num_retry=num_retry)

def _patched_disconnect(self, disable_torque=True):
    try:
        _orig_disconnect(self, disable_torque=disable_torque)
    except Exception:
        try:
            self.port_handler.closePort()
        except Exception:
            pass
        self._is_connected = False

mb.MotorsBus.sync_read = _patched_sync_read
mb.MotorsBus.write = _patched_write
ft.FeetechMotorsBus.disable_torque = _patched_disable_torque
ft.FeetechMotorsBus.enable_torque = _patched_enable_torque
mb.MotorsBus.disconnect = _patched_disconnect

from lerobot.scripts.lerobot_teleoperate import main
sys.exit(main())
