import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "dist", "renderer");
mkdirSync(out, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  copyFileSync(join(root, "src", "renderer", file), join(out, file));
}
