const STORAGE_PREFIX = "media:active-subtitle";

function storageKey(fileId: number, type: "movie" | "episode"): string {
  return `${STORAGE_PREFIX}:${type}:${fileId}`;
}

export function readStoredSubtitleSelection(
  fileId: number,
  type: "movie" | "episode",
): number | null {
  if (typeof window === "undefined" || !fileId || Number.isNaN(fileId)) return null;

  try {
    const raw = sessionStorage.getItem(storageKey(fileId, type));
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeStoredSubtitleSelection(
  fileId: number,
  type: "movie" | "episode",
  subtitleId: number | null,
): void {
  if (typeof window === "undefined" || !fileId || Number.isNaN(fileId)) return;

  try {
    const key = storageKey(fileId, type);
    if (subtitleId == null) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, String(subtitleId));
  } catch {
    // Ignore private browsing quota errors.
  }
}
