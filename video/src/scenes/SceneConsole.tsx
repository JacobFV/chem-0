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
import { ElectronFrame } from "../components/ElectronFrame";
import { MockCursor } from "../components/MockCursor";
import { palette, type } from "../theme";

// The actual Electron app, embedded as an iframe of the static seeded
// renderer build. The mock cursor runs a small choreography across the
// real chrome: appbar buttons, sidebar tab, the agent chat composer.
//
// The static page is 1500x880 internal; ElectronFrame scales it up to
// 1720x900. Cursor waypoints are in the *outer* window coords, so they
// align to the chrome buttons regardless of the iframe scale.
export const SceneConsole: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 220 } });
  const windowW = 1720;
  const windowH = 920;

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
        iv · the console
      </div>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: t }}>
        <div style={{ position: "relative" }}>
          <ElectronFrame
            src="electron/static_index.html"
            title="chem-0 · exp_a3f9 · ph_strips · unknowns"
            width={windowW}
            height={windowH}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: windowW,
              height: windowH,
              pointerEvents: "none",
            }}
          >
            <MockCursor
              path={[
                // Demo path: start at composer (RHS), hop to left appbar (Worlds tab),
                // back to right appbar (Cameras tab), then to the calibrate button.
                { frame: 0, x: windowW - 240, y: windowH - 90 },
                { frame: 40, x: 180, y: 48, click: true },
                { frame: 110, x: 220, y: 48, click: true },
                { frame: 180, x: windowW - 360, y: 48, click: true },
                { frame: 260, x: windowW - 250, y: 48, click: true },
                { frame: 340, x: windowW - 420, y: 48, click: true },
                { frame: 600, x: windowW - 420, y: 48 },
              ]}
            />
          </div>
        </div>
      </AbsoluteFill>
      <Caption
        marker="iv · the console"
        line="The real app: experiments / worlds / arms / artifacts · live pH plot · agent chat."
      />
    </Paper>
  );
};
