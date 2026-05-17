import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { DotAlongArrow } from "../components/DotAlongArrow";
import { Typewriter } from "../components/Typewriter";
import { palette, type } from "../theme";

// Three boxes: "you type" → "agent calls tools" → "arms move + DB writes".
// Each box is a styled monospace card. Dots ride between them on cue.
export const ScenePitch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });

  // Card geometry
  const A = { x: 120, y: 360, w: 520, h: 320 };
  const B = { x: 700, y: 380, w: 520, h: 280 };
  const C = { x: 1280, y: 360, w: 520, h: 320 };

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 110,
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
            marginBottom: 14,
          }}
        >
          how it works
        </div>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 60,
            color: palette.text1,
            lineHeight: 1.05,
            fontWeight: 600,
          }}
        >
          Prompt &nbsp;<span style={{ color: palette.accent }}>→</span>&nbsp; tools &nbsp;<span style={{ color: palette.accent }}>→</span>&nbsp; arms &nbsp;<span style={{ color: palette.accent }}>→</span>&nbsp; database
        </div>
      </div>

      {/* PROMPT */}
      <Box label="01 · prompt" x={A.x} y={A.y} w={A.w} h={A.h} delay={20}>
        <div style={{ fontFamily: type.mono, fontSize: 18, color: palette.text2, lineHeight: 1.6 }}>
          <Typewriter
            start={40}
            text={`> measure the pH of\n  the unknown vial\n  (UNK_3) and write\n  it to the experiment.`}
          />
        </div>
      </Box>

      {/* AGENT */}
      <Box label="02 · agent" x={B.x} y={B.y} w={B.w} h={B.h} delay={50}>
        <div style={{ fontFamily: type.sans, fontSize: 18, color: palette.text2, marginBottom: 14 }}>
          gpt-5.5 · stdio MCP · 22 tools
        </div>
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 15,
            color: palette.accent,
            lineHeight: 1.7,
          }}
        >
          <Typewriter
            start={120}
            cps={20}
            showCaret={false}
            text={`view_camera(0)\nset_position(x=.18,y=.02,z=.20)\nrecord_ph("UNK_3", 4.37)`}
          />
        </div>
      </Box>

      {/* ARMS + DB */}
      <Box label="03 · result" x={C.x} y={C.y} w={C.w} h={C.h} delay={80}>
        <div style={{ fontFamily: type.sans, fontSize: 18, color: palette.text2, marginBottom: 14 }}>
          arms move · SQLite writes
        </div>
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 14,
            color: palette.text2,
            background: palette.bg2,
            border: `1px solid ${palette.border1}`,
            padding: 12,
            borderRadius: 3,
            lineHeight: 1.6,
          }}
        >
          <div style={{ color: palette.text3 }}>experiments/exp_a3f9</div>
          <div>sample <span style={{ color: palette.accent }}>UNK_3</span></div>
          <div>pH    <span style={{ color: palette.accent }}>4.37 ± 0.15</span></div>
          <div>by    set_position + record_ph</div>
          <div>at    2026-05-14 14:08:51</div>
        </div>
      </Box>

      <DotAlongArrow
        from={{ x: A.x + A.w + 8, y: A.y + 160 }}
        to={{ x: B.x - 14, y: B.y + 140 }}
        start={170}
        dotColor={palette.accent}
        stroke={palette.border2}
      />
      <DotAlongArrow
        from={{ x: B.x + B.w + 8, y: B.y + 140 }}
        to={{ x: C.x - 14, y: C.y + 160 }}
        start={230}
        dotColor={palette.accent}
        stroke={palette.border2}
      />

      <Caption
        marker="ii · the pitch"
        line="Hundred-dollar arms, a desktop app, twenty-two MCP tools. The result lands in your database."
      />
    </Paper>
  );
};

const Box: React.FC<{
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
  children: React.ReactNode;
}> = ({ label, x, y, w, h, delay, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: t,
        transform: `translateY(${interpolate(t, [0, 1], [12, 0])}px)`,
        background: palette.bg1,
        border: `1px solid ${palette.border1}`,
        borderTop: `2px solid ${palette.accent}`,
        padding: "22px 24px",
      }}
    >
      <div
        style={{
          fontFamily: type.mono,
          fontSize: 11,
          letterSpacing: 3,
          color: palette.accent,
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
};
