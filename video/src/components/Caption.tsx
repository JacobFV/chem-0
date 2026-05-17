import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { palette, type } from "../theme";

// A monospace marker + a single-line subtitle pinned to the bottom of the
// frame. Set in the dark palette so it lives on top of the embedded UI
// without competing for attention.
export const Caption: React.FC<{
  marker?: string;
  line?: string;
  align?: "left" | "center";
  delay?: number;
}> = ({ marker, line, align = "left", delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.6 },
  });
  const y = interpolate(t, [0, 1], [12, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: align === "center" ? "50%" : 80,
        right: align === "center" ? undefined : 80,
        bottom: 56,
        transform: align === "center" ? `translate(-50%, ${-y}px)` : `translateY(${-y}px)`,
        opacity: t,
        textAlign: align,
        maxWidth: 1480,
        pointerEvents: "none",
      }}
    >
      {marker ? (
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 13,
            letterSpacing: 3,
            color: palette.accent,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {marker}
        </div>
      ) : null}
      {line ? (
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 26,
            lineHeight: 1.3,
            fontWeight: 500,
            color: palette.text1,
          }}
        >
          {line}
        </div>
      ) : null}
    </div>
  );
};
