import React from "react";
import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { palette, type } from "../theme";

// chem-0 wordmark dropping in over a dimmed cover photo of the rig.
// All-caps mono brand tag above; sans subtitle below.
export const SceneTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 200 } });
  const sub = spring({ frame: frame - 14, fps, config: { damping: 200 } });
  const tagline = spring({ frame: frame - 28, fps, config: { damping: 200 } });
  const ruleW = interpolate(t, [0, 1], [0, 540]);
  const cover = interpolate(
    frame,
    [0, 30, durationInFrames - 24, durationInFrames],
    [0, 0.42, 0.42, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const coverScale = interpolate(frame, [0, durationInFrames], [1.04, 1.12]);
  return (
    <Paper>
      <Img
        src={staticFile("assets/generated/cover_still.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: cover,
          transform: `scale(${coverScale})`,
          filter: "saturate(0.85) brightness(0.7) contrast(1.05)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.92) 80%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 14,
            letterSpacing: 6,
            color: palette.accent,
            textTransform: "uppercase",
            marginBottom: 24,
            opacity: t,
          }}
        >
          field demo · v0.2
        </div>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 168,
            color: palette.text1,
            letterSpacing: -3,
            lineHeight: 1,
            fontWeight: 600,
            transform: `translateY(${interpolate(t, [0, 1], [16, 0])}px)`,
            opacity: t,
          }}
        >
          chem-0
        </div>
        <div
          style={{
            height: 1,
            width: ruleW,
            background: palette.accent,
            marginTop: 28,
            marginBottom: 24,
            opacity: 0.6,
          }}
        />
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 32,
            color: palette.text2,
            opacity: sub,
            transform: `translateY(${interpolate(sub, [0, 1], [8, 0])}px)`,
            fontWeight: 400,
          }}
        >
          local autonomous chemistry agent · for SO-101 arms
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 64,
            fontFamily: type.mono,
            fontSize: 12,
            letterSpacing: 3,
            color: palette.text3,
            opacity: tagline,
          }}
        >
          github.com/JacobFV/chem-0   ·   may 2026
        </div>
      </div>
    </Paper>
  );
};
