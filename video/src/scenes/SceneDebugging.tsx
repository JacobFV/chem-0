import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { palette, type } from "../theme";

// A terminal log of the real-feeling failures, interleaved with marginalia
// in italics. The log "scrolls" as new lines append; the marginalia fades
// in alongside the relevant log line. The visual is a notebook page with a
// fixed-width gutter on the left containing the terminal.
type LogKind = "ok" | "warn" | "err" | "info";
type Entry = { t: string; k: LogKind; line: string; gloss?: string };

const ENTRIES: Entry[] = [
  { t: "14:02:11", k: "info", line: "$ node src/apps/mcp-node/dist/server.js" },
  { t: "14:02:12", k: "ok", line: "mcp ready · stdio · sqlite=data/chem0.sqlite" },
  { t: "14:02:18", k: "info", line: "> probe_feetech(max_id=6)" },
  { t: "14:02:21", k: "err", line: "TimeoutError: /dev/cu.usbmodem5AB01815731  resource busy" , gloss: "another process held the port. it always was." },
  { t: "14:02:34", k: "warn", line: "probe_feetech retry · 1/3" },
  { t: "14:02:38", k: "ok", line: "found servos 1..6  ·  model=777  ·  baud=1000000" },
  { t: "14:02:52", k: "info", line: "> connect_so101(robot_id=mcp_so101)" },
  { t: "14:02:54", k: "err", line: "CalibrationMismatch: register limit on id=5 wrist_roll wraps past -180°", gloss: "the wrist could go past itself. for a while we didn't know." },
  { t: "14:03:11", k: "warn", line: "clamp register limits  ·  writing new calibration JSON" },
  { t: "14:03:18", k: "info", line: "> get_arm_pose()" },
  { t: "14:03:18", k: "ok", line: "pose ok · pan=-1.2°  lift=+0.4°  elbow=-69.7°" },
  { t: "14:03:32", k: "info", line: "> view_camera(id=0)" },
  { t: "14:03:34", k: "err", line: "OpenCVError: codec mismatch  ·  YUYV vs MJPG", gloss: "the camera spoke a slightly different dialect than its driver." },
  { t: "14:03:51", k: "warn", line: "fallback decoder · YUYV → BGR" },
  { t: "14:04:02", k: "info", line: "> set_position(x=0.18, y=0.02, z=0.20)" },
  { t: "14:04:05", k: "err", line: "PlacoError: URDF units suspicious — expected meters, got millimeters", gloss: "the kinematics solver wanted meters. our URDF was in millimeters. four hours." },
  { t: "14:04:38", k: "ok", line: "rebuilt URDF · so101_kinematics.urdf · ok" },
  { t: "14:04:45", k: "info", line: "> set_position(x=0.18, y=0.02, z=0.20)" },
  { t: "14:04:51", k: "ok", line: "ik solved · joint_step=0.7°  ·  motion sent" },
  { t: "14:05:07", k: "warn", line: "gripper closed on nothing — strip slipped out before lift", gloss: "and even when everything was right, a paper strip is still a paper strip." },
];

export const SceneDebugging: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 200 } });

  // Show ~one new line every 12 frames after 18f preamble
  const visibleCount = Math.min(
    ENTRIES.length,
    Math.max(0, Math.floor((frame - 18) / 12)),
  );

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 96,
          opacity: intro,
          fontFamily: type.mono,
          fontSize: 14,
          letterSpacing: 4,
          color: palette.inkMute,
          textTransform: "uppercase",
        }}
      >
        § viii — debugging  ·  most of the project, in the end
      </div>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 124,
          opacity: intro,
          fontFamily: type.serif,
          fontSize: 50,
          color: palette.ink,
          lineHeight: 1.1,
          maxWidth: 1400,
        }}
      >
        The chemistry waited. It is patient that way.
      </div>

      {/* terminal */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 240,
          width: 1100,
          height: 760,
          background: "#1A1714",
          color: "#E8DEC4",
          fontFamily: type.mono,
          fontSize: 14,
          lineHeight: 1.55,
          padding: "18px 22px",
          borderRadius: 6,
          border: `1px solid ${palette.rule}`,
          boxShadow: "0 20px 40px rgba(40,30,15,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            color: "#9E8E70",
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          chem-0 · session 0a3f9 · stdout
        </div>
        {ENTRIES.slice(0, visibleCount).map((e, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 14,
              color: kindColor(e.k),
            }}
          >
            <span style={{ color: "#7A6F55" }}>{e.t}</span>
            <span style={{ color: kindBadge(e.k), width: 56 }}>
              {e.k.toUpperCase()}
            </span>
            <span style={{ flex: 1 }}>{e.line}</span>
          </div>
        ))}
        {visibleCount < ENTRIES.length ? (
          <div style={{ color: "#7A6F55" }}>
            ▍
          </div>
        ) : null}
      </div>

      {/* notebook polaroid behind the marginalia column — frames the idea
          that this column *is* the lab notebook */}
      <div
        style={{
          position: "absolute",
          right: 100,
          top: 220,
          width: 360,
          opacity: interpolate(frame, [10, 40], [0, 0.55]),
          transform: "rotate(2.5deg)",
          background: "#FBFAF6",
          padding: "10px 10px 26px 10px",
          boxShadow:
            "0 14px 28px rgba(40,30,15,0.18), 0 4px 8px rgba(40,30,15,0.08)",
          border: `1px solid ${palette.rule}`,
          zIndex: 0,
        }}
      >
        <Img
          src={staticFile("assets/generated/notebook_marginalia.png")}
          style={{ width: "100%", display: "block", filter: "saturate(0.9)" }}
        />
      </div>

      {/* marginalia */}
      <div
        style={{
          position: "absolute",
          left: 1280,
          top: 240,
          width: 480,
          height: 760,
          padding: "0 6px",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 10,
            letterSpacing: 3,
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          margin
        </div>
        {ENTRIES.map((e, i) => {
          if (!e.gloss) return null;
          const showAt = 18 + i * 12 + 4;
          const o = interpolate(frame, [showAt, showAt + 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                opacity: o,
                marginBottom: 22,
                paddingLeft: 12,
                borderLeft: `2px solid ${palette.accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: type.serif,
                  fontStyle: "italic",
                  fontSize: 20,
                  color: palette.inkSoft,
                  lineHeight: 1.35,
                }}
              >
                {e.gloss}
              </div>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: 11,
                  color: palette.inkMute,
                  marginTop: 4,
                }}
              >
                {e.t}  ·  line {String(i + 1).padStart(2, "0")}
              </div>
            </div>
          );
        })}
      </div>

      <Caption
        marker="VIII.  debugging"
        line="A port that wouldn't open, a frame that wouldn't decode, a solver that wanted meters."
      />
    </Paper>
  );
};

const kindColor = (k: LogKind) => {
  if (k === "err") return "#F1A593";
  if (k === "warn") return "#F0CE8A";
  if (k === "ok") return "#B6D7A0";
  return "#E8DEC4";
};
const kindBadge = (k: LogKind) => {
  if (k === "err") return "#E26C5C";
  if (k === "warn") return "#E8B042";
  if (k === "ok") return "#7DBE6A";
  return "#9E8E70";
};
