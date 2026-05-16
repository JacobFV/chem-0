import { cpSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(root, "../../..");
const out = join(root, "dist", "renderer");
mkdirSync(out, { recursive: true });
rmSync(join(out, "calibration.js"), { force: true });
rmSync(join(out, "calibration.js.map"), { force: true });

for (const file of ["index.html", "calibration.html", "styles.css"]) {
  copyFileSync(join(root, "src", "renderer", file), join(out, file));
}
copyFileSync(join(root, "src", "renderer", "calibration3d.mjs"), join(out, "calibration3d.mjs"));

const vendorOut = join(out, "vendor");
mkdirSync(vendorOut, { recursive: true });
copyFileSync(join(repoRoot, "node_modules", "three", "build", "three.module.js"), join(vendorOut, "three.module.js"));
copyFileSync(join(repoRoot, "node_modules", "three", "build", "three.core.js"), join(vendorOut, "three.core.js"));
copyFileSync(
  join(repoRoot, "node_modules", "three", "examples", "jsm", "loaders", "STLLoader.js"),
  join(vendorOut, "STLLoader.js")
);

const robotAssetsOut = join(out, "robot-assets", "so101");
rmSync(robotAssetsOut, { recursive: true, force: true });
cpSync(join(repoRoot, "assets", "so101"), robotAssetsOut, { recursive: true });
