import React from "react";
import { IFrame, staticFile } from "remotion";
import { palette, type } from "../theme";

// A macOS-style chrome wrapping a real <iframe> of one of the static
// renderer HTML files we ship in video/public/electron/. Because those
// files load the *real* styles.css from the Electron app, this is the
// actual UI — same markup, same CSS — not a recreation.
export const ElectronFrame: React.FC<{
  src: string; // staticFile path, e.g. "public/electron/static_index.html"
  title?: string;
  width?: number;
  height?: number;
  // The static pages declare a fixed inner 1500x880 viewport. If the
  // outer chrome is larger, we scale the iframe up to fit so the UI
  // doesn't shrink awkwardly inside a too-large window.
  innerW?: number;
  innerH?: number;
  style?: React.CSSProperties;
}> = ({
  src,
  title = "chem-0",
  width = 1720,
  height = 900,
  innerW = 1720,
  innerH = 862,
  style,
}) => {
  const chromeH = 38;
  const contentH = height - chromeH;
  const scale = Math.min(width / innerW, contentH / innerH);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 10,
        overflow: "hidden",
        background: palette.bg1,
        boxShadow:
          "0 30px 60px rgba(0,0,0,0.55), 0 6px 14px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          height: chromeH,
          background:
            "linear-gradient(180deg, #1c1c1c 0%, #121212 100%)",
          borderBottom: `1px solid ${palette.border1}`,
          display: "flex",
          alignItems: "center",
          paddingLeft: 14,
          paddingRight: 14,
          gap: 8,
          flexShrink: 0,
        }}
      >
        <Dot color="#E26C5C" />
        <Dot color="#E8B042" />
        <Dot color="#7DBE6A" />
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: type.sans,
            fontSize: 12,
            color: palette.text3,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </div>
        <div style={{ width: 60 }} />
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: palette.bg0,
        }}
      >
        <IFrame
          src={staticFile(src)}
          style={{
            width: innerW,
            height: innerH,
            border: 0,
            transform: `scale(${scale}) translate(0, 0)`,
            transformOrigin: "top left",
            background: palette.bg0,
          }}
        />
      </div>
    </div>
  );
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      width: 12,
      height: 12,
      borderRadius: 12,
      background: color,
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
    }}
  />
);
