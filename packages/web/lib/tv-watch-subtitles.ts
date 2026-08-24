/** Watch-player caption/menu policy — keep captions on screen and menus usable. */

export function hidePlaybackCaptions(state: {
  subtitleSearchOpen: boolean;
}): boolean {
  // The search sheet covers the picture. Track pickers must not hide dialogue.
  return state.subtitleSearchOpen;
}

export function shouldCloseWatchMenusOnRebuffer(): boolean {
  return false;
}

export function shouldAutoHideWatchControls(state: {
  autoHideRequested: boolean;
  playing: boolean;
  panelOpen: boolean;
}): boolean {
  return state.autoHideRequested && state.playing && !state.panelOpen;
}

/** HLS `emptied` is a buffer reload, not the end of captions. */
export function shouldClearCaptionOverlayOnEmptied(): boolean {
  return false;
}
