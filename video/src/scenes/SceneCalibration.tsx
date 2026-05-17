import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { MockWindow } from "../components/MockWindow";
import { MockCursor } from "../components/MockCursor";
import { ArmStage } from "../three/Stage";
import { palette, type } from "../theme";

// The calibration wizard. A mock window with a guided sequence: Z1, X1, X2,
// X3, Z2, hand. Each endpoint highlights on schedule; cursor presses "next";
// the live 3D arm moves to the captured pose. The right column shows the
// raw register values being written.
export const SceneCalibration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });
  const steps = ["Z1", "X1", "X2", "X3", "Z2", "Hand"];

  const stepFor = (f: number) => {
    // 36f intro, then 30f per step
    const idx = Math.min(steps.length - 1, Math.max(0, Math.floor((f - 36) / 30)));
    return idx;
  };
  const idx = stepFor(frame);

  return (
    <Paper tint={palette.accent + "11"}>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 100,
          opacity: t,
          fontFamily: type.mono,
          fontSize: 14,
          letterSpacing: 4,
          color: palette.inkMute,
          textTransform: "uppercase",
        }}
      >
        § vii — calibration · the first humility
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: t,
        }}
      >
        <div style={{ position: "relative" }}>
          <MockWindow
            width={1620}
            height={820}
            title="chem-0 · calibration wizard · mcp_so101"
            toolbar={
              <>
                <span style={{ color: palette.inkSoft }}>step</span>
                <span style={{ fontFamily: type.mono, color: palette.ink }}>
                  {String(idx + 1).padStart(2, "0")} / 06
                </span>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    fontFamily: type.mono,
                    color: palette.warn,
                    fontSize: 11,
                  }}
                >
                  bus  /dev/cu.usbmodem5AB01815731  ·  1 Mbaud
                </span>
              </>
            }
          >
            <div style={{ display: "flex", height: "100%" }}>
              {/* stepper LHS */}
              <div
                style={{
                  width: 240,
                  borderRight: `1px solid ${palette.rule}`,
                  padding: 18,
                  background: "#F7F3E8",
                }}
              >
                <div
                  style={{
                    fontFamily: type.mono,
                    fontSize: 10,
                    letterSpacing: 3,
                    color: palette.inkMute,
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  endpoints
                </div>
                {steps.map((s, i) => {
                  const done = i < idx;
                  const active = i === idx;
                  return (
                    <div
                      key={s}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 4px",
                        borderBottom: `1px dashed ${palette.rule}`,
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 18,
                          border: `1.5px solid ${active ? palette.accent : palette.rule}`,
                          background: done ? palette.ok : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#FFF",
                          fontFamily: type.mono,
                          fontSize: 10,
                        }}
                      >
                        {done ? "✓" : ""}
                      </div>
                      <div
                        style={{
                          fontFamily: type.serif,
                          fontSize: 22,
                          color: active ? palette.ink : palette.inkSoft,
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {s}
                      </div>
                      <div style={{ flex: 1 }} />
                      <div
                        style={{
                          fontFamily: type.mono,
                          fontSize: 11,
                          color: palette.inkMute,
                        }}
                      >
                        {done ? "captured" : active ? "now" : "pending"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* live arm preview */}
              <div style={{ flex: 1, position: "relative" }}>
                <ArmStage
                  width={1100}
                  height={736}
                  pose={(tt) => poseForStep(tt, idx)}
                />
                {/* guide pose overlay text */}
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    top: 22,
                    color: palette.inkSoft,
                    fontFamily: type.serif,
                    fontStyle: "italic",
                    fontSize: 28,
                    maxWidth: 480,
                    lineHeight: 1.3,
                  }}
                >
                  {guideFor(idx)}
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 24,
                    bottom: 22,
                    border: `1px solid ${palette.rule}`,
                    background: "rgba(251,250,246,0.9)",
                    padding: 14,
                    fontFamily: type.mono,
                    fontSize: 12,
                    color: palette.inkSoft,
                    minWidth: 320,
                  }}
                >
                  <div style={{ color: palette.ink, marginBottom: 8 }}>
                    raw  ·  servo registers
                  </div>
                  {registersFor(idx).map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "1px 0",
                      }}
                    >
                      <span>id {r.id} · {r.name}</span>
                      <span style={{ color: palette.ink }}>{r.v}</span>
                    </div>
                  ))}
                </div>
                {/* next button */}
                <div
                  style={{
                    position: "absolute",
                    right: 24,
                    top: 22,
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <button
                    style={{
                      padding: "8px 14px",
                      background: "#FBFAF6",
                      border: `1px solid ${palette.rule}`,
                      borderRadius: 4,
                      fontFamily: type.sans,
                      fontSize: 13,
                      color: palette.inkSoft,
                    }}
                  >
                    back
                  </button>
                  <button
                    style={{
                      padding: "8px 16px",
                      background: palette.accent,
                      border: `1px solid ${palette.accent}`,
                      borderRadius: 4,
                      fontFamily: type.sans,
                      fontSize: 13,
                      color: "#FBFAF6",
                      fontWeight: 600,
                    }}
                  >
                    capture endpoint →
                  </button>
                </div>
              </div>
            </div>
          </MockWindow>

          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 1620,
              height: 820,
              pointerEvents: "none",
            }}
          >
            <MockCursor
              path={[
                { frame: 0, x: 1000, y: 760 },
                { frame: 36, x: 1500, y: 60, click: true },
                { frame: 96, x: 1500, y: 60, click: true },
                { frame: 156, x: 1500, y: 60, click: true },
                { frame: 216, x: 1500, y: 60, click: true },
                { frame: 276, x: 1500, y: 60, click: true },
                { frame: 336, x: 1500, y: 60, click: true },
                { frame: 1200, x: 1500, y: 60 },
              ]}
            />
          </div>
        </div>
      </div>

      <Caption
        marker="VII.  calibration"
        line="Six endpoints — six small confessions of where the arm actually lives."
      />
    </Paper>
  );
};

