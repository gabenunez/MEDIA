import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureTvMarqueeShift, tvMarqueeShiftPx } from "./tv-marquee";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("tvMarqueeShiftPx", () => {
  it("returns 0 when the label already fits", () => {
    expect(tvMarqueeShiftPx(120, 120)).toBe(0);
    expect(tvMarqueeShiftPx(120, 119)).toBe(0);
    expect(tvMarqueeShiftPx(0, 80)).toBe(0);
  });

  it("shifts left by the clipped overflow", () => {
    expect(tvMarqueeShiftPx(120, 180)).toBe(-60);
  });

  it("reads overflow from the text node", () => {
    expect(
      measureTvMarqueeShift(
        { clientWidth: 120 } as HTMLElement,
        { scrollWidth: 200 } as HTMLElement,
      ),
    ).toBe(-80);
  });
});

describe("TV poster episode marquee — wiring (do not revert)", () => {
  const poster = readFileSync(
    path.join(webRoot, "components/tv/tv-poster.tsx"),
    "utf8",
  );
  const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");

  it("marquees overflowing episode titles only while the poster is focused", () => {
    expect(poster).toContain("measureTvMarqueeShift");
    expect(poster).toContain("data-tv-marquee");
    expect(poster).toContain("tv-poster-subtitle-text");
    expect(css).toContain("@keyframes tv-poster-marquee");
    expect(css).toContain("data-tv-marquee");
    expect(css).toContain("tv-poster-subtitle-text");
    expect(css).toContain("animation: tv-poster-marquee");
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.tv-poster-subtitle-text[\s\S]*?animation:\s*none/,
    );
  });
});
