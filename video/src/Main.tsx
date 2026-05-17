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
import { SceneQuestion } from "./scenes/SceneQuestion";
import { SceneTarget } from "./scenes/SceneTarget";
import { SceneApproach } from "./scenes/SceneApproach";
import { SceneArchitecture } from "./scenes/SceneArchitecture";
import { SceneConsole } from "./scenes/SceneConsole";
import { SceneCalibration } from "./scenes/SceneCalibration";
import { SceneDebugging } from "./scenes/SceneDebugging";
import { SceneWhatWeGot } from "./scenes/SceneWhatWeGot";
import { SceneNextTime } from "./scenes/SceneNextTime";
import { SceneEnd } from "./scenes/SceneEnd";
import { palette, type } from "./theme";

const SCENE_COMPONENTS: Record<string, React.FC> = {
  title: SceneTitle,
  question: SceneQuestion,
  target: SceneTarget,
  approach: SceneApproach,
  architecture: SceneArchitecture,
  console: SceneConsole,
  calibration: SceneCalibration,
  debugging: SceneDebugging,
  whatWeGot: SceneWhatWeGot,
  nextTime: SceneNextTime,
  end: SceneEnd,
};

// Cross-fade between adjacent scenes by overlaying a paper-colored veil at
// each scene boundary. Each scene also gets a tiny page-number watermark
// in the top-right corner, just to keep the "field report" framing
// consistent.
export const Main: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill>
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
            <PageMark
              page={idx + 1}
              total={SCENES.length}
              sceneLength={sc.durationFrames}
            />
            <CrossFadeVeil sceneLength={sc.durationFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CrossFadeVeil: React.FC<{ sceneLength: number }> = ({ sceneLength }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [sceneLength - 10, sceneLength],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const o = Math.max(fadeIn, fadeOut);
  if (o <= 0.001) return null;
  return (
    <AbsoluteFill
      style={{
        background: palette.paper,
        opacity: o,
        pointerEvents: "none",
      }}
    />
  );
};

const PageMark: React.FC<{ page: number; total: number; sceneLength: number }> = ({
  page,
  total,
  sceneLength,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [6, 24, sceneLength - 12, sceneLength], [0, 0.7, 0.7, 0]);
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
        color: palette.inkMute,
        opacity: o,
        pointerEvents: "none",
      }}
    >
      page {String(page).padStart(2, "0")} / {String(total).padStart(2, "0")}
    </div>
  );
};
