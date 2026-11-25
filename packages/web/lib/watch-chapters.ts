import type { MediaChapter } from "@media-app/shared";

export function activeWatchChapterIndex(chapters: readonly MediaChapter[], positionMs: number): number {
  // The server sorts chapters by start. A file may have a lead-in before the first entry.
  let left = 0;
  let right = chapters.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (chapters[middle]!.startMs <= positionMs) left = middle + 1;
    else right = middle;
  }
  return left - 1;
}
