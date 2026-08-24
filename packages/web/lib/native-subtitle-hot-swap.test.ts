import { describe, expect, it } from "vitest";
import {
  resolveNativeSubtitleApplyMode,
  shouldRebuildNativePlaybackForSubtitleChange,
} from "./native-subtitle-hot-swap";

describe("native subtitle hot-swap", () => {
  it("uses an overlay when the TV shell can set captions", () => {
    expect(
      resolveNativeSubtitleApplyMode({
        setSubtitleVtt: () => true,
        setSubtitles: () => true,
      }),
    ).toBe("vtt-overlay");
    expect(
      resolveNativeSubtitleApplyMode({
        setSubtitles: () => true,
      }),
    ).toBe("url-overlay");
  });

  it("never rebuilds playback for overlay caption swaps", () => {
    expect(shouldRebuildNativePlaybackForSubtitleChange("vtt-overlay")).toBe(false);
    expect(shouldRebuildNativePlaybackForSubtitleChange("url-overlay")).toBe(false);
    expect(shouldRebuildNativePlaybackForSubtitleChange("rebuild-playback")).toBe(true);
  });
});
