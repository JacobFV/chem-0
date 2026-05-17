import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { palette, type } from "../theme";

// Simulated Bayesian-optimization trajectory: pH evolves under a sequence
// of perturbations the agent could synthesize from the tool catalog
// (pour, dip, read). The actual mp4 lives in
// public/assets/simulated-bo-trajectory/bo-trajectory.mp4 (1430×770,
// 13.2 s). It plays full-width-ish in the middle, with side annotations
// listing the perturbation timeline.
export const SceneBO: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 220 } });

  // perturbation log — each "step" is a tool sequence the agent fires.
  const STEPS: Array<{ at: number; tag: string; sub: string }> = [
    { at: 12, tag: "+5g NaCl", sub: "pick → pour → dip → infer_vial_ph" },
    { at: 80, tag: "+5ml 0.5M borax", sub: "pick → pour → wait → infer_vial_ph" },
    { at: 160, tag: "+2 drops vinegar", sub: "pick → drop → mix → infer_vial_ph" },
    { at: 240, tag: "+ baking soda pinch", sub: "pick → pour → infer_vial_ph" },
    { at: 320, tag: "BO suggests next: dilute 1:5", sub: "next iter · acquisition fn = EI" },
  ];

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
        viii · BO trajectory · simulation
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 92,
          opacity: head,
          fontFamily: type.sans,
          fontSize: 44,
          color: palette.text1,
          fontWeight: 600,
          lineHeight: 1.05,
        }}
      >
        pH evolving under agent-planned perturbations.
      </div>

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: head }}>
        <div style={{ display: "flex", gap: 24, alignItems: "stretch", marginTop: 30 }}>
          {/* video panel */}
          <div
            style={{
              width: 1100,
              height: 600,
              background: palette.bg1,
              border: `1px solid ${palette.border1}`,
              padding: 14,
            }}
          >
            <div
              style={{
                fontFamily: type.mono,
                fontSize: 10,
                letterSpacing: 3,
                color: palette.text3,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              chem-0 · simulated BO trace · pH ↔ perturbation steps
            </div>
            <div
              style={{
                width: "100%",
                height: "calc(100% - 26px)",
                background: "#000",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <OffthreadVideo
                src={staticFile("assets/simulated-bo-trajectory/bo-trajectory.mp4")}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
                // Hold the last frame after the clip ends.
                pauseWhenBuffering
              />
            </div>
          </div>

          {/* timeline panel */}
          <div
            style={{
              width: 480,
              height: 600,
              background: palette.bg1,
              border: `1px solid ${palette.border1}`,
              padding: 18,
              display: "flex",
              flexDirection: "column",
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
              perturbation timeline
            </div>
            {STEPS.map((s, i) => {
              const o = interpolate(frame, [s.at, s.at + 16], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    opacity: o,
                    transform: `translateX(${interpolate(o, [0, 1], [-8, 0])}px)`,
                    marginBottom: 18,
                    paddingLeft: 16,
                    borderLeft: `2px solid ${palette.accent}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: type.sans,
                      fontSize: 20,
                      color: palette.text1,
                      fontWeight: 500,
                    }}
                  >
                    {s.tag}
                  </div>
                  <div
                    style={{
                      fontFamily: type.mono,
                      fontSize: 13,
                      color: palette.text3,
                      marginTop: 3,
                    }}
                  >
                    {s.sub}
                  </div>
                </div>
              );
            })}

            <div
              style={{
                marginTop: "auto",
                fontFamily: type.mono,
                fontSize: 12,
                color: palette.text3,
                paddingTop: 14,
                borderTop: `1px dashed ${palette.border1}`,
              }}
            >
              source: simulated · driven by record_ph + tool sequences
              <br />
              file: assets/simulated-bo-trajectory/bo-trajectory.mp4
            </div>
          </div>
        </div>
      </AbsoluteFill>

      <Caption
        marker="viii · BO trajectory"
        line="agent picks → pours → dips → reads · then suggests the next step."
      />
    </Paper>
  );
};
