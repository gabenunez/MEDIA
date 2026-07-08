import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectInstallDir } from "./updates.js";

export function scheduleServerRestart(options: { rebuild?: boolean } = {}): void {
  const installDir = detectInstallDir();
  const script = path.join(installDir, "scripts/restart-prod.sh");
  if (!fs.existsSync(script)) {
    throw new Error("Missing scripts/restart-prod.sh");
  }

  const args = options.rebuild ? ["--rebuild"] : [];
  const child = spawn("bash", [script, ...args], {
    cwd: installDir,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      MEDIA_INSTALL_DIR: installDir,
      REEL_INSTALL_DIR: installDir,
    },
  });
  child.unref();
}
