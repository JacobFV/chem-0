import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
// Disk is tight on this machine; intermediate frames only feed into ffmpeg
// so a lower JPEG quality saves ~40% scratch space without harming the
// final h264 quality.
Config.setJpegQuality(70);
Config.setOverwriteOutput(true);
Config.setConcurrency(1);
Config.setEntryPoint("./src/index.ts");
// Three.js needs a real GL backend. "angle-egl" works on macOS and Linux;
// switch to "swangle" if rendering inside Remotion Lambda.
Config.setChromiumOpenGlRenderer("angle-egl");
// Default public dir (public/) holds audio/, assets/, and electron/ —
// staticFile() will resolve relative to that.
