# Pose Table

The MCP server exposes the pose table through:

```text
lerobot://pose-table
```

and through the tool:

```text
get_pose_table
```

## Joint Order

`move_pose` requires exactly these six values:

```text
shoulder_pan
shoulder_lift
elbow_flex
wrist_flex
wrist_roll
gripper
```

## Units

| Joint | Unit |
| --- | --- |
| `shoulder_pan` | degrees |
| `shoulder_lift` | degrees |
| `elbow_flex` | degrees |
| `wrist_flex` | degrees |
| `wrist_roll` | degrees |
| `gripper` | percent, `0..100` |

## Calibrated Limits

| Joint | Min | Max |
| --- | ---: | ---: |
| `shoulder_pan` | -116.88 | 116.88 |
| `shoulder_lift` | -113.05 | 113.05 |
| `elbow_flex` | -81.05 | 81.05 |
| `wrist_flex` | -103.99 | 103.99 |
| `wrist_roll` | -180.00 | 180.00 |
| `gripper` | 0.00 | 100.00 |

## Orientation Notes

Physical visual feedback established:

```text
shoulder_lift around +108 looked down/floor-parallel
shoulder_lift around 0 looked roughly 90 degrees/upright
shoulder_lift around -96 overshot past upright
```

## Reference Poses

### Base Left, Vertical, Extended

```json
{
  "shoulder_pan": -109,
  "shoulder_lift": 0,
  "elbow_flex": -70,
  "wrist_flex": 0,
  "wrist_roll": -164,
  "gripper": 0.5
}
```

### Base Center, Vertical, Extended

```json
{
  "shoulder_pan": 0,
  "shoulder_lift": 0,
  "elbow_flex": -70,
  "wrist_flex": 0,
  "wrist_roll": -164,
  "gripper": 0.5
}
```

### Neutral Midrange

```json
{
  "shoulder_pan": 0,
  "shoulder_lift": 0,
  "elbow_flex": 0,
  "wrist_flex": 0,
  "wrist_roll": 0,
  "gripper": 50
}
```

## Safety Rule

Agents should read the pose table before movement and should use `move_pose`
with `allow_out_of_range: false`.
