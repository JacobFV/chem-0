import { fps } from "../theme";

const s = (sec: number) => Math.round(sec * fps);

// Each scene's duration = its actual mp3 length + ~1.5s tail. If you
// regenerate audio with a different script, run:
//   for f in video/public/audio/*.mp3; do ffprobe -v error \
//     -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f"; done
// and reconcile this table.
export const SCENES = [
  { id: "title",        audio: "01_title.mp3",         durationFrames: s(9) },
  { id: "pitch",        audio: "02_pitch.mp3",         durationFrames: s(17) },
  { id: "console",      audio: "03_console.mp3",       durationFrames: s(19) },
  { id: "agent",        audio: "04_agent.mp3",         durationFrames: s(28.5) },
  { id: "calibration",  audio: "05_calibration.mp3",   durationFrames: s(18.5) },
  { id: "virtual",      audio: "06_virtual.mp3",       durationFrames: s(17.5) },
  { id: "vision",       audio: "07_vision.mp3",        durationFrames: s(22) },
  { id: "bo",           audio: "08_bo.mp3",            durationFrames: s(21) },
  { id: "architecture", audio: "09_architecture.mp3",  durationFrames: s(25) },
  { id: "status",       audio: "10_status.mp3",        durationFrames: s(20) },
  { id: "close",        audio: "11_close.mp3",         durationFrames: s(7) },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export const TOTAL_FRAMES = SCENES.reduce(
  (sum, sc) => sum + sc.durationFrames,
  0,
);
