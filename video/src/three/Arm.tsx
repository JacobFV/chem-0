import React from "react";
import * as THREE from "three";

// Procedural SO-101 styled 6-DoF arm. Not a CAD-accurate replica — proportions
// are tuned to read on a light background while keeping the silhouette
// recognizable: base, shoulder pan, lift link, elbow, wrist flex, wrist roll,
// gripper. Joint angles drive nested groups, so the chain transforms cleanly.
export type Pose = {
  pan: number; // radians, base yaw
  lift: number; // radians, shoulder pitch
  elbow: number; // radians, elbow pitch
  wristFlex: number; // radians
  wristRoll: number; // radians
  gripper: number; // 0..1 (0 closed, 1 open)
};

const MAT_SHELL = new THREE.MeshStandardMaterial({
  color: "#F3EFE6",
  metalness: 0.05,
  roughness: 0.55,
});
const MAT_JOINT = new THREE.MeshStandardMaterial({
  color: "#2A2520",
  metalness: 0.2,
  roughness: 0.35,
});
const MAT_ACCENT = new THREE.MeshStandardMaterial({
  color: "#A24E2B",
  metalness: 0.1,
  roughness: 0.4,
});
const MAT_GRIP = new THREE.MeshStandardMaterial({
  color: "#3D372F",
  metalness: 0.3,
  roughness: 0.4,
});

const RoundedBox: React.FC<{
  size: [number, number, number];
  position?: [number, number, number];
  material?: THREE.Material;
}> = ({ size, position, material = MAT_SHELL }) => (
  <mesh position={position} castShadow receiveShadow material={material}>
    <boxGeometry args={size} />
  </mesh>
);

const JointDisk: React.FC<{
  radius: number;
  thickness: number;
  axis?: "x" | "y" | "z";
}> = ({ radius, thickness, axis = "y" }) => {
  const rot: [number, number, number] =
    axis === "y"
      ? [0, 0, 0]
      : axis === "x"
        ? [0, 0, Math.PI / 2]
        : [Math.PI / 2, 0, 0];
  return (
    <mesh rotation={rot} material={MAT_JOINT} castShadow>
      <cylinderGeometry args={[radius, radius, thickness, 32]} />
    </mesh>
  );
};

export const Arm: React.FC<{ pose: Pose; mountY?: number }> = ({
  pose,
  mountY = 0,
}) => {
  return (
    <group position={[0, mountY, 0]}>
      {/* Base plate */}
      <RoundedBox size={[1.6, 0.18, 1.6]} position={[0, 0.09, 0]} />
      <RoundedBox
        size={[1.1, 0.06, 1.1]}
        position={[0, 0.21, 0]}
        material={MAT_ACCENT}
      />
      {/* J1: shoulder pan */}
      <group position={[0, 0.28, 0]} rotation={[0, pose.pan, 0]}>
        <JointDisk radius={0.42} thickness={0.34} axis="y" />
        {/* shoulder mount block */}
        <RoundedBox size={[0.7, 0.55, 0.55]} position={[0, 0.4, 0]} />
        {/* J2: shoulder lift */}
        <group position={[0, 0.55, 0]} rotation={[0, 0, pose.lift]}>
          <JointDisk radius={0.32} thickness={0.5} axis="x" />
          {/* upper link */}
          <group position={[0.0, 0.0, 0.0]}>
            <RoundedBox
              size={[0.36, 1.55, 0.42]}
              position={[0, 0.85, 0]}
            />
            <RoundedBox
              size={[0.42, 0.18, 0.46]}
              position={[0, 0.85, 0]}
              material={MAT_ACCENT}
            />
            {/* J3: elbow */}
            <group position={[0, 1.65, 0]} rotation={[0, 0, pose.elbow]}>
              <JointDisk radius={0.27} thickness={0.46} axis="x" />
              {/* forearm */}
              <RoundedBox
                size={[0.3, 1.25, 0.36]}
                position={[0, 0.7, 0]}
              />
              {/* J4: wrist flex */}
              <group position={[0, 1.32, 0]} rotation={[0, 0, pose.wristFlex]}>
                <JointDisk radius={0.22} thickness={0.4} axis="x" />
                <RoundedBox
                  size={[0.26, 0.55, 0.3]}
                  position={[0, 0.3, 0]}
                />
                {/* J5: wrist roll */}
                <group
                  position={[0, 0.58, 0]}
                  rotation={[0, pose.wristRoll, 0]}
                >
                  <JointDisk radius={0.18} thickness={0.28} axis="y" />
                  {/* gripper body */}
                  <RoundedBox
                    size={[0.32, 0.22, 0.26]}
                    position={[0, 0.22, 0]}
                    material={MAT_GRIP}
                  />
                  {/* fingers */}
                  <group position={[0, 0.34, 0]}>
                    <mesh
                      position={[-(0.05 + pose.gripper * 0.08), 0.1, 0]}
                      material={MAT_GRIP}
                    >
                      <boxGeometry args={[0.05, 0.28, 0.18]} />
                    </mesh>
                    <mesh
                      position={[0.05 + pose.gripper * 0.08, 0.1, 0]}
                      material={MAT_GRIP}
                    >
                      <boxGeometry args={[0.05, 0.28, 0.18]} />
                    </mesh>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
