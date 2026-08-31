/** TV D-pad policy for the watch player — chrome must open on the first arrow. */

export const WATCH_CHROME_FOCUS_SELECTOR =
  "[data-tv-watch-controls], [data-tv-watch-menu], [data-tv-watch-next-episode], [data-tv-watch-error]";

export function isWatchChromeFocusTarget(el: Element | null): boolean {
  return Boolean(el?.closest(WATCH_CHROME_FOCUS_SELECTOR));
}

/**
 * Spatial nav captures D-pad to restore catalog focus. While the player is up
 * and chrome is hidden, that capture must not run — watch-view owns the key.
 */
export function spatialNavShouldDeferToWatchPlayer(state: {
  watchPlayerActive: boolean;
  focusInsideWatchChrome: boolean;
}): boolean {
  return state.watchPlayerActive && !state.focusInsideWatchChrome;
}

export type WatchHiddenChromeArrowIntent = "reveal-play" | "skip-back" | "skip-forward";

/** D-pad with chrome hidden: reveal transport row or skip immediately. */
export function watchHiddenChromeArrowIntent(state: {
  key: string;
  showTransportControls: boolean;
}): WatchHiddenChromeArrowIntent | null {
  if (state.key === "ArrowDown") return "reveal-play";
  if (state.key === "ArrowUp") {
    return state.showTransportControls ? "reveal-play" : null;
  }
  if (!state.showTransportControls) return null;
  if (state.key === "ArrowLeft" || state.key === "MediaRewind") return "skip-back";
  if (state.key === "ArrowRight" || state.key === "MediaFastForward") return "skip-forward";
  return null;
}
