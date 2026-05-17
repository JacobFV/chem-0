import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { palette } from "../theme";

// Draws an arrow from A to B that fades in, then sends a colored dot riding
// along its path from tail to head. The arrowhead reveals on dot arrival.
// Used to animate flow between cards (e.g. prompt → agent → action).
export const DotAlongArrow: React.FC<{
  from: { x: number; y: number };
  to: { x: number; y: number };
  start?: number;
  drawDuration?: number;
  dotDuration?: number;
  dotColor?: string;
  curvature?: number; // 0 = straight; +/- bows the path
  stroke?: string;
  thickness?: number;
}> = ({
  from,
  to,
  start = 0,
  drawDuration = 18,
  dotDuration = 36,
  dotColor = palette.accent,
  curvature = 0,
  stroke = palette.inkSoft,
  thickness = 1.6,
}) => {
  const frame = useCurrentFrame();
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mx = (from.x + to.x) / 2 + -dy * curvature;
  const my = (from.y + to.y) / 2 + dx * curvature;
  const path = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
  const drawT = interpolate(frame, [start, start + drawDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // animate stroke-dashoffset by approximating the path length
  const length = quadLength(from, { x: mx, y: my }, to);
  const dotT = interpolate(
    frame,
    [start + drawDuration - 4, start + drawDuration - 4 + dotDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dotPos = quadAt(from, { x: mx, y: my }, to, dotT);
  const headOpacity = interpolate(dotT, [0.85, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={thickness}
        strokeDasharray={length}
        strokeDashoffset={length * (1 - drawT)}
        strokeLinecap="round"
      />
      {/* arrowhead */}
      <g
        transform={`translate(${to.x},${to.y}) rotate(${angleAt(from, { x: mx, y: my }, to, 1)})`}
        opacity={headOpacity}
      >
        <path
          d="M0 0 L-12 -5 L-8 0 L-12 5 Z"
          fill={stroke}
        />
      </g>
      {dotT > 0 && dotT < 1.001 ? (
        <circle
          cx={dotPos.x}
          cy={dotPos.y}
          r={6.5}
          fill={dotColor}
          opacity={0.95}
        >
          <animate attributeName="r" values="6.5;8;6.5" dur="0.9s" repeatCount="indefinite" />
        </circle>
      ) : null}
    </svg>
  );
};

const quadAt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};
const angleAt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) => {
  const u = 1 - t;
  const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};
const quadLength = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
) => {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 24; i++) {
    const pt = quadAt(p0, p1, p2, i / 24);
    len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return len;
};
