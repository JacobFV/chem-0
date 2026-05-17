import React from "react";
import { useCurrentFrame } from "remotion";
import { palette, type } from "../theme";

// Frame-accurate typewriter. Renders a stable container so layout doesn't
// jump as glyphs appear; only the visible characters change. A caret blinks
// at the end while typing and after typing completes.
export const Typewriter: React.FC<{
  text: string;
  start?: number; // frame when typing begins
  cps?: number; // characters per second
  style?: React.CSSProperties;
  showCaret?: boolean;
}> = ({ text, start = 0, cps = 26, style, showCaret = true }) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - start);
  const n = Math.min(text.length, Math.floor((elapsed / 30) * cps));
  const visible = text.slice(0, n);
  const caretOn = Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={{ fontFamily: type.mono, color: palette.text1, ...style }}>
      {visible}
      {showCaret ? (
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            marginLeft: 2,
            background: caretOn ? palette.text1 : "transparent",
            color: "transparent",
          }}
        >
          .
        </span>
      ) : null}
    </span>
  );
};
