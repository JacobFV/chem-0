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
import { MockWindow } from "../components/MockWindow";
import { ArmStage } from "../three/Stage";
import { palette, type } from "../theme";

// Two-arm virtual world: both arms move in a coordinated rehearsal of the
// pH-strip pipeline. One arm picks a strip; the other holds a vial. The
// camera frame on the right reads a colored strip against the reference
// card. A small legend at the bottom labels "simulation" vs "real" — we got
// the left half.
export const SceneWhatWeGot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });

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
        § ix — what we got
      </div>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 124,
          opacity: t,
          fontFamily: type.serif,
          fontSize: 56,
          color: palette.ink,
          lineHeight: 1.05,
        }}
      >
        The simulation half.
      </div>

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MockWindow
          width={1620}
          height={780}
          title="chem-0 · virtual world · two-arm rehearsal"
          toolbar={
            <>
              <span style={{ color: palette.inkSoft }}>scene</span>
              <span style={{ fontFamily: type.mono, color: palette.ink }}>
                ph_strip_rehearsal · v0.4
              </span>
              <div style={{ flex: 1 }} />
              <span
                style={{
                  fontFamily: type.mono,
                  color: palette.ok,
                  fontSize: 11,
                }}
              >
                pose table ✓   ·   ik ✓   ·   collisions ✓
              </span>
            </>
          }
        >
          <div style={{ display: "flex", height: "100%" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <ArmStage
                width={1080}
                height={696}
                pose={(tt) => ({
                  pan: -0.6 + Math.sin(tt * 0.6) * 0.1,
                  lift: 0.2 + Math.sin(tt * 0.5) * 0.2,
                  elbow: -0.8 + Math.sin(tt * 0.7) * 0.2,
                  wristFlex: Math.sin(tt * 0.9) * 0.2,
                  wristRoll: tt * 0.4,
                  gripper: 0.2 + Math.abs(Math.sin(tt * 0.8)) * 0.5,
                })}
                poseB={(tt) => ({
                  pan: 0.6 + Math.sin(tt * 0.5 + 1.2) * 0.08,
                  lift: -0.1 + Math.sin(tt * 0.4) * 0.18,
                  elbow: -0.5 + Math.sin(tt * 0.6 + 0.8) * 0.18,
                  wristFlex: 0.1 + Math.sin(tt * 0.8) * 0.15,
                  wristRoll: -tt * 0.3,
                  gripper: 0.6 + Math.sin(tt * 1.2) * 0.3,
                })}
              />
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  top: 16,
                  fontFamily: type.mono,
                  fontSize: 10,
                  letterSpacing: 2,
                  color: palette.inkMute,
                  textTransform: "uppercase",
                }}
              >
                sim · 60 hz · synced to pose table
              </div>
            </div>

            <div
              style={{
                width: 480,
                borderLeft: `1px solid ${palette.rule}`,
                background: "#F7F3E8",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: 10,
                  letterSpacing: 3,
                  color: palette.inkMute,
                  textTransform: "uppercase",
                }}
              >
                read-out
              </div>

              {/* reference card */}
              <div>
                <div
                  style={{
                    fontFamily: type.serif,
                    fontSize: 20,
                    color: palette.ink,
                    marginBottom: 6,
                  }}
                >
                  reference card
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(15, 1fr)",
                    gap: 2,
                    height: 30,
                  }}
                >
                  {[
                    "#7A1F23", "#9C2A2D", "#C24832", "#DE6A2E", "#E59332", "#E2B73D",
                    "#D1C246", "#B1C04A", "#82B254", "#48A06C", "#2E8C84", "#2F6E94",
                    "#374E96", "#3D3A8C", "#5A348C",
                  ].map((c, i) => (
                    <div key={i} style={{ background: c }} />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: type.mono,
                    fontSize: 10,
                    color: palette.inkMute,
                    marginTop: 4,
                  }}
                >
                  <span>pH 0</span>
                  <span>7</span>
                  <span>14</span>
                </div>
              </div>

              {/* measured strip */}
              <div>
                <div
                  style={{
                    fontFamily: type.serif,
                    fontSize: 20,
                    color: palette.ink,
                    marginBottom: 6,
                  }}
                >
                  measured strip · UNK_3
                </div>
                <Reveal frame={frame} from={40}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 84,
                        background:
                          "linear-gradient(180deg,#D6753A 0%, #DE9434 30%, #E0B23B 60%, #C9C04A 100%)",
                        boxShadow: "0 4px 10px rgba(40,30,15,0.18)",
                      }}
                    />
                    <div
                      style={{
                        fontFamily: type.serif,
                        fontSize: 18,
                        color: palette.inkSoft,
                        lineHeight: 1.45,
                      }}
                    >
                      hue ≈ <b>amber-yellow</b><br />
                      best-match pH = <b>4.37 ± 0.15</b>
                    </div>
                  </div>
                </Reveal>
              </div>

              {/* what the real rig would have looked like — a polaroid
                  pinned over the corner of the read-out, slightly rotated.
                  Reads as "this is the bench we didn't get to". */}
              <div
                style={{
                  position: "relative",
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    fontFamily: type.mono,
                    fontSize: 10,
                    letterSpacing: 3,
                    color: palette.inkMute,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  the bench we didn't get to
                </div>
                <div
                  style={{
                    background: "#FBFAF6",
                    padding: "10px 10px 32px 10px",
                    boxShadow:
                      "0 14px 28px rgba(40,30,15,0.22), 0 4px 8px rgba(40,30,15,0.12)",
                    transform: "rotate(-1.5deg)",
                    border: `1px solid ${palette.rule}`,
                  }}
                >
                  <Img
                    src={staticFile("assets/generated/two_arms_table.png")}
                    style={{
                      width: "100%",
                      display: "block",
                      filter: "saturate(0.95) brightness(1.02)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 8,
                      textAlign: "center",
                      fontFamily: type.serif,
                      fontStyle: "italic",
                      fontSize: 13,
                      color: palette.inkSoft,
                    }}
                  >
                    real · two SO-101s · pH strip + UNK_3
                  </div>
                </div>
              </div>

              {/* status */}
              <div
                style={{
                  padding: 12,
                  border: `1px solid ${palette.rule}`,
                  background: "#FBFAF6",
                  fontFamily: type.serif,
                  fontStyle: "italic",
                  fontSize: 18,
                  color: palette.inkSoft,
                  lineHeight: 1.4,
                }}
              >
                The arms moved. The colors read. The pipeline closed —
                <br />
                <span style={{ color: palette.accent }}>it just didn't close on a real vial.</span>
              </div>
            </div>
          </div>
        </MockWindow>
      </AbsoluteFill>

      <Caption marker="IX.  what we got" line="A virtual scene the agent could rehearse in." />
    </Paper>
  );
};

const Reveal: React.FC<{ frame: number; from: number; children: React.ReactNode }> = ({
  frame,
  from,
  children,
}) => {
  const o = interpolate(frame, [from, from + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(o, [0, 1], [8, 0]);
  return <div style={{ opacity: o, transform: `translateY(${y}px)` }}>{children}</div>;
};
