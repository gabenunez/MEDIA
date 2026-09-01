export type MergeableSubtitleResult = {
  language: string;
  release: string;
  fileName?: string;
  downloadCount: number;
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Keep earlier groups (OpenSubtitles) when Wyzie returns the same release. */
export function mergeSubtitleSearchResults<T extends MergeableSubtitleResult>(
  groups: T[][],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const group of groups) {
    for (const item of group) {
      const identity = normalizeKey(item.fileName || item.release);
      if (!identity) continue;
      const key = `${item.language.toLowerCase()}:${identity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  merged.sort((a, b) => b.downloadCount - a.downloadCount);
  return merged;
}
