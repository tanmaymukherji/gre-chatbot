import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneDir = join(root, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  process.exit(0);
}

function copyFresh(source, target) {
  if (!existsSync(source)) {
    return;
  }

  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

copyFresh(join(root, ".next", "static"), join(standaloneDir, ".next", "static"));
copyFresh(join(root, "public"), join(standaloneDir, "public"));
