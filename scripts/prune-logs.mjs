#!/usr/bin/env node
/**
 * Trim a pino JSON log file to only entries from the last N days.
 *
 * Usage: node scripts/prune-logs.mjs <logFile> [retentionDays]
 *
 * pino lines look like {"level":30,"time":1794527486533,...}. We keep any line
 * whose `time` (epoch ms) is within the retention window, plus any line we
 * can't parse a timestamp from (so we never silently drop app output). The
 * rewrite is atomic — write a temp file, then rename over the original — so an
 * in-flight `>> reel.log` append is never corrupted.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DEFAULT_RETENTION_DAYS = 30;

export async function pruneLogFile(logFile, retentionDays = DEFAULT_RETENTION_DAYS) {
  if (!logFile || !fs.existsSync(logFile)) {
    return { kept: 0, removed: 0, skipped: true };
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const tmpFile = path.join(
    path.dirname(logFile),
    `.${path.basename(logFile)}.prune-${process.pid}.tmp`,
  );

  const input = fs.createReadStream(logFile, { encoding: "utf8" });
  const output = fs.createWriteStream(tmpFile, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let kept = 0;
  let removed = 0;

  for await (const line of rl) {
    if (line === "") continue;
    let keep = true;
    // Fast path: only JSON-parse lines that look like they carry a time field.
    const marker = line.indexOf('"time":');
    if (marker !== -1) {
      const match = line.slice(marker + 7).match(/^\s*(\d+)/);
      if (match) {
        keep = Number(match[1]) >= cutoff;
      }
    }
    if (keep) {
      output.write(line + "\n");
      kept++;
    } else {
      removed++;
    }
  }

  await new Promise((resolve, reject) => {
    output.end((err) => (err ? reject(err) : resolve()));
  });

  // Nothing to drop — avoid an unnecessary rename (and keep inode stable).
  if (removed === 0) {
    fs.rmSync(tmpFile, { force: true });
    return { kept, removed, skipped: false };
  }

  fs.renameSync(tmpFile, logFile);
  return { kept, removed, skipped: false };
}

// Run when invoked directly (not when imported by a test).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) {
  const logFile = process.argv[2];
  const retentionDays = process.argv[3] ? Number(process.argv[3]) : DEFAULT_RETENTION_DAYS;
  if (!logFile) {
    console.error("Usage: node scripts/prune-logs.mjs <logFile> [retentionDays]");
    process.exit(1);
  }
  pruneLogFile(logFile, retentionDays)
    .then(({ kept, removed, skipped }) => {
      if (skipped) return;
      if (removed > 0) {
        console.log(`Pruned ${removed} log line(s) older than ${retentionDays}d; kept ${kept}`);
      }
    })
    .catch((err) => {
      console.error(`Log prune failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}
