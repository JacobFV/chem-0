import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { Card } from "../components/Card";
import { DotAlongArrow } from "../components/DotAlongArrow";
import { Typewriter } from "../components/Typewriter";
import { palette, type } from "../theme";

// Three cards laid out in a quiet flow: PROMPT → AGENT → ARM.
// A typewriter fills the prompt card. A colored dot then rides the arrow
// from PROMPT to AGENT, and another from AGENT to ARM, illustrating how a
// natural-language instruction becomes joint motion.
export const SceneApproach: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame, fps, config: { damping: 200 } });

  // Card geometry (in scene-px, scene is 1920x1080 full-bleed)
  const promptBox = { x: 140, y: 320, w: 460, h: 360 };
  const agentBox = { x: 740, y: 380, w: 440, h: 240 };
  const armBox = { x: 1320, y: 320, w: 460, h: 360 };

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 140,
          opacity: head,
        }}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 14,
            letterSpacing: 4,
            color: palette.inkMute,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          § iv — the approach
        </div>
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 64,
            color: palette.ink,
            lineHeight: 1.1,
          }}
        >
          A small recipe in the agent's hand.
        </div>
      </div>

      <Card
        label="prompt"
        x={promptBox.x}
        y={promptBox.y}
        width={promptBox.w}
        height={promptBox.h}
        delay={20}
        accent={palette.accent}
      >
        <div
          style={{
            fontFamily: type.mono,
            fontSize: 17,
            color: palette.inkSoft,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          <Typewriter
            start={40}
            text={`> connect_so101\n> observe()\n> view_camera(id=0)\n> set_position(\n    x=0.18, y=0.02, z=0.20,\n    gripper=20\n  )\n> dip_strip(vial="UNK_3")\n> read_color()\n> name_pH()`}
          />
        </div>
      </Card>

      <Card
        label="agent"
        x={agentBox.x}
        y={agentBox.y}
        width={agentBox.w}
        height={agentBox.h}
        delay={50}
        accent={palette.teal}
      >
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 24,
            color: palette.ink,
            marginBottom: 8,
          }}
        >
          gpt-5.5 · stdio MCP
        </div>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 14,
            color: palette.inkMute,
            lineHeight: 1.5,
          }}
        >
          translates intent → tool calls
          <br />
          remembers the trajectory, not the answer
          <br />
          asks before risky moves
        </div>
        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {["observe", "set_arm_pose", "set_position", "speak_to_human"].map(
            (tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: type.mono,
                  fontSize: 11,
                  border: `1px solid ${palette.rule}`,
                  padding: "2px 8px",
                  borderRadius: 999,
                  color: palette.inkSoft,
                  background: "#FBFAF6",
                }}
              >
                {tag}
              </span>
            ),
          )}
        </div>
      </Card>

      <Card
        label="arm"
        x={armBox.x}
        y={armBox.y}
        width={armBox.w}
        height={armBox.h}
        delay={80}
        accent={palette.ok}
      >
        <div
          style={{
            fontFamily: type.serif,
            fontSize: 24,
            color: palette.ink,
            marginBottom: 12,
          }}
        >
          SO-101 · mcp_so101
        </div>
        <JointReadout name="shoulder_pan" v={-109} />
        <JointReadout name="shoulder_lift" v={0} />
        <JointReadout name="elbow_flex" v={-70} />
        <JointReadout name="wrist_flex" v={0} />
        <JointReadout name="wrist_roll" v={-164} />
        <JointReadout name="gripper" v={"0.5"} />
      </Card>

      <DotAlongArrow
        from={{ x: promptBox.x + promptBox.w + 8, y: promptBox.y + 180 }}
        to={{ x: agentBox.x - 14, y: agentBox.y + 120 }}
        start={170}
        dotColor={palette.accent}
      />
      <DotAlongArrow
        from={{ x: agentBox.x + agentBox.w + 8, y: agentBox.y + 120 }}
        to={{ x: armBox.x - 14, y: armBox.y + 180 }}
        start={230}
        dotColor={palette.teal}
      />

      <Caption marker="IV.  approach" line="connect, observe, look, dip, lift, name the color, name the pH." />
    </Paper>
  );
};

const JointReadout: React.FC<{ name: string; v: number | string }> = ({
  name,
  v,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      borderBottom: `1px dashed ${palette.rule}`,
      padding: "5px 0",
      fontFamily: type.mono,
      fontSize: 14,
      color: palette.inkSoft,
    }}
  >
    <span>{name}</span>
    <span style={{ color: palette.ink }}>{v}</span>
  </div>
);
