import React from "react";
import { AbsoluteFill } from "remotion";
import { palette } from "../theme";

// A warm, faintly grained "paper" background used by every scene.
// The grain is an inline SVG turbulence with very low opacity — keeps the
// frame from feeling like flat printer paper without dragging in textures.
export const Paper: React.FC<{ children?: React.ReactNode; tint?: string }> = ({
  children,
  tint,
}) => {
  const grain = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'>
      <filter id='n'>
        <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/>
        <feColorMatrix values='0 0 0 0 0.12  0 0 0 0 0.10  0 0 0 0 0.08  0 0 0 0.10 0'/>
      </filter>
      <rect width='100%' height='100%' filter='url(#n)'/>
    </svg>`,
  );
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${palette.paper} 0%, ${palette.paperDeep} 70%, ${palette.paperEdge} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${grain}")`,
          backgroundSize: "320px 320px",
          mixBlendMode: "multiply",
          opacity: 0.55,
          pointerEvents: "none",
        }}
      />
      {tint ? (
        <AbsoluteFill
          style={{ background: tint, mixBlendMode: "multiply", opacity: 0.18 }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 80% at 50% 110%, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
