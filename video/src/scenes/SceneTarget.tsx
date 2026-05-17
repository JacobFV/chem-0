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

// A pH-strip target shot: real photo at small size (polaroid-style frame),
// alongside a hand-set list of the pipeline steps. The strip image rotates
// in slightly to feel pinned, not pasted.
export const SceneTarget: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220, mass: 0.9 } });
  const pinT = spring({ frame: frame - 8, fps, config: { damping: 200 } });

  const steps = [
    "dip the strip",
    "lift to the camera",
    "match against the card",
    "name the color",
    "name the pH",
    "write it down",
  ];

  return (
    <Paper>
      {/* polaroid */}
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 200,
          transform: `rotate(${interpolate(pinT, [0, 1], [-7, -3])}deg)`,
          opacity: pinT,
          background: "#FBFAF6",
          padding: "16px 16px 64px 16px",
          boxShadow:
            "0 22px 40px rgba(40,30,15,0.25), 0 6px 10px rgba(40,30,15,0.12)",
          width: 460,
        }}
      >
        <Img
          src={staticFile("assets/827ae0f8-9872-44cd-99e2-9825bade9378.png")}
          style={{ width: "100%", display: "block", filter: "saturate(0.92) brightness(1.04)" }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 18,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: type.serif,
            fontStyle: "italic",
            color: palette.inkSoft,
            fontSize: 18,
          }}
        >
          pH 0–14 · universal indicator
        </div>
        {/* tape */}
        <div
          style={{
            position: "absolute",
            top: -18,
            left: "50%",
            transform: "translateX(-50%) rotate(-3deg)",
            width: 120,
            height: 28,
            background: "rgba(200,180,120,0.55)",
            borderLeft: "1px dashed rgba(0,0,0,0.06)",
            borderRight: "1px dashed rgba(0,0,0,0.06)",
          }}
        />
      </div>

      {/* steps */}
      <div
        style={{
          position: "absolute",
          right: 200,
          top: 220,
          width: 720,
          opacity: t,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 14,
            letterSpacing: 4,
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 22,
          }}
        >
          § iii — the target
        </div>
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 52,
            color: palette.ink,
            marginBottom: 28,
            lineHeight: 1.15,
          }}
        >
          One repeatable gesture.
        </div>
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontFamily: type.serif,
            fontSize: 28,
            color: palette.inkSoft,
            lineHeight: 1.5,
          }}
        >
          {steps.map((s, i) => {
            const o = interpolate(frame, [30 + i * 12, 50 + i * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <li key={s} style={{ opacity: o, display: "flex", gap: 16 }}>
                <span
                  style={{
                    color: palette.accent,
                    fontFamily: type.mono,
                    fontSize: 20,
                    width: 32,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <Caption marker="III.  the target" line="A color, read against a reference card. A number, written down." />
    </Paper>
  );
};
