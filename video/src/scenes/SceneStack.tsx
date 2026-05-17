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

// Architecture-as-stack. Five horizontal rows with technology tags. Each
// row reveals on schedule. A subtle vertical "data flow" arrow runs on
// the right edge — visual rhyme with the renderer's left-rail nav.
export const SceneStack: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });

  const rows: Array<{ tier: string; sub: string; tags: string[]; tone?: "accent" }> = [
    {
      tier: "Electron renderer",
      sub: "console · workbench · calibration · virtual-world editor",
      tags: ["TypeScript", "Three.js", "preload bridge"],
    },
    {
      tier: "Node backend (main process)",
      sub: "agent loop · tool registry · experiment & artifact tracking",
      tags: ["@chem0/backend", "OpenAI Responses API", "gpt-5.5"],
      tone: "accent",
    },
    {
      tier: "persistence",
      sub: "data/chem0.sqlite + blob store · every event logged",
      tags: ["SQLite", "BLOB store"],
    },
    {
      tier: "Python bridge",
      sub: "hardware control · inverse kinematics · vision",
      tags: ["LeRobot", "placo", "OpenCV", "feetech-bus"],
      tone: "accent",
    },
    {
      tier: "external MCP (side door)",
      sub: "same tools exposed over stdio JSON-RPC for Codex etc.",
      tags: ["mcp-node", "MCP 2024-11-05"],
    },
    {
      tier: "hardware",
      sub: "2 × SO-101 arms (~$300 each) · USB-serial · 1 Mbaud · camera 0",
      tags: ["Feetech STS3215", "/dev/cu.usbmodem*"],
    },
  ];

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 92,
          opacity: head,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 13,
            letterSpacing: 4,
            color: palette.accent,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          iii · the stack
        </div>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 54,
            color: palette.text1,
            lineHeight: 1.05,
            fontWeight: 600,
          }}
        >
          One repo. One process tree. One afternoon to read.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 120,
          top: 260,
          right: 120,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {rows.map((r, i) => {
          const appear = interpolate(
            frame,
            [30 + i * 14, 50 + i * 14],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <div
              key={r.tier}
              style={{
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [-16, 0])}px)`,
                display: "flex",
                alignItems: "center",
                gap: 28,
                padding: "20px 24px",
                background: palette.bg1,
                border: `1px solid ${palette.border1}`,
                borderLeft: `3px solid ${r.tone === "accent" ? palette.accent : palette.border2}`,
              }}
            >
              <div style={{ width: 60, fontFamily: type.mono, fontSize: 14, color: palette.text3 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ width: 360 }}>
                <div style={{ fontFamily: type.sans, fontSize: 24, color: palette.text1, fontWeight: 500 }}>
                  {r.tier}
                </div>
              </div>
              <div style={{ flex: 1, fontFamily: type.sans, fontSize: 18, color: palette.text2 }}>
                {r.sub}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 360, justifyContent: "flex-end" }}>
                {r.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontFamily: type.mono,
                      fontSize: 12,
                      border: `1px solid ${palette.border2}`,
                      padding: "3px 9px",
                      borderRadius: 2,
                      color: palette.text2,
                      background: palette.bg2,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Caption
        marker="iii · stack"
        line="Electron · Node MCP · SQLite · Python bridge → LeRobot / placo / OpenCV · Feetech"
      />
    </Paper>
  );
};
