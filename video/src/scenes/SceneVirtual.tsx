import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Paper } from "../components/Paper";
import { Caption } from "../components/Caption";
import { ElectronFrame } from "../components/ElectronFrame";
import { MockCursor } from "../components/MockCursor";
import { palette, type } from "../theme";

// The virtual-world editor window. Same iframe trick; the static page is
// pre-seeded with a selected vial proxy so the right-hand transform
// panel reads populated. Cursor demonstrates the toolbox.
export const SceneVirtual: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });
  const W = 1720;
  const H = 920;
  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 56,
          opacity: t,
          fontFamily: type.mono,
          fontSize: 13,
          letterSpacing: 4,
          color: palette.accent,
          textTransform: "uppercase",
        }}
      >
        vii · virtual world editor
      </div>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: t }}>
        <div style={{ position: "relative" }}>
          <ElectronFrame
            src="electron/static_virtual_world.html"
            title="chem-0 · world editor · bench_world_v3"
            width={W}
            height={H}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: W,
              height: H,
              pointerEvents: "none",
            }}
          >
            <MockCursor
              path={[
                // Tour the toolbox (left), then the selected object panel (right)
                { frame: 0, x: W * 0.6, y: H * 0.5 },
                { frame: 60, x: 200, y: 240, click: true },
                { frame: 130, x: 200, y: 320, click: true },
                { frame: 200, x: 200, y: 480, click: true },
                { frame: 280, x: W - 200, y: 380, click: true },
                { frame: 600, x: W - 200, y: 380 },
              ]}
            />
          </div>
        </div>
      </AbsoluteFill>
      <Caption
        marker="vi · virtual world"
        line="Same backend. Same tools. Drag arms / cameras / lights / rigid bodies into the scene."
      />
    </Paper>
  );
};
