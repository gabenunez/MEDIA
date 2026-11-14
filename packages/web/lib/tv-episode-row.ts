/**
 * TV episode list rows — the per-episode "Start from beginning" restart button
 * stays out of the vertical Up/Down flow and is revealed with Right (then
 * collapsed on any vertical move), mirroring the subtitle track "Remove" action.
 *
 * Without this, the restart button sits inline in the single vertical row of
 * [data-tv-item]s, so pressing Down off a resumable episode lands on its restart
 * button instead of the next episode.
 */

export function hideEpisodeRestart(row: HTMLElement) {
  row.removeAttribute("data-tv-episode-restart-visible");
  const restart = row.querySelector<HTMLElement>("[data-tv-episode-restart]");
  if (restart) {
    restart.tabIndex = -1;
    restart.setAttribute("aria-hidden", "true");
  }
}

export function showEpisodeRestart(row: HTMLElement): HTMLElement | null {
  const restart = row.querySelector<HTMLElement>("[data-tv-episode-restart]");
  if (!restart) return null;
  row.setAttribute("data-tv-episode-restart-visible", "");
  restart.tabIndex = 0;
  restart.removeAttribute("aria-hidden");
  return restart;
}

/** Collapse every revealed restart action; refocus the episode if the restart
 * button currently holds focus (so it doesn't vanish under the focus ring). */
export function collapseEpisodeRestarts() {
  document
    .querySelectorAll<HTMLElement>(
      "[data-tv-episode-row][data-tv-episode-restart-visible]",
    )
    .forEach((row) => {
      const active = document.activeElement as HTMLElement | null;
      const restart = row.querySelector<HTMLElement>("[data-tv-episode-restart]");
      hideEpisodeRestart(row);
      if (restart && active === restart) {
        const play = row.querySelector<HTMLElement>("[data-tv-episode-play]");
        play?.focus({ preventScroll: true });
      }
    });
}

/**
 * Right reveals the restart button (returns it to focus); Left from the restart
 * button hides it and returns to the episode. Returns the element to focus, or
 * null when this row/direction isn't applicable.
 */
export function tryMoveEpisodeRestart(
  active: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  const row = active.closest<HTMLElement>("[data-tv-episode-row]");
  if (!row) return null;

  const play = row.querySelector<HTMLElement>("[data-tv-episode-play]");
  const restart = row.querySelector<HTMLElement>("[data-tv-episode-restart]");
  if (!play || !restart) return null;

  const visible = row.hasAttribute("data-tv-episode-restart-visible");

  if (direction === "right" && active === play && !visible) {
    return showEpisodeRestart(row);
  }

  if (direction === "left" && active === restart && visible) {
    hideEpisodeRestart(row);
    return play;
  }

  return null;
}
