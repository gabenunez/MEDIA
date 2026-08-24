import { describe, expect, it } from "vitest";
import {
  JS_BRIDGE_VTT_MAX_CHARS,
  canSendVttOverJsBridge,
  resolveNativeSubtitleApplyMode,
  resolveNativeSubtitleTransport,
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

  it("sends small VTT over the JS bridge and large tracks by URL", () => {
    expect(canSendVttOverJsBridge("WEBVTT\n")).toBe(true);
    expect(canSendVttOverJsBridge("x".repeat(JS_BRIDGE_VTT_MAX_CHARS + 1))).toBe(false);
    expect(
      resolveNativeSubtitleTransport({
        vtt: "WEBVTT\n",
        subtitleUrl: "https://media.example/api/subtitles/1",
      }),
    ).toBe("vtt");
    expect(
      resolveNativeSubtitleTransport({
        vtt: "x".repeat(JS_BRIDGE_VTT_MAX_CHARS + 1),
        subtitleUrl: "https://media.example/api/subtitles/1",
      }),
    ).toBe("url");
    expect(resolveNativeSubtitleTransport({})).toBe("off");
  });
});
