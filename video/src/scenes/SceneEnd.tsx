import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { palette, type } from "../theme";

// Final card: a single line, a long rule, a small colophon. The rule draws
// in slowly from center outward as the credits fade.
export const SceneEnd: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });
  const w = interpolate(t, [0, 1], [0, 540]);
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
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          end of field report
        </div>
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 96,
            color: palette.ink,
            lineHeight: 1,
            opacity: t,
            transform: `translateY(${interpolate(t, [0, 1], [8, 0])}px)`,
          }}
        >
          chem-0
        </div>
        <div
          style={{
            height: 1,
            width: w,
            background: palette.ink,
            margin: "26px 0 22px 0",
          }}
        />
        <div
          style={{
            fontFamily: type.serif,
            fontStyle: "italic",
            fontSize: 26,
            color: palette.inkSoft,
            opacity: spring({ frame: frame - 18, fps, config: { damping: 220 } }),
          }}
        >
          a small lab, a smaller agent. thanks for watching.
        </div>
        <div
          style={{
            marginTop: 80,
            fontFamily: type.mono,
            fontSize: 11,
            letterSpacing: 3,
            color: palette.inkMute,
            opacity: spring({ frame: frame - 60, fps, config: { damping: 220 } }),
          }}
        >
          colophon — set in cormorant garamond &amp; jet brains mono ·
          rendered with remotion · arms procedural, not photographed
        </div>
      </div>
    </Paper>
  );
};
