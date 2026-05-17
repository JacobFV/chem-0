import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { fps, W, H } from "./theme";

// Total duration is the sum of scene durations declared in Main.tsx.
// Keep in sync with SCENE_LIST there.
import { TOTAL_FRAMES } from "./scenes/scenes";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={Main}
        durationInFrames={TOTAL_FRAMES}
        fps={fps}
        width={W}
        height={H}
      />
    </>
  );
};
