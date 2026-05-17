import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, type } from "../theme";

// A flat, square-cornered notecard with a tick label across the top edge —
// reads like a journal entry, not a UI card. Built for composability inside
// architecture/flow scenes.
export const Card: React.FC<{
  label?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  delay?: number;
  accent?: string;
  children?: React.ReactNode;
}> = ({ label, width, height, x, y, delay = 0, accent, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.9 },
  });
  const yo = interpolate(t, [0, 1], [16, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        opacity: t,
        transform: `translateY(${-yo}px)`,
        background: "#FBFAF6",
        border: `1px solid ${palette.border1}`,
        boxShadow:
          "0 2px 0 rgba(0,0,0,0.02), 0 18px 30px -22px rgba(40,30,15,0.35)",
        borderRadius: 2,
        padding: "20px 22px",
        color: palette.text1,
        fontFamily: type.sans,
      }}
    >
      {label ? (
        <div
          style={{
            position: "absolute",
            top: -10,
            left: 14,
            background: palette.bg1,
            padding: "0 8px",
            fontFamily: type.mono,
            fontSize: 11,
            letterSpacing: 2,
            color: accent ?? palette.text3,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
};
