import type { StreamQuality } from "@/lib/api";
import { isTvClient } from "@/lib/tv-mode-detect";

const STORAGE_KEY = "media:playback-quality";

const VALID_QUALITIES = new Set<StreamQuality>([
  "original",
  "2160p",
  "1080p",
  "720p",
  "480p",
]);

export function readStoredPlaybackQuality(): StreamQuality | null {
  if (!isTvClient()) return null;

  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw || !VALID_QUALITIES.has(raw as StreamQuality)) return null;
    return raw as StreamQuality;
  } catch {
    return null;
  }
}

export function writeStoredPlaybackQuality(quality: StreamQuality): void {
  if (!isTvClient() || !VALID_QUALITIES.has(quality)) return;

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // Ignore private browsing quota errors.
  }
}
