import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { PerspectiveCamera } from "@react-three/drei";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Arm, Pose } from "./Arm";

// Lit, on-paper stage for the arm. Soft hemi+key+rim. The "table" is a wide
// flat plane tinted to match the page so the arm appears to rest on the page
// itself rather than floating in space.
export const ArmStage: React.FC<{
  width: number;
  height: number;
  pose: Pose | ((t: number) => Pose);
  poseB?: Pose | ((t: number) => Pose);
  cameraOrbit?: boolean;
}> = ({ width, height, pose, poseB, cameraOrbit = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  const resolved =
    typeof pose === "function" ? pose(t) : pose;
  const resolvedB =
    poseB && typeof poseB === "function" ? poseB(t) : (poseB as Pose | undefined);

  const orbit = cameraOrbit
    ? Math.sin((frame / durationInFrames) * Math.PI * 0.7) * 0.6
    : 0;

  return (
    <ThreeCanvas width={width} height={height}>
      <color attach="background" args={["#F4F1EA"]} />
      <fog attach="fog" args={["#F4F1EA", 8, 20]} />
      <hemisphereLight args={["#FFFFFF", "#D8CFB8", 0.7]} />
      <directionalLight
        position={[5, 7, 3]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 3, -3]} intensity={0.3} color="#FFD9B0" />

      <OrbitCamera orbit={orbit} />

      {/* table */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#ECE7DC" roughness={1} />
      </mesh>

      {/* ground rule */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[2.4, 2.42, 96]} />
        <meshBasicMaterial color="#C8BFAB" />
      </mesh>

      <group position={[resolvedB ? -1.6 : 0, 0, 0]}>
        <Arm pose={resolved} />
      </group>
      {resolvedB ? (
        <group position={[1.6, 0, 0]}>
          <Arm pose={resolvedB} />
        </group>
      ) : null}
    </ThreeCanvas>
  );
};

const OrbitCamera: React.FC<{ orbit: number }> = ({ orbit }) => {
  const x = Math.sin(orbit) * 6.5;
  const z = Math.cos(orbit) * 6.5;
  return (
    <PerspectiveCamera
      makeDefault
      position={[x, 3.4, z]}
      fov={32}
      near={0.1}
      far={100}
      // drei's PerspectiveCamera doesn't expose a lookAt prop, but the
      // camera always looks at the origin by default when makeDefault is
      // set and no controls are present — we offset position by Y=3.4 so
      // the framing centers on the mid-arm.
    />
  );
};
