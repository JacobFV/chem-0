import { fps } from "../theme";

const s = (sec: number) => Math.round(sec * fps);

// Scene durations are sized to the actual VO mp3s plus a short tail of
// breathing room. If you regenerate audio with different lengths, run
// `for f in video/audio/*.mp3; do afinfo "$f" | grep duration; done` and
// update both `durationFrames` and `audioDuration` here.
//
// audioDuration is in seconds and is used only to position the <Audio>
// component cleanly inside its scene; the actual mp3 length is canonical.
export const SCENES = [
  { id: "title", audio: "01_title.mp3", audioDuration: 7.4, durationFrames: s(10) },
  { id: "question", audio: "02_question.mp3", audioDuration: 23.4, durationFrames: s(26) },
  { id: "target", audio: "03_target.mp3", audioDuration: 24.6, durationFrames: s(27) },
  { id: "approach", audio: "04_approach.mp3", audioDuration: 27.1, durationFrames: s(30) },
  { id: "architecture", audio: "05_architecture.mp3", audioDuration: 32.3, durationFrames: s(36) },
  { id: "console", audio: "06_console.mp3", audioDuration: 22.2, durationFrames: s(26) },
  { id: "calibration", audio: "07_calibration.mp3", audioDuration: 52.6, durationFrames: s(56) },
  { id: "debugging", audio: "08_debugging.mp3", audioDuration: 24.6, durationFrames: s(28) },
  { id: "whatWeGot", audio: "09_whatwegot.mp3", audioDuration: 30.6, durationFrames: s(34) },
  { id: "nextTime", audio: "10_nexttime.mp3", audioDuration: 32.4, durationFrames: s(36) },
  { id: "end", audio: "11_end.mp3", audioDuration: 8.5, durationFrames: s(12) },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export const TOTAL_FRAMES = SCENES.reduce(
  (sum, sc) => sum + sc.durationFrames,
  0,
);
