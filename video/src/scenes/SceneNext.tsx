import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { palette, type } from "../theme";

// Two side-by-side columns: what works · what's next. Each entry pops in
// sequentially with a small status pill (ok / wip).
export const SceneNext: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });

  const left: string[] = [
    "Electron console (experiments, worlds, arms, artifacts)",
    "22 MCP tools wired to GPT-5.5 over stdio",
    "Deterministic calibration wizard (CLI + GUI)",
    "Virtual-world editor — same API as physical",
    "placo IK + URDF for cartesian moves",
    "Camera capture · record / replay datasets",
    "SQLite persistence + blob artifacts",
    "Audio I/O: speak_to_human, listen_to_human",
  ];
  const right: string[] = [
    "End-to-end real-hardware pH measurement",
    "Closed-loop policy: ACT / SmolVLA training",
    "Live collision avoidance in physical world",
    "Multi-arm coordination for transfer steps",
    "Per-experiment auto-tuned vision pipelines",
  ];

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 80,
          opacity: t,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 13,
            letterSpacing: 4,
            color: palette.accent,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          x · status &amp; roadmap
        </div>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 56,
            color: palette.text1,
            lineHeight: 1.05,
            fontWeight: 600,
          }}
        >
          What ships today. What's next.
        </div>
      </div>

      <Column
        title="✓ ships today"
        items={left}
        x={100}
        delay={20}
        tone="ok"
      />
      <Column
        title="→ next milestone"
        items={right}
        x={1000}
        delay={140}
        tone="accent"
      />

      <Caption
        marker="x · roadmap"
        line="Sim is closed. Hardware loop is open. That's the next milestone."
      />
    </Paper>
  );
};

const Column: React.FC<{
  title: string;
  items: string[];
  x: number;
  delay: number;
  tone: "ok" | "accent";
}> = ({ title, items, x, delay, tone }) => {
  const frame = useCurrentFrame();
  const dotColor = tone === "ok" ? palette.ok : palette.accent;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 270,
        width: 820,
        background: palette.bg1,
        border: `1px solid ${palette.border1}`,
        borderTop: `2px solid ${dotColor}`,
        padding: "24px 26px",
      }}
    >
      <div
        style={{
          fontFamily: type.mono,
          fontSize: 12,
          letterSpacing: 3,
          color: dotColor,
          textTransform: "uppercase",
          marginBottom: 22,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((line, i) => {
          const o = interpolate(
            frame,
            [delay + i * 10, delay + i * 10 + 16],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <li
              key={line}
              style={{
                fontFamily: type.sans,
                fontSize: 21,
                color: palette.text1,
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                opacity: o,
                transform: `translateX(${interpolate(o, [0, 1], [-8, 0])}px)`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: dotColor,
                  marginTop: 11,
                  flexShrink: 0,
                }}
              />
              <span>{line}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
