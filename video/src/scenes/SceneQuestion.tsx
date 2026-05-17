import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { palette, type } from "../theme";

// A handwritten-feeling question, with three words emphasized sequentially:
// see / measure / contact. Layout is a wide quote-block, plenty of negative
// space, page number bottom.
export const SceneQuestion: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 200 } });

  const words = ["see", "measure", "contact"];
  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 200,
          right: 200,
          top: 160,
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
            marginBottom: 28,
          }}
        >
          § ii — the question
        </div>
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 64,
            lineHeight: 1.2,
            color: palette.ink,
          }}
        >
          Could a small, embodied agent learn to
          {" "}
          <EmphWord t={frame} delay={30} word={words[0]} />
          {" "}a chemistry —
          <br />
          not name it, not summarize it, not describe its color in fluent
          English —
          <br />
          but actually {" "}
          <EmphWord t={frame} delay={140} word={words[1]} />
          {" "}it,
          with its own eyes, its own hands, its own slow {" "}
          <EmphWord t={frame} delay={220} word={words[2]} />
          {" "}with the world?
        </div>
      </div>
      <Caption marker="II.  the question" line="A question, simple the way most useful questions are simple." delay={20} />
    </Paper>
  );
};

const EmphWord: React.FC<{ word: string; t: number; delay: number }> = ({
  word,
  t,
  delay,
}) => {
  const o = interpolate(t, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <span
      style={{
        fontStyle: "italic",
        color: palette.accent,
        background: `linear-gradient(transparent 75%, rgba(162,78,43,${0.18 * o}) 75%)`,
        padding: "0 2px",
      }}
    >
      {word}
    </span>
  );
};
