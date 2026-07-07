import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBTITLE_STYLES,
  playbackSubtitleAppearance,
  previewSubtitleAppearance,
} from "./subtitle-styles";

describe("subtitle appearance", () => {
  it("scales preview size with the same ratios as playback", () => {
    const preview = previewSubtitleAppearance({
      ...DEFAULT_SUBTITLE_STYLES,
      size: "large",
    });
    const playback = playbackSubtitleAppearance({
      ...DEFAULT_SUBTITLE_STYLES,
      size: "large",
    });

    expect(preview.fontSize).toBe("3.1cqmin");
    expect(playback.fontSize).toBe("clamp(1.35rem, 3.1vmin, 1.95rem)");
  });

  it("uses native fractional height in native preview mode", () => {
    const preview = previewSubtitleAppearance(
      { ...DEFAULT_SUBTITLE_STYLES, size: "extra-large" },
      { nativePlayback: true },
    );

    expect(preview.fontSize).toBe("8cqh");
  });

  it("applies shared padding and colors", () => {
    const preview = previewSubtitleAppearance({
      ...DEFAULT_SUBTITLE_STYLES,
      background: "black",
      backgroundOpacity: "75",
      color: "yellow",
      opacity: "50",
    });

    expect(preview.color).toBe("rgba(255, 235, 59, 0.5)");
    expect(preview.backgroundColor).toBe("rgba(0, 0, 0, 0.75)");
    expect(preview.padding).toBe("0.2em 0.45em");
  });
});
