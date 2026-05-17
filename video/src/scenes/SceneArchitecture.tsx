import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { DotAlongArrow } from "../components/DotAlongArrow";
import { palette, type } from "../theme";

// A blueprint-style stack diagram. Five horizontal layers, each with a
// label, a one-line description, and a couple of "tags". A vertical column
// on the right traces the lifecycle of a single tool call through the
// stack — dot rides downward from console to arm and back up with the
// observation.
export const SceneArchitecture: React.FC = () => {
  const frame = useCurrentFrame();

  const layers: Array<{ name: string; sub: string; tags: string[] }> = [
    {
      name: "human",
      sub: "presses a button, or reads a transcript",
      tags: ["operator", "review"],
    },
    {
      name: "electron console",
      sub: "cameras · arms · agent chat · calibration",
      tags: ["renderer", "ipc"],
    },
    {
      name: "node backend",
      sub: "experiments, artifacts, sessions, sqlite",
      tags: ["typescript", "stdio mcp", "sqlite"],
    },
    {
      name: "python bridge",
      sub: "lerobot · placo IK · opencv",
      tags: ["lerobot", "placo", "cv2"],
    },
    {
      name: "hardware",
      sub: "two SO-101 arms · one camera · usbmodem",
      tags: ["feetech", "1 Mbaud", "ttyUSB"],
    },
  ];

  const lhsX = 160;
  const layerW = 1080;
  const startY = 200;
  const rowH = 130;

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: lhsX,
          top: 96,
          fontFamily: type.mono,
          fontSize: 14,
          letterSpacing: 4,
          color: palette.inkMute,
          textTransform: "uppercase",
        }}
      >
        § v — architecture
      </div>
      <div
        style={{
          position: "absolute",
          left: lhsX,
          top: 124,
          fontFamily: type.serif,
          fontSize: 56,
          color: palette.ink,
        }}
      >
        A stack small enough to read in an afternoon.
      </div>

      {layers.map((l, i) => {
        const appear = interpolate(
          frame,
          [30 + i * 14, 50 + i * 14],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const y = startY + i * rowH;
        return (
          <div
            key={l.name}
            style={{
              position: "absolute",
              left: lhsX,
              top: y,
              width: layerW,
              height: rowH - 18,
              opacity: appear,
              transform: `translateX(${interpolate(appear, [0, 1], [-16, 0])}px)`,
              border: `1px solid ${palette.rule}`,
              borderLeft: `4px solid ${palette.accent}`,
              background: "#FBFAF6",
              display: "flex",
              alignItems: "center",
              padding: "0 28px",
              gap: 36,
            }}
          >
            <div style={{ width: 220 }}>
              <div
                style={{
                  fontFamily: type.serif,
                  fontSize: 32,
                  color: palette.ink,
                  lineHeight: 1,
                }}
              >
                {l.name}
              </div>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: 11,
                  color: palette.inkMute,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginTop: 6,
                }}
              >
                layer {String(i + 1).padStart(2, "0")}
              </div>
            </div>
            <div
              style={{
                fontFamily: type.serif,
                fontStyle: "italic",
                fontSize: 22,
                color: palette.inkSoft,
                flex: 1,
              }}
            >
              {l.sub}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 240 }}>
              {l.tags.map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: type.mono,
                    fontSize: 11,
                    border: `1px solid ${palette.rule}`,
                    padding: "2px 8px",
                    borderRadius: 999,
                    color: palette.inkSoft,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {/* lifecycle column (RHS) */}
      <div
        style={{
          position: "absolute",
          left: 1300,
          top: 200,
          width: 460,
          height: 660,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 11,
            letterSpacing: 3,
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          one tool call · the journey
        </div>
        <div
          style={{
            position: "relative",
            height: 590,
            border: `1px dashed ${palette.rule}`,
            padding: 18,
          }}
        >
          {[
            "set_arm_pose({…})",
            "validate · clamp · sign",
            "stdio → python_bridge",
            "lerobot.write_servos",
            "feetech bus → joints move",
            "observe() → camera frame",
            "→ artifact · sqlite",
            "→ chat panel renders",
          ].map((line, i) => (
            <div
              key={line}
              style={{
                position: "absolute",
                left: 18,
                top: 18 + i * 68,
                opacity: interpolate(
                  frame,
                  [120 + i * 14, 140 + i * 14],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                ),
                fontFamily: type.mono,
                fontSize: 14,
                color: palette.ink,
                background: "#FBFAF6",
                padding: "8px 12px",
                border: `1px solid ${palette.rule}`,
                width: 380,
              }}
            >
              {line}
            </div>
          ))}
          <DotAlongArrow
            from={{ x: 14, y: 36 }}
            to={{ x: 14, y: 540 }}
            start={300}
            drawDuration={40}
            dotDuration={140}
            curvature={0.04}
            dotColor={palette.accent}
            stroke={palette.inkSoft}
          />
        </div>
      </div>

      <Caption marker="V.  architecture" line="An Electron console for the human. A Node backend that remembered everything." />
    </Paper>
  );
};
