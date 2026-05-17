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
import { MockWindow } from "../components/MockWindow";
import { MockCursor } from "../components/MockCursor";
import { Typewriter } from "../components/Typewriter";
import { ArmStage } from "../three/Stage";
import { palette, type } from "../theme";

// A walk-through of the Electron console. Three panels mirror the real
// renderer: experiments (left), camera + arm 3D (center), agent chat
// (right). A mock cursor selects an experiment, opens the chat, types a
// prompt — and the 3D arm in the center panel responds with a small motion.
export const SceneConsole: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });
  const windowW = 1620;
  const windowH = 860;

  return (
    <Paper>
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
        § vi — the console
      </div>
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: t,
        }}
      >
        <div style={{ position: "relative" }}>
          <MockWindow
            width={windowW}
            height={windowH}
            title="chem-0  ·  experiment a3f9  ·  mcp_so101"
            toolbar={
              <>
                <ToolbarTab label="Experiments" active />
                <ToolbarTab label="Worlds" />
                <ToolbarTab label="Arms" />
                <ToolbarTab label="Artifacts" />
                <div style={{ flex: 1 }} />
                <Pill color={palette.ok} label="connected · /dev/cu.usbmodem5AB01815731" />
                <Pill color={palette.warn} label="cam 0 · 1280×720 · 30fps" />
                <Pill color={palette.accent} label="agent · gpt-5.5" />
              </>
            }
          >
            <div style={{ display: "flex", height: "100%" }}>
              {/* LHS: experiments list */}
              <div
                style={{
                  width: 280,
                  borderRight: `1px solid ${palette.rule}`,
                  background: "#F7F3E8",
                  padding: 14,
                  fontFamily: type.sans,
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
                  experiments
                </div>
                {[
                  { id: "a3f9", title: "ph strips · unknowns", date: "may 14" },
                  { id: "a3f8", title: "calibration · pass 4", date: "may 13" },
                  { id: "a3f7", title: "color checker probe", date: "may 12" },
                  { id: "a3f6", title: "first contact", date: "may 09" },
                ].map((e, i) => (
                  <div
                    key={e.id}
                    style={{
                      padding: "10px 12px",
                      marginBottom: 6,
                      border: `1px solid ${i === 0 ? palette.accent : palette.rule}`,
                      background: i === 0 ? "#FBF4ED" : "#FBFAF6",
                      fontSize: 13,
                      color: palette.ink,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                    <div
                      style={{
                        fontFamily: type.mono,
                        fontSize: 11,
                        color: palette.inkMute,
                        marginTop: 4,
                      }}
                    >
                      {e.id} · {e.date}
                    </div>
                  </div>
                ))}
              </div>

              {/* CENTER: camera frame + 3D arm */}
              <div style={{ flex: 1, padding: 16, display: "flex", gap: 12, flexDirection: "column" }}>
                <div
                  style={{
                    flex: 1,
                    border: `1px solid ${palette.rule}`,
                    background: "#1F1B16",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <CameraOverlay frame={frame} />
                </div>
                <div
                  style={{
                    height: 280,
                    border: `1px solid ${palette.rule}`,
                    background: "#F4F1EA",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <ArmStage
                    width={780}
                    height={278}
                    pose={(tt) => ({
                      pan: Math.sin(tt * 0.4) * 0.25,
                      lift: -0.1 + Math.sin(tt * 0.6) * 0.18,
                      elbow: -0.5 + Math.sin(tt * 0.5 + 1) * 0.2,
                      wristFlex: Math.sin(tt * 0.7) * 0.15,
                      wristRoll: tt * 0.5,
                      gripper: 0.5 + Math.sin(tt) * 0.4,
                    })}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 10,
                      fontFamily: type.mono,
                      fontSize: 10,
                      letterSpacing: 2,
                      color: palette.inkMute,
                      textTransform: "uppercase",
                    }}
                  >
                    mcp_so101 · live raw pose
                  </div>
                </div>
              </div>

              {/* RHS: chat */}
              <div
                style={{
                  width: 420,
                  borderLeft: `1px solid ${palette.rule}`,
                  background: "#F7F3E8",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${palette.rule}`,
                    fontFamily: type.mono,
                    fontSize: 10,
                    letterSpacing: 3,
                    color: palette.inkMute,
                    textTransform: "uppercase",
                  }}
                >
                  agent chat
                </div>
                <div style={{ flex: 1, padding: 14, overflow: "hidden" }}>
                  <ChatLine who="you" delay={20}>
                    can you read the pH of UNK_3?
                  </ChatLine>
                  <ChatLine who="agent" delay={80}>
                    one moment — viewing camera 0, then approaching the rack.
                  </ChatLine>
                  <ChatLine who="agent" delay={150} mono>
                    set_position({"{"}x:0.18, y:0.02, z:0.20, gripper:20{"}"})
                  </ChatLine>
                  <ChatLine who="agent" delay={220}>
                    strip lifted. color looks between 4 and 5 on the reference card.
                  </ChatLine>
                </div>
                <div
                  style={{
                    padding: 12,
                    borderTop: `1px solid ${palette.rule}`,
                    background: "#FBFAF6",
                  }}
                >
                  <div
                    style={{
                      border: `1px solid ${palette.rule}`,
                      borderRadius: 6,
                      padding: "10px 12px",
                      minHeight: 44,
                      fontFamily: type.mono,
                      fontSize: 13,
                      color: palette.ink,
                    }}
                  >
                    <Typewriter
                      start={520}
                      text="and now dip into UNK_4 — careful, max_step=5"
                    />
                  </div>
                </div>
              </div>
            </div>
          </MockWindow>

          {/* cursor over the window: positions are relative to window top-left */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: windowW,
              height: windowH,
              pointerEvents: "none",
            }}
          >
            <MockCursor
              path={[
                { frame: 0, x: 1100, y: 800 },
                { frame: 40, x: 160, y: 200, click: true },
                { frame: 110, x: 160, y: 200 },
                { frame: 180, x: 1200, y: 500, click: true },
                { frame: 260, x: 1200, y: 760 },
                { frame: 320, x: 1300, y: 818, click: true },
                { frame: 600, x: 1300, y: 818 },
              ]}
            />
          </div>
        </div>
      </AbsoluteFill>
      <Caption
        marker="VI.  the console"
        line="Cameras on the left. Arms in the middle. The agent's chat on the right."
      />
    </Paper>
  );
};

const ToolbarTab: React.FC<{ label: string; active?: boolean }> = ({
  label,
  active,
}) => (
  <div
    style={{
      padding: "6px 10px",
      borderRadius: 4,
      background: active ? palette.paperDeep : "transparent",
      color: active ? palette.ink : palette.inkSoft,
      fontFamily: type.sans,
      fontSize: 13,
      fontWeight: active ? 600 : 400,
    }}
  >
    {label}
  </div>
);

const Pill: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div
    style={{
      display: "flex",
      gap: 6,
      alignItems: "center",
      fontFamily: type.mono,
      fontSize: 11,
      color: palette.inkSoft,
      border: `1px solid ${palette.rule}`,
      padding: "3px 8px",
      borderRadius: 999,
      background: "#FBFAF6",
    }}
  >
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 7,
        background: color,
        boxShadow: `0 0 0 2px ${color}22`,
      }}
    />
    {label}
  </div>
);

const ChatLine: React.FC<{
  who: "you" | "agent";
  delay: number;
  children: React.ReactNode;
  mono?: boolean;
}> = ({ who, delay, children, mono }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isYou = who === "you";
  return (
    <div
      style={{
        opacity: o,
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: isYou ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          fontFamily: type.mono,
          fontSize: 9,
          letterSpacing: 2,
          color: palette.inkMute,
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {who}
      </div>
      <div
        style={{
          maxWidth: 340,
          padding: "8px 12px",
          background: isYou ? "#EFE6D2" : "#FBFAF6",
          border: `1px solid ${palette.rule}`,
          borderRadius: 6,
          fontFamily: mono ? type.mono : type.sans,
          fontSize: mono ? 11 : 13,
          color: palette.ink,
          lineHeight: 1.4,
        }}
      >
        {children}
      </div>
    </div>
  );
};

const CameraOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  // A stylized camera frame: dark background with a soft warm spotlight, a
  // crosshair, a rolling scanline, an exposure HUD. Avoids using an actual
  // image since we want the look to be deliberately synthetic — the camera
  // is *the agent's eye*, not a stock photo.
  const t = frame / 30;
  return (
    <div style={{ position: "absolute", inset: 0, color: "#F6EFDC" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(40% 35% at 60% 55%, rgba(255,220,150,0.25) 0%, rgba(0,0,0,0) 70%)",
        }}
      />
      {/* color strip subject */}
      <div
        style={{
          position: "absolute",
          left: "55%",
          top: "45%",
          transform: `translate(-50%, -50%) rotate(${Math.sin(t) * 2}deg)`,
          width: 60,
          height: 220,
          background:
            "linear-gradient(180deg, #C04A3A 0%, #D87738 14%, #E7A032 28%, #E0BF3F 42%, #B9BB42 56%, #5E9447 70%, #3F7B86 84%, #4A3F87 100%)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      />
      {/* gripper coming in from above */}
      <div
        style={{
          position: "absolute",
          left: `${52 + Math.sin(t * 0.5) * 1}%`,
          top: 0,
          width: 80,
          height: `${35 + Math.sin(t * 0.4) * 4}%`,
          background:
            "linear-gradient(180deg, rgba(20,16,12,0.95) 0%, rgba(20,16,12,0.75) 80%, rgba(20,16,12,0.0) 100%)",
          transform: "translateX(-50%)",
        }}
      />
      {/* crosshair */}
      <div
        style={{
          position: "absolute",
          left: "55%",
          top: "45%",
          transform: "translate(-50%, -50%)",
          width: 120,
          height: 120,
          border: "1px solid rgba(246,239,220,0.4)",
          borderRadius: "50%",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "55%",
          top: "45%",
          width: 1,
          height: 200,
          background: "rgba(246,239,220,0.25)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "55%",
          top: "45%",
          width: 200,
          height: 1,
          background: "rgba(246,239,220,0.25)",
          transform: "translate(-50%, -50%)",
        }}
      />
      {/* HUD */}
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 12,
          fontFamily: type.mono,
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        cam 0 · 1280×720 · 30fps · gain 1.0
      </div>
      <div
        style={{
          position: "absolute",
          right: 14,
          bottom: 12,
          fontFamily: type.mono,
          fontSize: 11,
          opacity: 0.65,
        }}
      >
        rec · {String(Math.floor(t)).padStart(2, "0")}:
        {String(Math.floor((t * 60) % 60)).padStart(2, "0")}
      </div>
      {/* scanline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${(t * 30) % 100}%`,
          height: 1,
          background: "rgba(246,239,220,0.18)",
        }}
      />
    </div>
  );
};
