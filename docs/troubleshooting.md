# Troubleshooting

## No Servos Found

Symptoms:

```text
No status packet
Missing motor IDs 1..6
probe_feetech returns no hits
```

Likely causes:

- external servo power supply is off,
- USB-C is connected but servo power is not,
- servo bus cable is on the wrong channel,
- board jumper/channel is wrong,
- cable polarity is wrong,
- another process has the serial port open.

Fix:

1. Power-cycle the servo board.
2. Unplug and replug USB-C.
3. Verify external servo power.
4. Verify the servo bus cable and jumper/channel.
5. Run `probe_feetech` again before connecting.

## Intermittent Status Packet Failures

The Feetech bus can occasionally return:

```text
[TxRxResult] There is no status packet!
```

This has been observed immediately after motion. The server retries observations,
and raw pings usually recover. If repeated failures occur, disconnect/reconnect
or power-cycle the adapter.

## Camera Warnings

OpenCV may print warnings when probing camera indices that do not exist. This is
harmless if camera `0` lists and `view_camera` returns an image.

On macOS, grant camera permission to the terminal or MCP host process if frame
capture fails.

## Bad Spatial Direction

The agent cannot infer physical orientation perfectly from joint names. Use
camera frames and the pose table.

Important known visual mapping:

```text
shoulder_lift around +108 looked down/floor-parallel
shoulder_lift around 0 looked roughly 90 degrees/upright
shoulder_lift around -96 overshot past upright
```

When correcting a pose, make small moves with `max_step <= 5`.
