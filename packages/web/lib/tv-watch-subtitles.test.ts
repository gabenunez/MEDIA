import { describe, expect, it } from "vitest";
import {
  hidePlaybackCaptions,
  hideWebSubtitleOverlay,
  shouldAutoHideWatchControls,
  shouldClearCaptionOverlayOnEmptied,
  shouldCloseWatchMenusOnRebuffer,
} from "./tv-watch-subtitles";

describe("TV watch caption policy", () => {
  it("keeps dialogue visible while the subtitle picker is open", () => {
    expect(
      hidePlaybackCaptions({
        subtitleSearchOpen: false,
      }),
    ).toBe(false);
  });

  it("hides dialogue only under the full-screen search sheet", () => {
    expect(hidePlaybackCaptions({ subtitleSearchOpen: true })).toBe(true);
  });

  it("skips the DOM subtitle overlay when native ExoPlayer renders captions", () => {
    expect(
      hideWebSubtitleOverlay({
        subtitleSearchOpen: false,
        usesNativePlayer: true,
      }),
    ).toBe(true);
    expect(
      hideWebSubtitleOverlay({
        subtitleSearchOpen: false,
        usesNativePlayer: false,
      }),
    ).toBe(false);
  });

  it("still hides the DOM overlay under the subtitle search sheet on web playback", () => {
    expect(
      hideWebSubtitleOverlay({
        subtitleSearchOpen: true,
        usesNativePlayer: false,
      }),
    ).toBe(true);
  });

  it("does not dismiss the subtitle menu on a mid-play rebuffer", () => {
    expect(shouldCloseWatchMenusOnRebuffer()).toBe(false);
  });

  it("never auto-hides watch chrome; controls dismiss on back only", () => {
    expect(
      shouldAutoHideWatchControls({
        autoHideRequested: true,
        playing: true,
        panelOpen: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoHideWatchControls({
        autoHideRequested: true,
        playing: true,
        panelOpen: false,
      }),
    ).toBe(false);
  });

  it("does not treat HLS emptied as the end of captions", () => {
    expect(shouldClearCaptionOverlayOnEmptied()).toBe(false);
  });
});
