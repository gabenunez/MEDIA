/** TV subtitle menu rows — reveal Remove with Right, collapse on vertical nav. */

export function hideSubtitleTrackActions(row: HTMLElement) {
  row.removeAttribute("data-tv-subtitle-actions-visible");
  const remove = row.querySelector<HTMLElement>("[data-tv-subtitle-remove]");
  if (remove) {
    remove.tabIndex = -1;
    remove.setAttribute("aria-hidden", "true");
  }
}

export function showSubtitleTrackActions(row: HTMLElement) {
  const remove = row.querySelector<HTMLElement>("[data-tv-subtitle-remove]");
  if (!remove) return null;
  row.setAttribute("data-tv-subtitle-actions-visible", "");
  remove.tabIndex = 0;
  remove.removeAttribute("aria-hidden");
  return remove;
}

export function collapseSubtitleTrackActions() {
  document
    .querySelectorAll<HTMLElement>(
      "[data-tv-subtitle-track-row][data-tv-subtitle-actions-visible]",
    )
    .forEach((row) => {
      const active = document.activeElement as HTMLElement | null;
      const remove = row.querySelector<HTMLElement>("[data-tv-subtitle-remove]");
      hideSubtitleTrackActions(row);
      if (remove && active === remove) {
        const track = row.querySelector<HTMLElement>("[data-tv-subtitle-track]");
        track?.focus({ preventScroll: true });
      }
    });
}

export function tryMoveSubtitleTrackActions(
  active: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  const row = active.closest<HTMLElement>("[data-tv-subtitle-track-row]");
  if (!row) return null;

  const track = row.querySelector<HTMLElement>("[data-tv-subtitle-track]");
  const remove = row.querySelector<HTMLElement>("[data-tv-subtitle-remove]");
  if (!track || !remove) return null;

  const visible = row.hasAttribute("data-tv-subtitle-actions-visible");

  if (direction === "right" && active === track && !visible) {
    return showSubtitleTrackActions(row);
  }

  if (direction === "left" && active === remove && visible) {
    hideSubtitleTrackActions(row);
    return track;
  }

  return null;
}
