import { describe, expect, it } from "vitest";
import { shouldUseTv4KAssets } from "./tv-mode-detect";

describe("TV 4K asset detection", () => {
  it("treats a 1920 CSS WebView with high DPR as 4K for artwork, not layout", () => {
    expect(shouldUseTv4KAssets(1920, 1920, 2)).toBe(true);
    expect(shouldUseTv4KAssets(3840, 1920, 1)).toBe(true);
    expect(shouldUseTv4KAssets(1920, 1920, 1)).toBe(false);
  });
});
