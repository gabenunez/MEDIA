const MINUTE_MS = 60_000;

/**
 * Length of the ending credits a viewer usually skips.
 * Half-hour episodes get a short tail. Hour-long episodes get a few minutes.
 * Features get several minutes, capped so a pause in the last act still counts as in progress.
 */
export function creditTailMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;

  let tail: number;
  if (durationMs <= 35 * MINUTE_MS) {
    tail = Math.min(2 * MINUTE_MS, Math.max(45_000, durationMs * 0.08));
  } else if (durationMs <= 70 * MINUTE_MS) {
    tail = Math.min(4 * MINUTE_MS, Math.max(2 * MINUTE_MS, durationMs * 0.08));
  } else {
    tail = Math.min(12 * MINUTE_MS, Math.max(6 * MINUTE_MS, durationMs * 0.08));
  }

  return Math.min(tail, durationMs * 0.15);
}

/** True once playback has reached the credits, even if the file has not ended. */
export function isWatchCompleted(
  positionMs?: number | null,
  durationMs?: number | null,
): boolean {
  if (positionMs == null || durationMs == null) return false;
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs)) return false;
  if (durationMs < 30_000 || positionMs <= 0) return false;
  return positionMs >= durationMs - creditTailMs(durationMs);
}
