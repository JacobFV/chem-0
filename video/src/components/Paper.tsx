import React from "react";
import { AbsoluteFill } from "remotion";
import { palette } from "../theme";

// Dark stage that matches the real app's --bg-0/--bg-1. A faint vignette
// keeps the edges from looking flat. Optional accent tint at very low
// opacity lets a scene "warm" without breaking the dark theme.
export const Paper: React.FC<{ children?: React.ReactNode; tint?: string }> = ({
  children,
  tint,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${palette.bg2} 0%, ${palette.bg1} 60%, ${palette.bg0} 100%)`,
        color: palette.text1,
      }}
    >
      {tint ? (
        <AbsoluteFill
          style={{ background: tint, mixBlendMode: "screen", opacity: 0.08 }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 80% at 50% 120%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
