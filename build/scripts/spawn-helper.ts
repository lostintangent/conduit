import fs from "node:fs";
import path from "node:path";

/**
 * node-pty 1.1.0 publishes its prebuilt spawn-helper without the execute bit,
 * so every PTY spawn fails until it's restored. Remove this once node-pty 1.2.0,
 * which ships the helper as executable, is stable.
 */
export function makeSpawnHelperExecutable(root: string) {
  const prebuilds = path.join(root, "node_modules", "node-pty", "prebuilds");
  for (const dir of fs.readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, dir, "spawn-helper");
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
}
