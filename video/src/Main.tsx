import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { SCENES } from "./scenes/scenes";
import { SceneTitle } from "./scenes/SceneTitle";
import { ScenePitch } from "./scenes/ScenePitch";
import { SceneConsole } from "./scenes/SceneConsole";
import { SceneAgent } from "./scenes/SceneAgent";
import { SceneCalibration } from "./scenes/SceneCalibration";
import { SceneVirtual } from "./scenes/SceneVirtual";
import { SceneVision } from "./scenes/SceneVision";
import { SceneBO } from "./scenes/SceneBO";
import { SceneStack } from "./scenes/SceneStack";
import { SceneNext } from "./scenes/SceneNext";
import { SceneEnd } from "./scenes/SceneEnd";
import { palette, type } from "./theme";

const SCENE_COMPONENTS: Record<string, React.FC> = {
  title: SceneTitle,
  pitch: ScenePitch,
  console: SceneConsole,
  agent: SceneAgent,
  calibration: SceneCalibration,
  virtual: SceneVirtual,
  vision: SceneVision,
  bo: SceneBO,
  architecture: SceneStack,
  status: SceneNext,
  close: SceneEnd,
};

// Cross-fade veil between scenes, page chip in the top-right.
export const Main: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: palette.bg0 }}>
      {SCENES.map((sc, idx) => {
        const start = offset;
        offset += sc.durationFrames;
        const Comp = SCENE_COMPONENTS[sc.id];
        return (
          <Sequence
            key={sc.id}
            from={start}
            durationInFrames={sc.durationFrames}
            name={sc.id}
          >
            <Comp />
            <Audio src={staticFile(`audio/${sc.audio}`)} />
            <Chip page={idx + 1} total={SCENES.length} sceneLength={sc.durationFrames} />
            <CrossFadeVeil sceneLength={sc.durationFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CrossFadeVeil: React.FC<{ sceneLength: number }> = ({ sceneLength }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 8], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [sceneLength - 8, sceneLength],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const o = Math.max(fadeIn, fadeOut);
  if (o <= 0.001) return null;
  return (
    <AbsoluteFill
      style={{ background: palette.bg0, opacity: o, pointerEvents: "none" }}
    />
  );
};

const Chip: React.FC<{ page: number; total: number; sceneLength: number }> = ({
  page,
  total,
  sceneLength,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [6, 24, sceneLength - 12, sceneLength], [0, 0.65, 0.65, 0]);
  return (
    <div
      style={{
        position: "absolute",
        right: 56,
        top: 56,
        fontFamily: type.mono,
        fontSize: 11,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: palette.text3,
        opacity: o,
        pointerEvents: "none",
      }}
    >
      {String(page).padStart(2, "0")} / {String(total).padStart(2, "0")}
    </div>
  );
};
