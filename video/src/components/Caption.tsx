import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { palette, type } from "../theme";

// Lower-third caption that mirrors the spoken narration line, plus a tiny
// scene marker. Used so the user can review timing while reading the script.
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
        left: align === "center" ? "50%" : 96,
        right: align === "center" ? undefined : 96,
        bottom: 72,
        transform: align === "center" ? `translate(-50%, ${-y}px)` : `translateY(${-y}px)`,
        opacity: t,
        color: palette.ink,
        textAlign: align,
        maxWidth: 1280,
        pointerEvents: "none",
      }}
    >
      {marker ? (
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 16,
            letterSpacing: 2,
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {marker}
        </div>
      ) : null}
      {line ? (
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 36,
            lineHeight: 1.25,
            fontWeight: 400,
            fontStyle: "italic",
            color: palette.inkSoft,
          }}
        >
          “{line}”
        </div>
      ) : null}
    </div>
  );
};
