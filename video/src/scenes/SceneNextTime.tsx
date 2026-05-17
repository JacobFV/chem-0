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
import { Card } from "../components/Card";
import { DotAlongArrow } from "../components/DotAlongArrow";
import { palette, type } from "../theme";

// "Next time" — a quiet, almost-architectural plan. Five propositions, set
// like marginalia in a notebook, each accompanied by a one-line "why". The
// final card is a recapitulation: "trajectory is the object" — set larger,
// alone, on the right.
export const SceneNextTime: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });

  const propositions: Array<{ n: string; head: string; body: string }> = [
    {
      n: "01",
      head: "Calibrate first. On purpose.",
      body: "A full week. Treat the URDF as the experiment.",
    },
    {
      n: "02",
      head: "Dip water before anything that matters.",
      body: "A boring rehearsal is the cheapest evidence the rig is real.",
    },
    {
      n: "03",
      head: "Record the trajectory, not the answer.",
      body: "The answer is residue. The trajectory is the object.",
    },
    {
      n: "04",
      head: "Let the human press every button once.",
      body: "Nothing the agent does should be invisible.",
    },
    {
      n: "05",
      head: "Make the chemistry wait, a little longer.",
      body: "Chemistry has been waiting for centuries. It can wait.",
    },
  ];

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 96,
          opacity: t,
          fontFamily: type.mono,
          fontSize: 14,
          letterSpacing: 4,
          color: palette.inkMute,
          textTransform: "uppercase",
        }}
      >
        § x — next time
      </div>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 124,
          opacity: t,
          fontFamily: type.serif,
          fontSize: 64,
          color: palette.ink,
          lineHeight: 1.05,
        }}
      >
        Five propositions, in chronological order of regret.
      </div>

      {propositions.map((p, i) => {
        const appear = interpolate(
          frame,
          [40 + i * 22, 60 + i * 22],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        return (
          <div
            key={p.n}
            style={{
              position: "absolute",
              left: 150,
              top: 270 + i * 140,
              width: 920,
              opacity: appear,
              transform: `translateX(${interpolate(appear, [0, 1], [-12, 0])}px)`,
            }}
          >
            <div style={{ display: "flex", gap: 20 }}>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: 16,
                  color: palette.accent,
                  width: 36,
                  paddingTop: 8,
                }}
              >
                {p.n}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: type.serif,
                    fontSize: 34,
                    color: palette.ink,
                    lineHeight: 1.15,
                  }}
                >
                  {p.head}
                </div>
                <div
                  style={{
                    fontFamily: type.serif,
                    fontStyle: "italic",
                    fontSize: 20,
                    color: palette.inkSoft,
                    marginTop: 6,
                  }}
                >
                  {p.body}
                </div>
                <div
                  style={{
                    height: 1,
                    width: "100%",
                    background: palette.rule,
                    marginTop: 12,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* recap card */}
      <div
        style={{
          position: "absolute",
          right: 150,
          top: 280,
          width: 580,
          height: 680,
          opacity: interpolate(frame, [180, 230], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            border: `1px solid ${palette.rule}`,
            borderTop: `3px solid ${palette.accent}`,
            background: "#FBFAF6",
            padding: "32px 28px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontFamily: type.mono,
              fontSize: 11,
              letterSpacing: 3,
              color: palette.inkMute,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            recapitulation
          </div>
          <div
            style={{
              fontFamily: type.serif,
              fontSize: 44,
              color: palette.ink,
              lineHeight: 1.15,
              marginBottom: 18,
            }}
          >
            The trajectory is the object.
          </div>
          <div
            style={{
              fontFamily: type.serif,
              fontStyle: "italic",
              fontSize: 22,
              color: palette.inkSoft,
              lineHeight: 1.5,
              marginBottom: "auto",
            }}
          >
            Calibration is not an infrastructure detail. It is the agent's
            first act of humility before reality — and ours.
          </div>
          <div
            style={{
              borderTop: `1px dashed ${palette.rule}`,
              paddingTop: 18,
              marginTop: 18,
              fontFamily: type.mono,
              fontSize: 12,
              color: palette.inkMute,
              letterSpacing: 1,
            }}
          >
            field report  ·  chem-0  ·  may, 2026
          </div>
        </div>
      </div>

      <Caption
        marker="X.  next time"
        line="We would treat the URDF as the experiment."
      />
    </Paper>
  );
};
