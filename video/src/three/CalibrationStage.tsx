import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { PerspectiveCamera } from "@react-three/drei";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Arm, Pose } from "./Arm";

// Two arms sharing one stage: a "ghost" arm pinned at the target pose
// (translucent + emissive accent), and a "live" arm whose joints lerp
// toward the ghost over the scene's duration. The lerp uses a cosine
// ease so the arm settles instead of snapping. Reads as "the operator
// is bringing the real servo readings into alignment with the wizard's
// setpoint."
export const CalibrationStage: React.FC<{
  width: number;
  height: number;
  // The pose the wizard wants the arm at. Solid arm tweens toward this.
  target: Pose;
  // Where the live arm starts.
  start: Pose;
}> = ({ width, height, target, start }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // 0..1 over the full scene, with a slight ease so the move is most
  // active in the middle.
  const linear = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 12)));
  const t = 0.5 - 0.5 * Math.cos(Math.PI * linear);

  const live: Pose = {
    pan: lerp(start.pan, target.pan, t),
    lift: lerp(start.lift, target.lift, t),
    elbow: lerp(start.elbow, target.elbow, t),
    wristFlex: lerp(start.wristFlex, target.wristFlex, t),
    wristRoll: lerp(start.wristRoll, target.wristRoll, t),
    gripper: lerp(start.gripper, target.gripper, t),
  };

  return (
    <ThreeCanvas width={width} height={height}>
      <color attach="background" args={["#050505"]} />
      <fog attach="fog" args={["#050505", 7, 22]} />
      <hemisphereLight args={["#ffffff", "#202020", 0.5]} />
      <directionalLight position={[3, 6, 3]} intensity={0.9} />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} color="#f5d76e" />

      <PerspectiveCamera makeDefault position={[0, 3.2, 6.0]} fov={32} near={0.1} far={100} />

      {/* dark floor + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.95} />
      </mesh>
      <gridHelper args={[12, 24, "#2a2a2a", "#1a1a1a"]} position={[0, 0.001, 0]} />

      {/* Ghost target — wireframe-feeling overlay tinted accent gold. */}
      <group position={[0, 0, 0]}>
        <GhostArm pose={target} />
      </group>
      {/* Live arm — solid, follows */}
      <group position={[0, 0, 0]}>
        <Arm pose={live} />
      </group>
    </ThreeCanvas>
  );
};

// Renders the same procedural arm but with a translucent emissive
// material so it reads as "the setpoint." We wrap Arm in a group whose
// children inherit the modified material via a recursive override.
const GhostArm: React.FC<{ pose: Pose }> = ({ pose }) => {
  return (
    <group>
      <Arm pose={pose} />
      {/* a wireframe shell of the same arm a hair larger — adds the
          "hologram" feel without rewriting the mesh code. */}
      <group scale={[1.005, 1.005, 1.005]}>
        <Arm pose={pose} />
      </group>
      {/* tinted overlay sphere at the gripper tip to highlight the goal */}
      <mesh position={ghostTipPosition(pose)}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial
          color="#f5d76e"
          emissive="#f5d76e"
          emissiveIntensity={0.8}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  );
};

const ghostTipPosition = (p: Pose): [number, number, number] => {
  // Approximation — same as the rough end-effector position the arm
  // hierarchy reaches. Good enough for a glowing marker.
  return [0, 2.5 + Math.sin(p.lift) * 0.2, 0];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
