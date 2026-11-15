/**
 * TV episode list rows — the per-episode action buttons ("Start from beginning",
 * "Mark watched") stay out of the vertical Up/Down flow and are revealed with
 * Right (then collapsed on any vertical move), mirroring the subtitle track
 * "Remove" action.
 *
 * Without this, the action buttons sit inline in the single vertical row of
 * [data-tv-item]s, so pressing Down off an episode lands on its action buttons
 * instead of the next episode, and they'd be selectable by default while
 * scrolling the list.
 */

function actionButtons(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>("[data-tv-episode-action]"));
}

export function hideEpisodeActions(row: HTMLElement) {
  row.removeAttribute("data-tv-episode-actions-visible");
  for (const action of actionButtons(row)) {
    action.tabIndex = -1;
    action.setAttribute("aria-hidden", "true");
  }
}

/** Reveal the action buttons and return the first one (the focus target). */
export function showEpisodeActions(row: HTMLElement): HTMLElement | null {
  const actions = actionButtons(row);
  if (actions.length === 0) return null;
  row.setAttribute("data-tv-episode-actions-visible", "");
  for (const action of actions) {
    action.tabIndex = 0;
    action.removeAttribute("aria-hidden");
  }
  return actions[0];
}

/** Collapse every revealed action group; refocus the episode if an action
 * currently holds focus (so it doesn't vanish under the focus ring). */
export function collapseEpisodeActions() {
  document
    .querySelectorAll<HTMLElement>(
      "[data-tv-episode-row][data-tv-episode-actions-visible]",
    )
    .forEach((row) => {
      const active = document.activeElement as HTMLElement | null;
      const holdsFocus = active != null && row.contains(active) &&
        active.hasAttribute("data-tv-episode-action");
      hideEpisodeActions(row);
      if (holdsFocus) {
        const play = row.querySelector<HTMLElement>("[data-tv-episode-play]");
        play?.focus({ preventScroll: true });
      }
    });
}

/**
 * Right on the episode reveals its action buttons (returns the first to focus);
 * Left from the first action hides them and returns to the episode. Returns the
 * element to focus, or null when this row/direction isn't ours to handle (so
 * normal horizontal nav — e.g. moving between the revealed actions — proceeds).
 */
export function tryMoveEpisodeActions(
  active: HTMLElement,
  direction: "left" | "right",
): HTMLElement | null {
  const row = active.closest<HTMLElement>("[data-tv-episode-row]");
  if (!row) return null;

  const play = row.querySelector<HTMLElement>("[data-tv-episode-play]");
  const actions = actionButtons(row);
  if (!play || actions.length === 0) return null;

  const visible = row.hasAttribute("data-tv-episode-actions-visible");

  if (direction === "right" && active === play && !visible) {
    return showEpisodeActions(row);
  }

  if (direction === "left" && active === actions[0] && visible) {
    hideEpisodeActions(row);
    return play;
  }

  return null;
}
