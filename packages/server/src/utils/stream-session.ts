import type { TranscodeQuality } from "@reel/shared";

export function createStreamSessionId(
  type: "movie" | "episode",
  fileId: number,
  quality: TranscodeQuality,
  startSeconds = 0,
): string {
  const start = Math.max(0, Math.floor(startSeconds));
  return `${type}-${fileId}-${quality}-${start}`;
}

export function createStreamSessionPrefix(
  type: "movie" | "episode",
  fileId: number,
  quality: TranscodeQuality,
): string {
  return `${type}-${fileId}-${quality}-`;
}
