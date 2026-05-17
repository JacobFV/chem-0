import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { ElectronFrame } from "../components/ElectronFrame";
import { CalibrationStage } from "../three/CalibrationStage";
import { palette, type } from "../theme";

// Calibration scene v2: split-pane. Left is the real wizard window
// (iframe of static_calibration.html with the bottom step overlay).
// Right is a Three.js stage showing the ghost setpoint + the live arm
// being moved into it — exactly what the wizard renders when the
// operator captures an endpoint.
export const SceneCalibration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 220 } });

  // Pose for "Z2 endpoint" — arm lifted and folded.
  const target = {
    pan: 0.0,
    lift: -0.9,
    elbow: -0.2,
    wristFlex: 0.1,
    wristRoll: 0.0,
    gripper: 0.0,
  };
  const startPose = {
    pan: 0.4,
    lift: 0.5,
    elbow: -0.8,
    wristFlex: -0.3,
    wristRoll: -0.4,
    gripper: 0.3,
  };

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 56,
          opacity: head,
          fontFamily: type.mono,
          fontSize: 13,
          letterSpacing: 4,
          color: palette.accent,
          textTransform: "uppercase",
        }}
      >
        v · calibration · ghost setpoint
      </div>

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: head }}>
        <div style={{ display: "flex", gap: 28, alignItems: "stretch" }}>
          {/* LHS: the real wizard window, scaled small */}
          <ElectronFrame
            src="electron/static_calibration.html"
            title="chem-0 · calibrate · mcp_so101"
            width={1020}
            height={640}
            innerW={1720}
            innerH={862}
          />

          {/* RHS: ghost + live arm in three.js */}
          <div
            style={{
              width: 720,
              height: 640,
              background: palette.bg1,
              border: `1px solid ${palette.border1}`,
              borderRadius: 4,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <CalibrationStage
              width={720}
              height={640}
              target={target}
              start={startPose}
            />
            <div
              style={{
                position: "absolute",
                left: 14,
                top: 12,
                fontFamily: type.mono,
                fontSize: 11,
                letterSpacing: 2,
                color: palette.text2,
                textTransform: "uppercase",
              }}
            >
              urdf viewer · ghost = setpoint · solid = live servo
            </div>
            <Legend />
            <Telemetry frame={frame} target={target} start={startPose} />
          </div>
        </div>
      </AbsoluteFill>

      <Caption
        marker="v · calibration"
        line="Move the real arm into the ghost. Capture. Repeat for all six endpoints."
      />
    </Paper>
  );
};

const Legend: React.FC = () => (
  <div
    style={{
      position: "absolute",
      right: 14,
      top: 12,
      fontFamily: type.mono,
      fontSize: 11,
      color: palette.text2,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      background: "rgba(5,5,5,0.7)",
      padding: "8px 10px",
      border: `1px solid ${palette.border1}`,
    }}
  >
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 10,
          background: palette.accent,
          opacity: 0.6,
        }}
      />
      <span>ghost — setpoint</span>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ width: 10, height: 10, borderRadius: 10, background: "#F3EFE6" }} />
      <span>live — servo readings</span>
    </div>
  </div>
);

const Telemetry: React.FC<{
  frame: number;
  target: { pan: number; lift: number; elbow: number; wristFlex: number; wristRoll: number; gripper: number };
  start: { pan: number; lift: number; elbow: number; wristFlex: number; wristRoll: number; gripper: number };
}> = ({ frame, target, start }) => {
  // Match the ease used in CalibrationStage so the printed values track.
  const linear = Math.min(1, Math.max(0, frame / 530));
  const t = 0.5 - 0.5 * Math.cos(Math.PI * linear);
  const cur = {
    pan: start.pan + (target.pan - start.pan) * t,
    lift: start.lift + (target.lift - start.lift) * t,
    elbow: start.elbow + (target.elbow - start.elbow) * t,
    wristFlex: start.wristFlex + (target.wristFlex - start.wristFlex) * t,
    wristRoll: start.wristRoll + (target.wristRoll - start.wristRoll) * t,
    gripper: start.gripper + (target.gripper - start.gripper) * t,
  };
  const err = (a: number, b: number) => Math.abs(a - b);
  const rows: Array<[string, number, number]> = [
    ["pan", cur.pan, target.pan],
    ["lift", cur.lift, target.lift],
    ["elbow", cur.elbow, target.elbow],
    ["wrist_flex", cur.wristFlex, target.wristFlex],
    ["wrist_roll", cur.wristRoll, target.wristRoll],
    ["gripper", cur.gripper, target.gripper],
  ];
  const totalErr = rows.reduce((s, r) => s + err(r[1], r[2]), 0);
  const aligned = totalErr < 0.1;
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        bottom: 14,
        right: 14,
        background: "rgba(5,5,5,0.78)",
        border: `1px solid ${palette.border1}`,
        padding: 12,
        fontFamily: type.mono,
        fontSize: 12,
        color: palette.text2,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: palette.text3, letterSpacing: 2, textTransform: "uppercase", fontSize: 10 }}>
          alignment
        </span>
        <span style={{ color: aligned ? palette.ok : palette.accent }}>
          {aligned ? "✓ within tolerance · capture endpoint" : `err Σ = ${totalErr.toFixed(2)} rad`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {rows.map(([n, c, tg]) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            <span style={{ color: palette.text3 }}>{n}</span>
            <span>
              {c.toFixed(2)} → <span style={{ color: palette.accent }}>{tg.toFixed(2)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
