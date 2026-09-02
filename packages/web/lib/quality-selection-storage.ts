import type { StreamQuality } from "@/lib/api";
import { isTvClient } from "@/lib/tv-mode-detect";

const STORAGE_KEY = "media:playback-quality";
const ITEM_STORAGE_KEY_PREFIX = "media:playback-quality:item:";

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
  if (!isTvClient()) return null;
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
  if (!isTvClient() || !VALID_QUALITIES.has(quality)) return;
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

/** Persist a quality for this title and as the next-video fallback. */
export function persistPlaybackQuality(
  quality: StreamQuality,
  item?: { itemType: string; itemId: number },
): void {
  writeStoredPlaybackQuality(quality);
  if (item) {
    writeStoredItemPlaybackQuality(item.itemType, item.itemId, quality);
  }
}
