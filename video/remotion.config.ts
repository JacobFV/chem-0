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
// Treat the project root as the public dir so staticFile() can read from
// the existing video/audio and video/assets directories without us having
// to shuffle everything into video/public/.
Config.setPublicDir(".");
