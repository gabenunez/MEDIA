import {
  readPlaybackPreference,
  removePlaybackPreference,
  writePlaybackPreference,
} from "@/lib/playback-preference-storage";

const STORAGE_PREFIX = "media:subtitle-sync";
export const SUBTITLE_SYNC_STEP_SECONDS = 0.1;
export const SUBTITLE_SYNC_LIMIT_SECONDS = 30;

function storageKey(subtitleId: number): string {
  return `${STORAGE_PREFIX}:${subtitleId}`;
}

export function normalizeSubtitleSyncSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const stepped = Math.round(seconds * 10) / 10;
  return Math.min(
    SUBTITLE_SYNC_LIMIT_SECONDS,
    Math.max(-SUBTITLE_SYNC_LIMIT_SECONDS, stepped),
  );
}

export function stepSubtitleSync(current: number, direction: -1 | 1): number {
  return normalizeSubtitleSyncSeconds(current + direction * SUBTITLE_SYNC_STEP_SECONDS);
}

/** Positive delay shows cues later. Lookup time moves the other way. */
export function subtitleLookupSeconds(
  playbackSeconds: number,
  syncDelaySeconds: number,
): number {
  if (!Number.isFinite(playbackSeconds)) return 0;
  const delay = Number.isFinite(syncDelaySeconds) ? syncDelaySeconds : 0;
  return playbackSeconds - delay;
}

export function formatSubtitleSync(seconds: number): string {
  const rounded = normalizeSubtitleSyncSeconds(seconds);
  if (rounded === 0) return "0.0s";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(1)}s`;
}

export function readSubtitleSync(subtitleId: number | null): number {
  if (subtitleId == null || !Number.isFinite(subtitleId) || subtitleId <= 0) return 0;
  const raw = readPlaybackPreference(storageKey(subtitleId));
  if (!raw) return 0;
  return normalizeSubtitleSyncSeconds(Number.parseFloat(raw));
}

export function writeSubtitleSync(subtitleId: number, seconds: number): void {
  if (!Number.isFinite(subtitleId) || subtitleId <= 0) return;
  const normalized = normalizeSubtitleSyncSeconds(seconds);
  const key = storageKey(subtitleId);
  if (normalized === 0) {
    removePlaybackPreference(key);
    return;
  }
  writePlaybackPreference(key, normalized.toFixed(1));
}
