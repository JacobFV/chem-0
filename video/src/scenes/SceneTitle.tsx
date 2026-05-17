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

export const SceneTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inT = spring({ frame, fps, config: { damping: 200 } });
  const sub = spring({ frame: frame - 24, fps, config: { damping: 200 } });
  const ruleW = interpolate(inT, [0, 1], [0, 420]);
  const out = interpolate(
    frame,
    [durationInFrames - 24, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Cover image sits behind the title at low opacity, gently scaled and
  // desaturated so it reads as a watermark — not a photo backdrop.
  const coverScale = interpolate(frame, [0, durationInFrames], [1.05, 1.12]);
  const coverO = interpolate(
    frame,
    [0, 30, durationInFrames - 24, durationInFrames],
    [0, 0.32, 0.32, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
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
          opacity: coverO,
          transform: `scale(${coverScale})`,
          filter: "saturate(0.6) contrast(0.95) brightness(1.05)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(244,241,234,0.35) 0%, rgba(244,241,234,0.92) 75%)",
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
          opacity: out,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 14,
            letterSpacing: 6,
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 24,
            opacity: inT,
          }}
        >
          a chem-0 field report
        </div>
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 132,
            color: palette.ink,
            letterSpacing: -2,
            lineHeight: 1,
            transform: `translateY(${interpolate(inT, [0, 1], [16, 0])}px)`,
            opacity: inT,
          }}
        >
          The Shape of a Test
        </div>
        <div
          style={{
            height: 1,
            width: ruleW,
            background: palette.ink,
            marginTop: 32,
            marginBottom: 28,
          }}
        />
        <div
          style={{
            fontFamily: type.serif,
            fontStyle: "italic",
            fontSize: 30,
            color: palette.inkSoft,
            opacity: sub,
            transform: `translateY(${interpolate(sub, [0, 1], [8, 0])}px)`,
          }}
        >
          notes from a small lab, in May
        </div>
        {/* page number */}
        <div
          style={{
            position: "absolute",
            bottom: 56,
            fontFamily: type.mono,
            fontSize: 12,
            color: palette.inkMute,
            letterSpacing: 3,
          }}
        >
          I
        </div>
      </div>
    </Paper>
  );
};
