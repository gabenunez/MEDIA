import { describe, expect, it } from "vitest";
import {
  browserImageUrl,
  nextOptimizedImageUrl,
  PLAYBACK_IMAGE_QUALITY,
  shouldSkipImageOptimizer,
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

describe("browserImageUrl", () => {
  it("skips the optimizer for cached /api/images files so preload matches <img>", () => {
    expect(browserImageUrl("/api/images/foo.jpg", 256, 75)).toBe("/api/images/foo.jpg");
    expect(shouldSkipImageOptimizer("/api/images/foo.jpg")).toBe(true);
    expect(shouldSkipImageOptimizer("https://image.tmdb.org/t/p/w500/x.jpg")).toBe(false);
  });

  it("still builds optimizer URLs for non-artwork sources off TV", () => {
    expect(browserImageUrl("https://image.tmdb.org/t/p/w500/x.jpg", 256, 75)).toBe(
      nextOptimizedImageUrl("https://image.tmdb.org/t/p/w500/x.jpg", 256, 75),
    );
  });
});
