import { shouldScheduleWatchChromeHide } from "./watch-helpers";

/** Watch-player caption/menu policy — keep captions on screen and menus usable. */

export function hidePlaybackCaptions(state: {
  subtitleSearchOpen: boolean;
}): boolean {
  // The search sheet covers the picture. Track pickers must not hide dialogue.
  return state.subtitleSearchOpen;
}

export function hideWebSubtitleOverlay(state: {
  subtitleSearchOpen: boolean;
  usesNativePlayer: boolean;
}): boolean {
  // Native ExoPlayer renders captions on the video — skip the DOM overlay.
  if (state.usesNativePlayer) return true;
  return hidePlaybackCaptions({ subtitleSearchOpen: state.subtitleSearchOpen });
}

export function shouldCloseWatchMenusOnRebuffer(): boolean {
  return false;
}

export function shouldAutoHideWatchControls(state: {
  autoHideRequested: boolean;
  playing: boolean;
  panelOpen: boolean;
}): boolean {
  return shouldScheduleWatchChromeHide(state);
}

/** HLS `emptied` is a buffer reload, not the end of captions. */
export function shouldClearCaptionOverlayOnEmptied(): boolean {
  return false;
}
