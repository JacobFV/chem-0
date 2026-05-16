# Kinematics

`chem-0` supports a small Cartesian control layer on top of the original
six-joint pose interface.

## Implementation

The MCP server uses:

```text
assets/kinematics/so101_kinematics.urdf
```

with LeRobot's `RobotKinematics` class. `RobotKinematics` uses `placo` for FK.
The server then runs a compact damped-least-squares position IK loop over FK so
small Cartesian moves are less sensitive to one-shot IK local minima. The URDF
is a minimal kinematic model: it keeps SO-101 links, joint origins, axes,
limits, and the `gripper_frame_link` target frame, but omits visual meshes.

## Naming

Joint-space tools:

```text
get_arm_pose -> [shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper]
set_arm_pose <- same six values
```

Cartesian tools:

```text
get_position -> [x, y, z, gripper]
set_position <- x, y, z, optional gripper
```

`move_pose` remains as a backward-compatible alias for `set_arm_pose`.

## Coordinates

`x`, `y`, and `z` are meters in the SO-101 URDF base frame. `gripper` is percent
`0..100`.

Default workspace:

```text
x: -0.35..0.35 m
y: -0.35..0.35 m
z:  0.02..0.60 m
```

## IK Behavior

`set_position`:

1. Reads current joints.
2. Computes current FK.
3. Solves position-only IK for the requested `x/y/z`.
4. Validates the resulting joint pose.
5. Moves through `set_arm_pose` interpolation.

The solver stops when it reaches `tolerance_m` and rejects the command if the
best result is worse than `max_position_error_m`. This is less brittle for a
low-cost five-axis arm than forcing full 6D pose matching.

## Dependencies

Install with the repo script:

```sh
./scripts/install_deps.sh
```

`placo==0.9.20` may pull a NumPy version newer than LeRobot allows. The install
script intentionally restores LeRobot's supported NumPy range afterward and
reinstalls the Pinocchio/Coal shared-library wheels without dependency
resolution. The local test environment has verified that LeRobot `0.5.1` and
`placo 0.9.20` import together with NumPy `2.2.6`.
