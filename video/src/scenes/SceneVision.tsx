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
import { palette, type } from "../theme";

// Accurate take on the vision pipeline. Four labeled stages, left → right:
//   1. raw frame from cv2.VideoCapture
//   2. find_vials_with_blue_cap → ROI overlay
//   3. liquid sample under cap → HSV histogram + bromothymol reference
//   4. classify → pH bucket
// All values mirror the real code in src/lib/chem0/vision.py.
export const SceneVision: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 220 } });

  // Bromothymol blue reference patches (calibrated values from vision.py)
  const PATCHES: Array<{ name: string; hex: string; ph: number; H: number; S: number }> = [
    { name: "yellow",       hex: "#E8C234", ph: 4.5, H: 28,  S: 154 },
    { name: "yellow-green", hex: "#BCB845", ph: 6.0, H: 41,  S: 122 },
    { name: "green",        hex: "#5BA76E", ph: 6.8, H: 75,  S: 110 },
    { name: "blue-green",   hex: "#4A8DA3", ph: 7.6, H: 96,  S: 186 },
    { name: "blue",         hex: "#3D5E9C", ph: 8.5, H: 103, S: 195 },
  ];

  // Classified result: yellow → pH 4.5 (vinegar candidate)
  const classifiedIndex = 0;

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
        vii · vision · src/lib/chem0/vision.py
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
        OpenCV + HSV vs. bromothymol blue.
      </div>

      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 230,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1.1fr",
          gap: 20,
        }}
      >
        {/* 1. raw frame */}
        <Slab label="01 · capture_frame" delay={20}>
          <RawFrame frame={frame} />
          <KV k="cv2.VideoCapture" v="cam 0 · 1280×720" />
          <KV k="codec" v="MJPG → BGR" />
        </Slab>

        {/* 2. find_vials_with_blue_cap */}
        <Slab label="02 · find_vials_with_blue_cap" delay={50}>
          <RoiFrame frame={frame} />
          <KV k="hough circles" v="3 vials · v1 v2 v3" />
          <KV k="cap ratio" v=">5% blue → kept" />
        </Slab>

        {/* 3. HSV classify */}
        <Slab label="03 · infer_vial_ph · HSV" delay={80}>
          <HsvSwatches patches={PATCHES} frame={frame} classifiedIndex={classifiedIndex} />
        </Slab>

        {/* 4. result */}
        <Slab label="04 · pHResult" delay={110} highlight>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                background: PATCHES[classifiedIndex].hex,
                border: `1px solid ${palette.border2}`,
              }}
            />
            <div>
              <div style={{ fontFamily: type.mono, fontSize: 11, color: palette.text3, letterSpacing: 2, textTransform: "uppercase" }}>
                class
              </div>
              <div style={{ fontFamily: type.sans, fontSize: 22, color: palette.text1, fontWeight: 500 }}>
                {PATCHES[classifiedIndex].name}
              </div>
            </div>
          </div>
          <div
            style={{
              fontFamily: type.sans,
              fontSize: 56,
              color: palette.accent,
              fontWeight: 600,
              letterSpacing: -1,
              lineHeight: 1,
              marginTop: 4,
              marginBottom: 4,
            }}
          >
            pH {PATCHES[classifiedIndex].ph.toFixed(1)}
          </div>
          <KV k="vial_id" v="v3" />
          <KV k="confidence" v="0.84" />
          <KV k="identity?" v="vinegar (candidate)" />
        </Slab>
      </div>

      {/* DMM strip across the bottom */}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 130,
          background: palette.bg1,
          border: `1px solid ${palette.border1}`,
          padding: "16px 20px",
          display: "flex",
          gap: 28,
          alignItems: "center",
          opacity: interpolate(frame, [220, 270], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 11,
            letterSpacing: 3,
            color: palette.accent,
            textTransform: "uppercase",
            minWidth: 200,
          }}
        >
          dmm probe pipeline
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1, color: palette.text2, fontFamily: type.mono, fontSize: 13 }}>
          <span>find_probe_tips → roi</span>
          <span style={{ color: palette.text3 }}>·</span>
          <span>find_multimeter_display → lcd roi</span>
          <span style={{ color: palette.text3 }}>·</span>
          <span>OCR via _preprocess_lcd_for_ocr</span>
          <span style={{ color: palette.text3 }}>·</span>
          <span>parse → <span style={{ color: palette.accent }}>0.082 MΩ</span></span>
          <span style={{ color: palette.text3 }}>·</span>
          <span>lookup_by_ph_and_resistivity → identity</span>
        </div>
      </div>

      <Caption
        marker="vii · vision"
        line="find vials → sample under cap → HSV vs reference patches → classify → record."
      />
    </Paper>
  );
};

