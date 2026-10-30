import type { StreamQuality } from "@/lib/api";

const STORAGE_KEY = "media:playback-quality";
/**
 * Explicit menu choice for one file. A new prefix so older keys — including
 * the global fallback and qualities stamped onto every video that played —
 * are ignored and playback starts on the original file.
 */
const ITEM_STORAGE_KEY_PREFIX = "media:playback-quality:choice:";

const VALID_QUALITIES = new Set<StreamQuality>([
  "original",
  "2160p",
  "1080p",
  "720p",
  "480p",
]);

function itemStorageKey(itemType: string, itemId: number): string {
  return `${ITEM_STORAGE_KEY_PREFIX}${itemType}:${itemId}`;
}

function readQualityKey(key: string): StreamQuality | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || !VALID_QUALITIES.has(raw as StreamQuality)) return null;
    return raw as StreamQuality;
  } catch {
    return null;
  }
}

function writeQualityKey(key: string, quality: StreamQuality): void {
  if (!VALID_QUALITIES.has(quality)) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, quality);
  } catch {
    // Ignore private browsing quota errors.
  }
}

export function readStoredPlaybackQuality(): StreamQuality | null {
  return readQualityKey(STORAGE_KEY);
}

export function writeStoredPlaybackQuality(quality: StreamQuality): void {
  writeQualityKey(STORAGE_KEY, quality);
}

export function readStoredItemPlaybackQuality(
  itemType: string,
  itemId: number,
): StreamQuality | null {
  if (!itemType || !Number.isFinite(itemId)) return null;
  return readQualityKey(itemStorageKey(itemType, itemId));
}

export function writeStoredItemPlaybackQuality(
  itemType: string,
  itemId: number,
  quality: StreamQuality,
): void {
  if (!itemType || !Number.isFinite(itemId)) return;
  writeQualityKey(itemStorageKey(itemType, itemId), quality);
}

/** Remember a quality the viewer picked for this file. Other files stay on original. */
export function persistPlaybackQuality(
  quality: StreamQuality,
  item?: { itemType: string; itemId: number },
): void {
  if (!item) return;
  writeStoredItemPlaybackQuality(item.itemType, item.itemId, quality);
}
