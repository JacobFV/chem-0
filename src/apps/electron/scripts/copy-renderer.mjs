import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(root, "../../..");
const out = join(root, "dist", "renderer");
mkdirSync(out, { recursive: true });

for (const stale of ["calibration.js", "calibration.js.map", "record.html", "train.html", "replay.html"]) {
  rmSync(join(out, stale), { force: true });
}

for (const file of ["index.html", "calibration.html", "workbench.html", "settings.html", "virtual-world.html", "styles.css", "record-styles.css", "virtual-world.css"]) {
  copyFileSync(join(root, "src", "renderer", file), join(out, file));
}

function wrapClassicScript(file) {
  const target = join(out, file);
  if (!existsSync(target)) return;
  const source = readFileSync(target, "utf8");
  if (source.startsWith("(function () {")) return;
  writeFileSync(target, `(function () {\nvar exports = {};\n${source}\n})();\n`);
}

for (const file of ["app-shell.js", "renderer.js", "workbench.js", "settings.js", "train.js", "replay.js", "virtual-world.js"]) {
  wrapClassicScript(file);
}

copyFileSync(join(root, "src", "renderer", "calibration3d.mjs"), join(out, "calibration3d.mjs"));
copyFileSync(join(root, "src", "renderer", "main3d.mjs"), join(out, "main3d.mjs"));
copyFileSync(join(root, "src", "renderer", "record3d.mjs"), join(out, "record3d.mjs"));
copyFileSync(join(root, "src", "renderer", "virtual-camera-streams.mjs"), join(out, "virtual-camera-streams.mjs"));
copyFileSync(join(root, "src", "renderer", "virtual-world3d.mjs"), join(out, "virtual-world3d.mjs"));

const vendorOut = join(out, "vendor");
mkdirSync(vendorOut, { recursive: true });
copyFileSync(join(repoRoot, "node_modules", "three", "build", "three.module.js"), join(vendorOut, "three.module.js"));
copyFileSync(join(repoRoot, "node_modules", "three", "build", "three.core.js"), join(vendorOut, "three.core.js"));
copyFileSync(
  join(repoRoot, "node_modules", "three", "examples", "jsm", "loaders", "STLLoader.js"),
  join(vendorOut, "STLLoader.js")
);
copyFileSync(
  join(repoRoot, "node_modules", "three", "examples", "jsm", "controls", "OrbitControls.js"),
  join(vendorOut, "OrbitControls.js")
);
copyFileSync(
  join(repoRoot, "node_modules", "three", "examples", "jsm", "controls", "TransformControls.js"),
  join(vendorOut, "TransformControls.js")
);

const robotAssetsOut = join(out, "robot-assets", "so101");
rmSync(robotAssetsOut, { recursive: true, force: true });
cpSync(join(repoRoot, "assets", "so101"), robotAssetsOut, { recursive: true });
