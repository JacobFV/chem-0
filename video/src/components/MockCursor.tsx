import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { palette } from "../theme";

export type CursorWaypoint = {
  // frame relative to scene start
  frame: number;
  // position in pixels relative to the parent element
  x: number;
  y: number;
  click?: boolean;
};

// Smoothly tweens a cursor across a list of waypoints with optional click
// ripples. The cursor itself is an inline SVG arrow so it scales cleanly and
// reads against the cream background.
export const MockCursor: React.FC<{ path: CursorWaypoint[] }> = ({ path }) => {
  const frame = useCurrentFrame();
  if (path.length === 0) return null;
  // find current segment
  let i = 0;
  for (let k = 0; k < path.length - 1; k++) {
    if (frame >= path[k].frame && frame <= path[k + 1].frame) {
      i = k;
      break;
    }
    if (frame > path[path.length - 1].frame) i = path.length - 1;
  }
  const a = path[i];
  const b = path[Math.min(i + 1, path.length - 1)] ?? a;
  const t =
    a === b
      ? 1
      : interpolate(frame, [a.frame, b.frame], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const ease = easeInOut(t);
  const x = a.x + (b.x - a.x) * ease;
  const y = a.y + (b.y - a.y) * ease;

  // click ripples: any waypoint with click:true emits a ripple at its frame
  const ripples = path
    .filter((p) => p.click)
    .map((p, idx) => {
      const dt = frame - p.frame;
      if (dt < 0 || dt > 28) return null;
      const r = interpolate(dt, [0, 28], [0, 48]);
      const o = interpolate(dt, [0, 28], [0.45, 0]);
      return (
        <div
          key={idx}
          style={{
            position: "absolute",
            left: p.x - r,
            top: p.y - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r * 2,
            border: `2px solid ${palette.accent}`,
            opacity: o,
            pointerEvents: "none",
          }}
        />
      );
    });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {ripples}
      <svg
        width={28}
        height={28}
        viewBox="0 0 28 28"
        style={{
          position: "absolute",
          left: x - 2,
          top: y - 2,
          filter: "drop-shadow(0 2px 3px rgba(40,30,20,0.35))",
        }}
      >
        <path
          d="M3 2 L3 22 L9 17 L12 24 L15 23 L12 16 L21 16 Z"
          fill={palette.ink}
          stroke="#FBFAF6"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
