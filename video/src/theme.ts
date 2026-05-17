// Palette mirrors the real Electron app: src/apps/electron/src/renderer/styles.css
// We use the same tokens so the Remotion frame and the embedded UI feel
// continuous instead of like two different apps spliced together.
export const palette = {
  // matching :root in styles.css
  bg0: "#000000",
  bg1: "#050505",
  bg2: "#0a0a0a",
  bg3: "#101010",
  bgHover: "#141414",

  border1: "#1a1a1a",
  border2: "#2a2a2a",
  borderFocus: "#444444",

  text1: "#ededed",
  text2: "#a8a8a8",
  text3: "#6b6b6b",
  text4: "#404040",

  accent: "#f5d76e",
  accentSoft: "rgba(245, 215, 110, 0.10)",
  accentStrong: "rgba(245, 215, 110, 0.28)",

  warn: "#d8a64f",
  danger: "#ff5a5a",
  ok: "#7DBE6A",
};

export const type = {
  sans:
    "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  // Kept for the rare display moment (title card). Most type is sans/mono.
  display:
    "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

export const fps = 30;
export const W = 1920;
export const H = 1080;
