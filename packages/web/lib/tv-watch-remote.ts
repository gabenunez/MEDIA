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

/** Dedicated remote skip keys — D-pad arrows move between visible buttons. */
export function isWatchDedicatedSkipKey(key: string): boolean {
  return key === "MediaRewind" || key === "MediaFastForward";
}

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

export type WatchVisibleTransportArrowIntent = "skip-back" | "skip-forward" | "move-focus";

/**
 * Visible transport row (not the scrubber): rewind/FF skip; left/right
 * move between Play, skip, subtitles, and quality.
 */
export function watchVisibleTransportArrowIntent(
  key: string,
): WatchVisibleTransportArrowIntent | null {
  if (isWatchDedicatedSkipKey(key)) {
    return key === "MediaRewind" ? "skip-back" : "skip-forward";
  }
  if (key === "ArrowLeft" || key === "ArrowRight") return "move-focus";
  return null;
}

export type NativeWebOverlayState = {
  controlsVisible: boolean;
  blockingOverlayVisible: boolean;
  showMidPlaybackBuffering: boolean;
};

/**
 * Native TV WebView overlay alpha. Alpha 0 puts ExoPlayer in front of the
 * WebView, so HTML chrome is invisible and D-pad never reaches JS.
 *
 * Chrome that React considers visible MUST keep the overlay at 1 — including
 * at native playback start. Forcing 0 while showControls is already true
 * paints the control bar into a transparent WebView and it never comes back.
 */
export function nativeWebOverlayShouldRaise(state: NativeWebOverlayState): boolean {
  return (
    state.controlsVisible ||
    state.blockingOverlayVisible ||
    state.showMidPlaybackBuffering
  );
}

export function nativeWebOverlayAlpha(state: NativeWebOverlayState): 0 | 1 {
  return nativeWebOverlayShouldRaise(state) ? 1 : 0;
}
