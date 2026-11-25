import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;
const THUMB_COLS = 10;
const THUMB_INTERVAL_SEC = 15;
const MAX_THUMBS = 240;

// Lower CPU and IO priority while competing with library scans.
const HAS_NICE = process.platform === "linux" || process.platform === "darwin";
const HAS_IONICE = process.platform === "linux";

type ThumbnailPaths = { vttPath: string; spritePath: string };

function formatVttTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function computeThumbInterval(durationSec: number): number {
  const naiveCount = Math.ceil(durationSec / THUMB_INTERVAL_SEC);
  if (naiveCount <= MAX_THUMBS) return THUMB_INTERVAL_SEC;
  return Math.ceil(durationSec / MAX_THUMBS);
}

export function buildVtt(
  spriteFilename: string,
  durationSec: number,
  intervalSec: number,
): string {
  const count = Math.max(1, Math.ceil(durationSec / intervalSec));
  const lines = ["WEBVTT", ""];

  for (let index = 0; index < count; index++) {
    const start = index * intervalSec;
    const end = Math.min(durationSec, start + intervalSec);
    const col = index % THUMB_COLS;
    const row = Math.floor(index / THUMB_COLS);
    const x = col * THUMB_WIDTH;
    const y = row * THUMB_HEIGHT;
    lines.push(
      `${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}`,
      `${spriteFilename}#xywh=${x},${y},${THUMB_WIDTH},${THUMB_HEIGHT}`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

export function thumbnailCacheDir(cacheRoot: string, type: string, fileId: number): string {
  return path.join(cacheRoot, "thumbnails", `${type}-${fileId}`);
}

export function getCachedThumbnailPaths(
  outputDir: string,
  fileMtimeMs?: number | null,
): ThumbnailPaths | null {
  const vttPath = path.join(outputDir, "thumbs.vtt");
  const vtt = fs.statSync(vttPath, { throwIfNoEntry: false });
  if (!vtt?.size || (fileMtimeMs != null && vtt.mtimeMs < fileMtimeMs)) return null;
  for (const name of ["sprite.webp", "sprite.jpg"]) {
    const spritePath = path.join(outputDir, name);
    if (fs.statSync(spritePath, { throwIfNoEntry: false })?.size) {
      return { vttPath, spritePath };
    }
  }
  return null;
}

/**
 * Run ffmpeg at a lowered scheduling priority when the OS supports it, so
 * sprite generation yields to scans and playback instead of pinning a core.
 */
async function runFfmpegLowPriority(args: string[], signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const options = { signal, timeout: 30_000, killSignal: "SIGKILL" as const };
  if (HAS_IONICE) {
    try {
      // `-t` still runs the command if the host won't set IO priority.
      await execFileAsync("ionice", [
        "-t", "-c", "2", "-n", "7", "nice", "-n", "19", "ffmpeg", ...args,
      ], options);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (HAS_NICE) {
    try {
      await execFileAsync("nice", ["-n", "19", "ffmpeg", ...args], options);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await execFileAsync("ffmpeg", args, options);
}

/**
 * Extract a single frame at `timeSec` using *input* seeking (`-ss` before
 * `-i`). ffmpeg jumps straight to the nearest keyframe and decodes only a
 * couple of frames, instead of decoding the whole file as an `fps=1/N` filter
 * would. Returns the frame path, or null if extraction produced nothing.
 */
async function extractFrame(
  filePath: string,
  timeSec: number,
  framePath: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    await runFfmpegLowPriority([
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      Math.max(0, timeSec).toFixed(3),
      "-threads", "1",
      "-i",
      filePath,
      "-map", "0:V:0",
      "-frames:v",
      "1",
      "-filter_threads", "1",
      "-vf",
      `scale=${THUMB_WIDTH}:${THUMB_HEIGHT}`,
      "-threads", "1",
      "-q:v",
      "5",
      "-y",
      framePath,
    ], signal);
  } catch {
    signal.throwIfAborted();
    return null;
  }
  return fs.statSync(framePath, { throwIfNoEntry: false })?.size ? framePath : null;
}

export async function ensureThumbnailSprite(
  filePath: string,
  outputDir: string,
  durationMs: number,
  signal: AbortSignal,
  fileMtimeMs?: number | null,
): Promise<ThumbnailPaths | null> {
  const cached = getCachedThumbnailPaths(outputDir, fileMtimeMs);
  if (cached) return cached;

  let framesDir: string | null = null;
  let outputTemp: string | null = null;
  try {
    signal.throwIfAborted();
    fs.mkdirSync(outputDir, { recursive: true });

    const durationSec = durationMs / 1000;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
    const intervalSec = computeThumbInterval(durationSec);
    const count = Math.max(1, Math.ceil(durationSec / intervalSec));
    const columns = Math.min(count, THUMB_COLS);
    const rows = Math.ceil(count / columns);
    const vttPath = path.join(outputDir, "thumbs.vtt");

    // Timestamps to sample, centered within each interval so a thumbnail is
    // representative of its window rather than the cut on the boundary.
    const timestamps = Array.from({ length: count }, (_, index) =>
      Math.min(durationSec - 0.1, index * intervalSec + intervalSec / 2),
    );

    framesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "media-thumbs-"),
    );

    const frameName = (index: number) => `f-${String(index).padStart(4, "0")}.jpg`;
    const missing: number[] = [];
    for (const [index, timeSec] of timestamps.entries()) {
      if (!await extractFrame(filePath, timeSec, path.join(framesDir, frameName(index)), signal)) {
        missing.push(index);
      }
    }

    // Bail only if we got nothing at all; a few missing frames (e.g. a seek
    // past the last keyframe) still yield a usable sprite.
    if (missing.length === count) return null;

    // The tile pass reads a contiguous `f-%04d.jpg` sequence and stops at the
    // first gap. Backfill any failed extraction with a black placeholder so
    // the grid stays aligned with the VTT cue -> cell mapping.
    if (missing.length > 0) {
      await runFfmpegLowPriority([
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=black:s=${THUMB_WIDTH}x${THUMB_HEIGHT}`,
        "-frames:v",
        "1",
        "-q:v",
        "5",
        "-threads", "1",
        "-y",
        path.join(framesDir, "blank.jpg"),
      ], signal);
      const blankPath = path.join(framesDir, "blank.jpg");
      for (const index of missing) {
        fs.copyFileSync(blankPath, path.join(framesDir, frameName(index)));
      }
    }

    // Stage the sprite beside its destination for an atomic rename. Cache
    // readers should never see an unfinished sprite or a partial VTT.
    outputTemp = fs.mkdtempSync(path.join(outputDir, ".build-"));
    const tileArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      "1",
      "-i",
      path.join(framesDir, "f-%04d.jpg"),
      "-filter_threads", "1",
      "-vf",
      `tile=${columns}x${rows}:padding=0:margin=0`,
      "-frames:v",
      "1",
      "-threads", "1",
      "-y",
    ];
    let spriteName = "sprite.webp";
    try {
      await runFfmpegLowPriority([
        ...tileArgs, "-c:v", "libwebp", "-quality", "65", "-compression_level", "4",
        path.join(outputTemp, spriteName),
      ], signal);
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof Error) || !/unknown encoder|encoder .* not found/i.test(error.message)) {
        throw error;
      }
      spriteName = "sprite.jpg";
      await runFfmpegLowPriority([
        ...tileArgs, "-q:v", "7", path.join(outputTemp, spriteName),
      ], signal);
    }
    signal.throwIfAborted();
    const spriteTemp = path.join(outputTemp, spriteName);
    if (!fs.statSync(spriteTemp, { throwIfNoEntry: false })?.size) return null;
    const vttTemp = path.join(outputTemp, "thumbs.vtt");
    const spritePath = path.join(outputDir, spriteName);
    fs.writeFileSync(vttTemp, buildVtt(spriteName, durationSec, intervalSec), "utf-8");
    fs.renameSync(spriteTemp, spritePath);
    fs.rmSync(path.join(outputDir, spriteName === "sprite.webp" ? "sprite.jpg" : "sprite.webp"), { force: true });
    fs.renameSync(vttTemp, vttPath);
    return { vttPath, spritePath };
  } catch (err) {
    if (!signal.aborted) console.warn(`Thumbnail generation failed for ${filePath}:`, err);
    return null;
  } finally {
    await Promise.all([framesDir, outputTemp].map((dir) =>
      dir ? fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}) : undefined,
    ));
  }
}
