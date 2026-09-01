/** TV D-pad policy for the watch player — chrome must open on the first arrow. */

/** Spatial nav redispatches here after consuming native WebView D-pad. */
export const TV_WATCH_REMOTE_KEY_EVENT = "tv-watch-remote-key";

export function dispatchWatchRemoteKey(key: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TV_WATCH_REMOTE_KEY_EVENT, { detail: { key } }));
}

export const WATCH_CHROME_FOCUS_SELECTOR =
  "[data-tv-watch-controls], [data-tv-watch-menu], [data-tv-watch-next-episode], [data-tv-watch-error]";

export function isWatchChromeFocusTarget(el: Element | null): boolean {
  return Boolean(el?.closest(WATCH_CHROME_FOCUS_SELECTOR));
}

/**
 * Spatial nav captures D-pad to restore catalog focus. While the player is up,
 * that capture must not run — watch-view owns transport/scrub/hidden chrome.
 * Subtitle/quality/search menus still use catalog spatial nav — except when
 * chrome is hidden: Up/Down must reveal controls, not land in a stale menu.
 */
export function spatialNavShouldDeferToWatchPlayer(state: {
  watchPlayerActive: boolean;
  inWatchMenu: boolean;
  chromeVisible?: boolean;
}): boolean {
  if (!state.watchPlayerActive) return false;
  if (state.chromeVisible === false) return true;
  return !state.inWatchMenu;
}

/** True while the transport/title bar is mounted (Back hides it). */
export function isWatchPlayerChromeVisible(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.querySelector("[data-tv-watch-player]");
  if (!root) return false;
  const attr = root.getAttribute("data-tv-watch-chrome");
  if (attr === "hidden") return false;
  if (attr === "visible") return true;
  return Boolean(root.querySelector("[data-tv-watch-controls]"));
}

export function isDisplayedWatchMenu(menu: HTMLElement): boolean {
  if (menu.hidden || menu.getAttribute("aria-hidden") === "true") return false;
  if (menu.style.display === "none" || menu.style.visibility === "hidden") {
    return false;
  }
  return true;
}

export function getOpenWatchMenu(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const menus = document.querySelectorAll<HTMLElement>("[data-tv-watch-menu]");
  for (const menu of menus) {
    if (isDisplayedWatchMenu(menu)) return menu;
  }
  return null;
}

/** First D-pad after opening a menu lands focus inside it — never while chrome is hidden. */
export function shouldRetargetWatchMenuDpad(state: {
  chromeVisible: boolean;
  inWatchMenu: boolean;
  retargeted: boolean;
}): boolean {
  return state.chromeVisible && state.inWatchMenu && state.retargeted;
}

/**
 * When a player submenu is open, D-pad must target that menu — even if the
 * opener button still has the visual focus ring. Android WebView often leaves
 * activeElement on body and never moves data-tv-focused off the toolbar.
 */
export function resolveWatchMenuDpadTarget(active: HTMLElement | null): {
  active: HTMLElement | null;
  inWatchMenu: boolean;
  retargeted: boolean;
} {
  const menu = getOpenWatchMenu();
  if (!menu) {
    return {
      active,
      inWatchMenu: Boolean(active?.closest("[data-tv-watch-menu]")),
      retargeted: false,
    };
  }
  if (isWatchTextInputKeyTarget(document.activeElement)) {
    return {
      active: document.activeElement as HTMLElement,
      inWatchMenu: true,
      retargeted: false,
    };
  }
  if (active && menu.contains(active) && active.hasAttribute("data-tv-item")) {
    return { active, inWatchMenu: true, retargeted: false };
  }
  const menuFocused = menu.querySelector<HTMLElement>(
    "[data-tv-item][data-tv-focused]",
  );
  if (menuFocused) {
    return {
      active: menuFocused,
      inWatchMenu: true,
      retargeted: active !== menuFocused,
    };
  }
  const first =
    menu.querySelector<HTMLElement>("[data-tv-content-row] [data-tv-item]") ??
    menu.querySelector<HTMLElement>("[data-tv-item]");
  return {
    active: first ?? active,
    inWatchMenu: true,
    retargeted: first != null && first !== active,
  };
}

/** Transport L/R must not include nested subtitle/quality popover rows. */
export function getWatchTransportFocusItems(row: ParentNode | null): HTMLElement[] {
  if (!row) return [];
  return [...row.querySelectorAll<HTMLElement>("[data-tv-item]")].filter(
    (el) => !el.closest("[data-tv-watch-menu]"),
  );
}

/** Visual TV focus inside the player — Android WebView activeElement is often body. */
export function getWatchPlayerFocusedItem(): HTMLElement | null {
  const menu = getOpenWatchMenu();
  if (menu) {
    const menuFocused = menu.querySelector<HTMLElement>(
      "[data-tv-item][data-tv-focused]",
    );
    if (menuFocused) return menuFocused;
  }
  const visual = document.querySelector<HTMLElement>(
    "[data-tv-watch-player] [data-tv-item][data-tv-focused]",
  );
  if (visual) return visual;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (!active.closest("[data-tv-watch-player]")) return null;
  if (active.hasAttribute("data-tv-item")) return active;
  return active.closest("[data-tv-item]");
}

/** True when D-pad should stay in a text field instead of spatial nav. */
export function isWatchTextInputKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.hasAttribute("data-tv-item")) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
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
  if (state.key === "ArrowDown" || state.key === "ArrowUp") return "reveal-play";
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
  skipFeedbackVisible?: boolean;
  /**
   * When false, keep the WebView in front. Dropping alpha before ExoPlayer
   * paints a frame is a black screen, and Up/Down then only move invisible
   * focus instead of raising chrome.
   */
  nativePlaybackBegun?: boolean;
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
  if (state.nativePlaybackBegun === false) return true;
  return (
    state.controlsVisible ||
    state.blockingOverlayVisible ||
    state.showMidPlaybackBuffering ||
    Boolean(state.skipFeedbackVisible)
  );
}

/** Flip data-native-video only once ExoPlayer is presenting frames — not on buffered>0. */
export function shouldExposeNativeVideoSurface(state: {
  isPlaying: boolean;
  ready: boolean;
  isBuffering: boolean;
}): boolean {
  return state.isPlaying || (state.ready && !state.isBuffering);
}

export function nativeWebOverlayAlpha(state: NativeWebOverlayState): 0 | 1 {
  return nativeWebOverlayShouldRaise(state) ? 1 : 0;
}