const guideFor = (idx: number) => {
  const lines = [
    "Z1 — touch the home post, gripper closed, wrist square to the table.",
    "X1 — extend forward along the bench rail; let the wrist hang.",
    "X2 — sweep to the right marker; do not force the shoulder.",
    "X3 — return to the left marker; the elbow should clear the lamp.",
    "Z2 — lift to the highest reachable cup; gripper closed.",
    "Hand — open the gripper fully and confirm the finger gap is even.",
  ];
  return lines[idx] ?? lines[0];
};

const registersFor = (idx: number) => {
  const base = [
    { id: 1, name: "shoulder_pan", v: 2048 },
    { id: 2, name: "shoulder_lift", v: 2048 },
    { id: 3, name: "elbow_flex", v: 2048 },
    { id: 4, name: "wrist_flex", v: 2048 },
    { id: 5, name: "wrist_roll", v: 2048 },
    { id: 6, name: "gripper", v: 1500 },
  ];
  // mutate based on step
  const deltas: Record<number, Partial<Record<number, number>>> = {
    0: {},
    1: { 1: 1700, 2: 2200, 3: 2500 },
    2: { 1: 1300, 2: 2200, 3: 2500 },
    3: { 1: 2400, 2: 2200, 3: 2500 },
    4: { 2: 2900, 3: 2900 },
    5: { 6: 2600 },
  };
  const d = deltas[idx] ?? {};
  return base.map((r) => ({ ...r, v: d[r.id] ?? r.v }));
};

const poseForStep = (
  tt: number,
  idx: number,
): {
  pan: number;
  lift: number;
  elbow: number;
  wristFlex: number;
  wristRoll: number;
  gripper: number;
} => {
  // Targets per step (approximate — meant to look distinct and recognizable)
  const targets = [
    { pan: 0.0, lift: -0.1, elbow: -0.4, wristFlex: 0.0, wristRoll: 0.0, gripper: 0.0 },
    { pan: -0.2, lift: 0.5, elbow: -0.9, wristFlex: -0.3, wristRoll: 0.0, gripper: 0.0 },
    { pan: -0.7, lift: 0.3, elbow: -0.7, wristFlex: -0.1, wristRoll: 0.4, gripper: 0.0 },
    { pan: 0.7, lift: 0.3, elbow: -0.7, wristFlex: -0.1, wristRoll: -0.4, gripper: 0.0 },
    { pan: 0.0, lift: -0.9, elbow: -0.2, wristFlex: 0.1, wristRoll: 0.0, gripper: 0.0 },
    { pan: 0.0, lift: -0.4, elbow: -0.5, wristFlex: 0.0, wristRoll: 0.0, gripper: 1.0 },
  ];
  const target = targets[idx] ?? targets[0];
  // gentle hover within the target
  const bob = Math.sin(tt * 2.0) * 0.02;
  return {
    pan: target.pan + bob,
    lift: target.lift + bob,
    elbow: target.elbow,
    wristFlex: target.wristFlex,
    wristRoll: target.wristRoll + Math.sin(tt * 1.1) * 0.05,
    gripper: target.gripper,
  };
};
