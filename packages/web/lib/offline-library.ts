export const REMOVE_LOCAL_DOWNLOAD_CONFIRM =
  "Remove this download from this device? The original on your MEDIA! server is not deleted.";

export const REMOVE_ALL_LOCAL_DOWNLOADS_CONFIRM =
  "Remove every downloaded title from this device? Nothing on your MEDIA! server is deleted.";

export function sumOfflineBytes(
  items: Array<{ bytes?: number | null }>,
): number {
  return items.reduce((total, item) => {
    const bytes = item.bytes;
    return total + (typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0
      ? bytes
      : 0);
  }, 0);
}

/** 0 bytes is a real total on an empty library — not "Unknown". */
export function formatDownloadSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
