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
import { palette, type } from "../theme";

// A real agent session, animated. The Electron app is on the LEFT (smaller),
// and on the RIGHT we paint a stream of events as they emit from the
// backend — exactly the agent_event types the real backend sends:
//   message · assistant_delta · tool_call · tool_response · assistant_done.
// Each entry slides in on its frame schedule. A "tool name" badge flashes
// in the gutter when a tool_call fires.
//
// This mirrors the actual structure in src/lib/backend/src/backend.ts
// (streamAgentMessage), where every Responses-API event is mapped to one
// of these types.
type EventKind =
  | "message"
  | "assistant_delta"
  | "tool_call"
  | "tool_response"
  | "assistant_done";

type EventRow = {
  start: number;
  kind: EventKind;
  text?: string;
  tool?: string;
  args?: string;
  response?: string;
};

const EVENTS: EventRow[] = [
  { start: 8, kind: "message", text: "pick up vial 3, tell me what's in it." },
  { start: 32, kind: "assistant_delta", text: "okay — opening cam 0, then approaching the rack." },
  { start: 80, kind: "tool_call", tool: "view_camera", args: `{ camera_id: 0 }` },
  { start: 110, kind: "tool_response", tool: "view_camera", response: "ok · frame 1280×720" },
  { start: 130, kind: "tool_call", tool: "set_position", args: `{ x:.18, y:.02, z:.20 }` },
  { start: 175, kind: "tool_response", tool: "set_position", response: "ok · err 2.1mm" },
  { start: 195, kind: "tool_call", tool: "close_gripper", args: `{}` },
  { start: 225, kind: "tool_response", tool: "close_gripper", response: "ok · contact" },
  { start: 245, kind: "tool_call", tool: "observe", args: `{ vial: "v3" }` },
  { start: 285, kind: "tool_response", tool: "observe", response: "captured · roi=420×680" },
  { start: 305, kind: "tool_call", tool: "infer_vial_ph", args: `{ vial: "v3" }` },
  { start: 345, kind: "tool_response", tool: "infer_vial_ph", response: "pH ≈ 4.5 (yellow)" },
  { start: 370, kind: "tool_call", tool: "record_ph", args: `{ sample:"v3", value:4.5 }` },
  { start: 400, kind: "tool_response", tool: "record_ph", response: "ok · exp_a3f9" },
  { start: 425, kind: "assistant_done", text: "v3 reads pH ≈ 4.5 — yellow on bromothymol. matches the vinegar reference." },
];

export const SceneAgent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });

  // Tool name flashing on the gutter as it fires.
  const activeTool = (() => {
    for (let i = EVENTS.length - 1; i >= 0; i--) {
      const e = EVENTS[i];
      if (e.kind === "tool_call" && frame >= e.start && frame < e.start + 30) {
        return e.tool ?? null;
      }
    }
    return null;
  })();

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
        iv · agent loop · real session
      </div>

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: head }}>
        <div style={{ display: "flex", gap: 28, alignItems: "stretch" }}>
          {/* LHS: shrunken real console */}
          <ElectronFrame
            src="electron/static_index.html"
            title="chem-0 · exp_a3f9"
            width={960}
            height={640}
            innerW={1720}
            innerH={862}
          />

          {/* RHS: live event panel — drawn in the real app's panel chrome */}
          <div
            style={{
              width: 760,
              height: 640,
              background: palette.bg1,
              border: `1px solid ${palette.border1}`,
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom: `1px solid ${palette.border1}`,
                background: palette.bg2,
              }}
            >
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: 11,
                  letterSpacing: 3,
                  color: palette.text3,
                  textTransform: "uppercase",
                }}
              >
                agent-event stream · sqlite-backed
              </div>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: 11,
                  color: activeTool ? palette.accent : palette.text4,
                  letterSpacing: 1,
                }}
              >
                {activeTool ? `▶ ${activeTool}` : "idle"}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                padding: "12px 14px",
                fontFamily: type.mono,
                fontSize: 13,
                color: palette.text2,
                position: "relative",
              }}
            >
              {EVENTS.map((e, i) => {
                const o = interpolate(frame, [e.start, e.start + 10], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                if (o <= 0) return null;
                return (
                  <EventLine key={i} ev={e} opacity={o} index={i} frame={frame} />
                );
              })}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      <Caption
        marker="iv · agent loop"
        line="user → assistant_delta → tool_call → tool_response → assistant_done — all logged."
      />
    </Paper>
  );
};

const EventLine: React.FC<{ ev: EventRow; opacity: number; index: number; frame: number }> = ({
  ev,
  opacity,
  index,
  frame,
}) => {
  // Stack vertically with absolute positioning so newer events push from
  // the bottom upward. We compute a y offset by counting how many earlier
  // events are visible.
  const visibleBefore = EVENTS.slice(0, index).filter((e) => frame >= e.start).length;
  const y = 6 + visibleBefore * 36;

  const labelColor = {
    message: palette.text2,
    assistant_delta: palette.text1,
    tool_call: palette.accent,
    tool_response: palette.ok,
    assistant_done: palette.text1,
  }[ev.kind];

  const tagFor = (k: EventKind) =>
    ({
      message: "user",
      assistant_delta: "stream",
      tool_call: "tool_call",
      tool_response: "tool_resp",
      assistant_done: "done",
    }[k]);

  return (
    <div
      style={{
        position: "absolute",
        top: y,
        left: 14,
        right: 14,
        opacity,
        transform: `translateX(${interpolate(opacity, [0, 1], [12, 0])}px)`,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        fontFamily: type.mono,
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          width: 70,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: labelColor,
          paddingTop: 3,
          flexShrink: 0,
        }}
      >
        {tagFor(ev.kind)}
      </span>
      {ev.kind === "tool_call" ? (
        <span style={{ color: palette.text1 }}>
          <span style={{ color: palette.accent }}>{ev.tool}</span>
          <span style={{ color: palette.text3 }}>(</span>
          <span style={{ color: palette.text2 }}>{ev.args}</span>
          <span style={{ color: palette.text3 }}>)</span>
        </span>
      ) : ev.kind === "tool_response" ? (
        <span style={{ color: palette.text2 }}>
          <span style={{ color: palette.ok }}>← {ev.tool}</span> · {ev.response}
        </span>
      ) : (
        <span style={{ color: ev.kind === "message" ? palette.text2 : palette.text1 }}>
          {ev.text}
        </span>
      )}
    </div>
  );
};
