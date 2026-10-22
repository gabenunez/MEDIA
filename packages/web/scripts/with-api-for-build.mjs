import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webRoot, "../..");
const nextDir = path.join(webRoot, ".next");
const apiPort = process.env.MEDIA_PRERENDER_API_PORT ?? "18197";
const serverEntry = path.join(repoRoot, "packages/server/dist/index.js");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function waitForApi(maxMs = 30_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const status = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
      if (status.ok) return true;
    } catch {
      // API still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function stopProcess(child) {
  if (!child || child.pid == null) return;
  try {
    // Kill the whole prerender API group (node + ffprobe/youtube-dl children).
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // already exited
    }
  }
}

let apiProcess = null;

try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    console.log("[media] Cleared previous .next output");
  }

  let apiReady = false;

  if (fs.existsSync(serverEntry)) {
    apiProcess = spawn("node", [serverEntry], {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        MEDIA_API_ONLY: "1",
        MEDIA_INTERNAL_API_PORT: apiPort,
        MEDIA_PRERENDER_BUILD: "1",
      },
      stdio: "pipe",
    });
    apiProcess.unref();

    apiReady = await waitForApi();
    if (apiReady) {
      console.log(`MEDIA! API ready for build (port ${apiPort})`);
    } else {
      console.warn(
        "MEDIA! API did not start in time — catalog pages will render on demand.",
      );
    }
  } else {
    console.warn(
      "Server build missing — catalog pages will render on demand.",
    );
  }

  const buildEnv = {
    ...process.env,
    MEDIA_INTERNAL_API_URL: `http://127.0.0.1:${apiPort}`,
    ...(apiReady ? { MEDIA_PRERENDER_BUILD: "1" } : {}),
  };
  delete buildEnv.MEDIA_INTERNAL_API_PORT;
  delete buildEnv.MEDIA_PRERENDER_API_PORT;

  await run("pnpm", ["exec", "next", "build"], { cwd: webRoot, env: buildEnv });
  await run("node", ["scripts/copy-standalone-assets.mjs"], { cwd: webRoot });
  console.log("[media] Media pages are not pre-rendered; the first visit shows a loader");
} finally {
  stopProcess(apiProcess);
}
