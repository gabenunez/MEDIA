import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectInstallDir } from "./updates.js";

function getConfigDir(): string {
  const mediaAppDir = path.join(os.homedir(), ".config/media-app");
  if (fs.existsSync(mediaAppDir)) return mediaAppDir;
  const legacyDir = path.join(os.homedir(), ".config/reel");
  if (fs.existsSync(legacyDir)) return legacyDir;
  return mediaAppDir;
}

export function scheduleServerRestart(options: { rebuild?: boolean } = {}): void {
  const installDir = detectInstallDir();
  const script = path.join(installDir, "scripts/restart-prod.sh");
  if (!fs.existsSync(script)) {
    throw new Error("Missing scripts/restart-prod.sh");
  }

  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const logPath = path.join(configDir, "restart.log");
  const logFd = fs.openSync(logPath, "a");
  fs.writeSync(
    logFd,
    `\n--- Restart scheduled ${new Date().toISOString()} rebuild=${Boolean(options.rebuild)} ---\n`,
  );

  const args = options.rebuild ? ["--rebuild"] : [];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MEDIA_INSTALL_DIR: installDir,
    REEL_INSTALL_DIR: installDir,
  };
  delete env.MEDIA_PUBLIC_PREFIX;

  const child = spawn("bash", [script, ...args], {
    cwd: installDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });
  child.unref();
  fs.closeSync(logFd);
}
