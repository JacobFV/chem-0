import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { palette, type } from "../theme";

// Outro: wordmark, repo URL, thanks. Slow rule draw and fade.
export const SceneEnd: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });
  const w = interpolate(t, [0, 1], [0, 640]);
  const fade = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: fade,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 14,
            letterSpacing: 6,
            color: palette.accent,
            textTransform: "uppercase",
            marginBottom: 22,
          }}
        >
          thanks for watching
        </div>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 140,
            color: palette.text1,
            lineHeight: 1,
            fontWeight: 600,
            opacity: t,
            transform: `translateY(${interpolate(t, [0, 1], [10, 0])}px)`,
            letterSpacing: -2,
          }}
        >
          chem-0
        </div>
        <div
          style={{
            height: 1,
            width: w,
            background: palette.accent,
            margin: "30px 0 26px 0",
            opacity: 0.6,
          }}
        />
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 26,
            color: palette.text1,
            opacity: spring({ frame: frame - 18, fps, config: { damping: 220 } }),
          }}
        >
          github.com/JacobFV/chem-0
        </div>
        <div
          style={{
            marginTop: 56,
            fontFamily: type.sans,
            fontSize: 18,
            color: palette.text3,
            opacity: spring({ frame: frame - 50, fps, config: { damping: 220 } }),
          }}
        >
          pull requests welcome.
        </div>
      </div>
    </Paper>
  );
};
