/** Resolve the watch menu's vertical list when focus sits on a nested subtitle row. */

export function findWatchMenuVerticalRow(active: HTMLElement): HTMLElement | null {
  const subtitleTrackRow = active.closest<HTMLElement>("[data-tv-subtitle-track-row]");
  if (subtitleTrackRow) {
    return subtitleTrackRow.closest<HTMLElement>("[data-tv-row][data-tv-vertical]");
  }
  return active.closest<HTMLElement>("[data-tv-row][data-tv-vertical]");
}

export function nextWatchMenuVerticalItem(
  active: HTMLElement,
  direction: "up" | "down",
  items: HTMLElement[],
): HTMLElement | null {
  const index = items.indexOf(active);
  if (index === -1) return null;
  if (direction === "down" && index < items.length - 1) return items[index + 1] ?? null;
  if (direction === "up" && index > 0) return items[index - 1] ?? null;
  return null;
}
