import { describe, expect, it } from "vitest";
import {
  nextOptimizedImageUrl,
  PLAYBACK_IMAGE_QUALITY,
  snapNextImageQuality,
  snapNextImageWidth,
} from "./next-image-url";

describe("snapNextImageWidth", () => {
  it("maps common hero preload widths onto Next-allowed sizes", () => {
    expect(snapNextImageWidth(1280)).toBe(1200);
    expect(snapNextImageWidth(1200)).toBe(1200);
    expect(snapNextImageWidth(1920)).toBe(1920);
    expect(snapNextImageWidth(0)).toBe(1200);
  });
});

describe("snapNextImageQuality", () => {
  it("keeps allowlisted qualities and snaps 85/90 onto 80", () => {
    expect(snapNextImageQuality(75)).toBe(75);
    expect(snapNextImageQuality(80)).toBe(80);
    expect(snapNextImageQuality(PLAYBACK_IMAGE_QUALITY)).toBe(80);
    expect(snapNextImageQuality(85)).toBe(80);
    expect(snapNextImageQuality(90)).toBe(80);
  });
});

describe("nextOptimizedImageUrl", () => {
  it("never emits a disallowed w or q parameter", () => {
    const url = nextOptimizedImageUrl("/api/images/foo.jpg", 1280);
    expect(url).toContain("w=1200");
    expect(url).not.toContain("w=1280");
    expect(url).toContain("q=75");
    expect(url).not.toContain("q=80");
  });

  it("snaps hero preload quality onto the allowlist", () => {
    const url = nextOptimizedImageUrl("/api/images/still.jpg", 1920, 85);
    expect(url).toContain("w=1920");
    expect(url).toContain("q=80");
    expect(url).not.toContain("q=85");
  });
});
