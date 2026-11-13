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

// How many single-frame extractions to run at once. Each is a near-instant
// input-seek that decodes ~1 frame, so a small pool keeps the box responsive
// (scans, playback) while still finishing a full movie in seconds.
const EXTRACT_CONCURRENCY = 4;

// Lower CPU/IO priority so sprite generation can never starve library scans
// or playback on a busy host. Falls back to a plain ffmpeg call where the
// wrappers aren't available.
const HAS_NICE = process.platform === "linux" || process.platform === "darwin";
const HAS_IONICE = process.platform === "linux";

const pendingGenerations = new Set<string>();

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

export function getCachedThumbnailPaths(outputDir: string): {
  vttPath: string;
  spritePath: string;
} | null {
  const vttPath = path.join(outputDir, "thumbs.vtt");
  const spritePath = path.join(outputDir, "sprite.jpg");
  if (!fs.existsSync(vttPath) || !fs.existsSync(spritePath)) return null;
  return { vttPath, spritePath };
}

export function isThumbnailGenerationPending(outputDir: string): boolean {
  return pendingGenerations.has(outputDir);
}

/**
 * Run ffmpeg at a lowered scheduling priority when the OS supports it, so
 * sprite generation yields to scans and playback instead of pinning a core.
 */
async function runFfmpegLowPriority(args: string[]): Promise<void> {
  if (HAS_IONICE) {
    // Best-effort IO class, lowest niceness; wraps `nice -n 19 ffmpeg ...`.
    await execFileAsync("ionice", [
      "-c",
      "2",
      "-n",
      "7",
      "nice",
      "-n",
      "19",
      "ffmpeg",
      ...args,
    ]);
    return;
  }
  if (HAS_NICE) {
    await execFileAsync("nice", ["-n", "19", "ffmpeg", ...args]);
    return;
  }
  await execFileAsync("ffmpeg", args);
}

/** Bounded-concurrency map so we never fan out more than the pool size. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
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
): Promise<string | null> {
  try {
    await runFfmpegLowPriority([
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      timeSec.toFixed(3),
      "-i",
      filePath,
      "-an",
      "-sn",
      "-frames:v",
      "1",
      "-vf",
      `scale=${THUMB_WIDTH}:${THUMB_HEIGHT}`,
      "-q:v",
      "5",
      "-y",
      framePath,
    ]);
  } catch {
    return null;
  }
  return fs.existsSync(framePath) ? framePath : null;
}

export async function ensureThumbnailSprite(
  filePath: string,
  outputDir: string,
  durationMs: number,
): Promise<{ vttPath: string; spritePath: string } | null> {
  const cached = getCachedThumbnailPaths(outputDir);
  if (cached) return cached;

  if (pendingGenerations.has(outputDir)) return null;
  pendingGenerations.add(outputDir);

  let framesDir: string | null = null;
  try {
    fs.mkdirSync(outputDir, { recursive: true });

    const durationSec = Math.max(1, durationMs / 1000);
    const intervalSec = computeThumbInterval(durationSec);
    const count = Math.max(1, Math.ceil(durationSec / intervalSec));
    const rows = Math.ceil(count / THUMB_COLS);
    const spritePath = path.join(outputDir, "sprite.jpg");
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
    const framePaths = await mapWithConcurrency(
      timestamps,
      EXTRACT_CONCURRENCY,
      (timeSec, index) =>
        extractFrame(filePath, timeSec, path.join(framesDir!, frameName(index))),
    );

    // Bail only if we got nothing at all; a few missing frames (e.g. a seek
    // past the last keyframe) still yield a usable sprite.
    const haveAny = framePaths.some((p) => p !== null);
    if (!haveAny) return null;

    // The tile pass reads a contiguous `f-%04d.jpg` sequence and stops at the
    // first gap. Backfill any failed extraction with a black placeholder so
    // the grid stays aligned with the VTT cue -> cell mapping.
    const missing = framePaths.flatMap((p, index) => (p === null ? [index] : []));
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
        "-y",
        path.join(framesDir, "blank.jpg"),
      ]);
      const blankPath = path.join(framesDir, "blank.jpg");
      for (const index of missing) {
        try {
          fs.copyFileSync(blankPath, path.join(framesDir, frameName(index)));
        } catch {
          // If even the placeholder is unavailable, drop to a single-frame
          // sprite rather than failing the whole generation.
        }
      }
    }

    // Tile the already-decoded, already-scaled frames into one sprite. This
    // pass only reads tiny JPEGs, so it's effectively free.
    await runFfmpegLowPriority([
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      "1",
      "-i",
      path.join(framesDir, "f-%04d.jpg"),
      "-vf",
      `tile=${THUMB_COLS}x${rows}:padding=0:margin=0`,
      "-frames:v",
      "1",
      "-q:v",
      "5",
      "-y",
      spritePath,
    ]);

    if (!fs.existsSync(spritePath)) return null;

    fs.writeFileSync(
      vttPath,
      buildVtt("sprite.jpg", durationSec, intervalSec),
      "utf-8",
    );

    return { vttPath, spritePath };
  } catch (err) {
    console.warn(`Thumbnail generation failed for ${filePath}:`, err);
    return null;
  } finally {
    if (framesDir) {
      fs.rm(framesDir, { recursive: true, force: true }, () => {});
    }
    pendingGenerations.delete(outputDir);
  }
}
