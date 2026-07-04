import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;
const THUMB_COLS = 10;
const THUMB_INTERVAL_SEC = 15;
const MAX_THUMBS = 240;

const pendingGenerations = new Set<string>();

function formatVttTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function computeThumbInterval(durationSec: number): number {
  const naiveCount = Math.ceil(durationSec / THUMB_INTERVAL_SEC);
  if (naiveCount <= MAX_THUMBS) return THUMB_INTERVAL_SEC;
  return Math.ceil(durationSec / MAX_THUMBS);
}

function buildVtt(
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

export async function ensureThumbnailSprite(
  filePath: string,
  outputDir: string,
  durationMs: number,
): Promise<{ vttPath: string; spritePath: string } | null> {
  const cached = getCachedThumbnailPaths(outputDir);
  if (cached) return cached;

  if (pendingGenerations.has(outputDir)) return null;
  pendingGenerations.add(outputDir);

  try {
    fs.mkdirSync(outputDir, { recursive: true });

    const durationSec = Math.max(1, durationMs / 1000);
    const intervalSec = computeThumbInterval(durationSec);
    const count = Math.max(1, Math.ceil(durationSec / intervalSec));
    const rows = Math.ceil(count / THUMB_COLS);
    const spritePath = path.join(outputDir, "sprite.jpg");
    const vttPath = path.join(outputDir, "thumbs.vtt");

    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      filePath,
      "-vf",
      `fps=1/${intervalSec},scale=${THUMB_WIDTH}:${THUMB_HEIGHT},tile=${THUMB_COLS}x${rows}`,
      "-frames:v",
      "1",
      "-q:v",
      "5",
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
    pendingGenerations.delete(outputDir);
  }
}
