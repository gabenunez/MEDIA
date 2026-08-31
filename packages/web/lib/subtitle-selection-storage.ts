import {
  readPlaybackPreference,
  removePlaybackPreference,
  writePlaybackPreference,
} from "@/lib/playback-preference-storage";
import { isTvClient } from "@/lib/tv-mode-detect";

const STORAGE_PREFIX = "media:active-subtitle";

function storageKey(fileId: number, type: "movie" | "episode"): string {
  return `${STORAGE_PREFIX}:${type}:${fileId}`;
}

function readFromSessionStorage(
  fileId: number,
  type: "movie" | "episode",
): number | null {
  if (typeof window === "undefined" || !fileId || Number.isNaN(fileId)) return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(fileId, type));
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function readStoredSubtitleSelection(
  fileId: number,
  type: "movie" | "episode",
): number | null {
  if (!fileId || Number.isNaN(fileId)) return null;

  const raw = readPlaybackPreference(storageKey(fileId, type));
  if (raw) {
    const id = parseInt(raw, 10);
    if (Number.isFinite(id) && id > 0) return id;
  }

  if (!isTvClient()) return null;

  const legacy = readFromSessionStorage(fileId, type);
  if (legacy != null) {
    writeStoredSubtitleSelection(fileId, type, legacy);
    try {
      window.sessionStorage.removeItem(storageKey(fileId, type));
    } catch {
      // Ignore private browsing quota errors.
    }
  }
  return legacy;
}

export function writeStoredSubtitleSelection(
  fileId: number,
  type: "movie" | "episode",
  subtitleId: number | null,
): void {
  if (!fileId || Number.isNaN(fileId)) return;

  const key = storageKey(fileId, type);
  if (subtitleId == null) {
    removePlaybackPreference(key);
    if (isTvClient() && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Ignore private browsing quota errors.
      }
    }
    return;
  }

  writePlaybackPreference(key, String(subtitleId));
  if (isTvClient() && typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore private browsing quota errors.
    }
  }
}
