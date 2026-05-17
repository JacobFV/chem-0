import React from "react";
import { palette, type } from "../theme";

// macOS-style mock window chrome used for all Electron UI scenes. Keeps the
// content area neutral so each scene can paint its own UI inside without
// fighting the chrome's styling.
export const MockWindow: React.FC<{
  title?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  toolbar?: React.ReactNode;
}> = ({ title = "chem-0 — lab console", width = 1500, height = 900, style, children, toolbar }) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 14,
        overflow: "hidden",
        background: "#FBFAF6",
        boxShadow:
          "0 30px 60px rgba(40,32,20,0.18), 0 6px 14px rgba(40,32,20,0.10), inset 0 0 0 1px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          height: 38,
          background: "linear-gradient(180deg, #F1ECDF 0%, #E7E1D1 100%)",
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
            fontSize: 13,
            color: palette.text3,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </div>
        <div style={{ width: 60 }} />
      </div>
      {toolbar ? (
        <div
          style={{
            height: 44,
            background: "#F4EFE3",
            borderBottom: `1px solid ${palette.border1}`,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 14,
            color: palette.text2,
            fontFamily: type.sans,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {toolbar}
        </div>
      ) : null}
      <div style={{ flex: 1, position: "relative" }}>{children}</div>
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
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
    }}
  />
);