const Slab: React.FC<{
  label: string;
  delay: number;
  highlight?: boolean;
  children: React.ReactNode;
}> = ({ label, delay, highlight, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${interpolate(t, [0, 1], [10, 0])}px)`,
        background: palette.bg1,
        border: `1px solid ${palette.border1}`,
        borderTop: `2px solid ${highlight ? palette.accent : palette.border2}`,
        padding: "16px 18px 18px",
        minHeight: 360,
      }}
    >
      <div
        style={{
          fontFamily: type.mono,
          fontSize: 10,
          letterSpacing: 2,
          color: highlight ? palette.accent : palette.text3,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
};

const KV: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 0",
      fontFamily: type.mono,
      fontSize: 12,
      color: palette.text2,
      borderBottom: `1px dashed ${palette.border1}`,
    }}
  >
    <span style={{ color: palette.text3 }}>{k}</span>
    <span>{v}</span>
  </div>
);

const RawFrame: React.FC<{ frame: number }> = ({ frame }) => {
  // Dark frame with a vial silhouette under warm light
  const wobble = Math.sin(frame / 12) * 2;
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16 / 12",
        background:
          "radial-gradient(60% 70% at 50% 60%, rgba(245,215,110,0.18) 0%, rgba(0,0,0,0) 70%), #0a0a0a",
        position: "relative",
        marginBottom: 12,
        border: `1px solid ${palette.border1}`,
        overflow: "hidden",
      }}
    >
      {/* three vials */}
      {[0.3, 0.5, 0.7].map((x, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${x * 100}%`,
            top: "30%",
            transform: `translateX(-50%) translateY(${wobble * 0.5}px)`,
            width: 22,
            height: 90,
          }}
        >
          <div
            style={{
              width: "100%",
              height: 14,
              background: "#1f4f9c",
            }}
          />
          <div
            style={{
              width: "100%",
              height: 76,
              background: i === 1 ? "#E8C234" : i === 0 ? "#5BA76E" : "#3D5E9C",
              opacity: 0.92,
            }}
          />
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 6,
          fontFamily: type.mono,
          fontSize: 9,
          color: palette.text3,
        }}
      >
        cam 0 · t={(frame / 30).toFixed(2)}s
      </div>
    </div>
  );
};

const RoiFrame: React.FC<{ frame: number }> = ({ frame }) => {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16 / 12",
        background:
          "radial-gradient(60% 70% at 50% 60%, rgba(245,215,110,0.18) 0%, rgba(0,0,0,0) 70%), #0a0a0a",
        position: "relative",
        marginBottom: 12,
        border: `1px solid ${palette.border1}`,
        overflow: "hidden",
      }}
    >
      {/* vials w/ ROI rectangles */}
      {[
        { x: 0.3, color: "#5BA76E", id: "v1" },
        { x: 0.5, color: "#E8C234", id: "v2" },
        { x: 0.7, color: "#3D5E9C", id: "v3" },
      ].map((v, i) => {
        const o = interpolate(frame, [60 + i * 8, 80 + i * 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: `${v.x * 100}%`,
                top: "30%",
                transform: "translateX(-50%)",
                width: 22,
                height: 90,
              }}
            >
              <div style={{ width: "100%", height: 14, background: "#1f4f9c" }} />
              <div style={{ width: "100%", height: 76, background: v.color, opacity: 0.92 }} />
            </div>
            {/* ROI overlay */}
            <div
              style={{
                position: "absolute",
                left: `${v.x * 100}%`,
                top: "calc(30% + 14px)",
                transform: "translateX(-50%)",
                width: 30,
                height: 76,
                border: `1.5px solid ${palette.accent}`,
                opacity: o,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${v.x * 100}%`,
                top: "calc(30% + 92px)",
                transform: "translateX(-50%)",
                fontFamily: type.mono,
                fontSize: 9,
                color: palette.accent,
                opacity: o,
              }}
            >
              {v.id}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const HsvSwatches: React.FC<{
  patches: Array<{ name: string; hex: string; ph: number; H: number; S: number }>;
  frame: number;
  classifiedIndex: number;
}> = ({ patches, frame, classifiedIndex }) => {
  return (
    <div>
      {patches.map((p, i) => {
        const o = interpolate(frame, [100 + i * 10, 116 + i * 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const isChosen = i === classifiedIndex;
        return (
          <div
            key={p.name}
            style={{
              opacity: o,
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
              padding: "4px 6px",
              border: `1px solid ${isChosen ? palette.accent : palette.border1}`,
              background: isChosen ? palette.accentSoft : "transparent",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                background: p.hex,
                border: `1px solid ${palette.border2}`,
              }}
            />
            <div style={{ flex: 1, fontFamily: type.mono, fontSize: 12, color: palette.text2 }}>
              <div style={{ color: isChosen ? palette.accent : palette.text1 }}>
                {p.name}
              </div>
              <div style={{ color: palette.text3, fontSize: 10 }}>
                H={p.H} S={p.S}
              </div>
            </div>
            <div
              style={{
                fontFamily: type.mono,
                fontSize: 13,
                color: isChosen ? palette.accent : palette.text2,
                minWidth: 56,
                textAlign: "right",
              }}
            >
              pH {p.ph.toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
