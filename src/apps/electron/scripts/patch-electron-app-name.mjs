import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP_NAME = "Chem-0 Lab Console";

if (process.platform !== "darwin") {
  process.exit(0);
}

const plistPath = path.resolve(
  process.cwd(),
  "../../..",
  "node_modules/electron/dist/Electron.app/Contents/Info.plist"
);

if (!fs.existsSync(plistPath)) {
  console.warn(`Electron Info.plist not found at ${plistPath}`);
  process.exit(0);
}

function setPlistValue(key, value) {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath], { stdio: "ignore" });
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, plistPath], { stdio: "ignore" });
  }
}

setPlistValue("CFBundleName", APP_NAME);
setPlistValue("CFBundleDisplayName", APP_NAME);
