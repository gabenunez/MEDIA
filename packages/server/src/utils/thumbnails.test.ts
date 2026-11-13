import { describe, expect, it } from "vitest";
import { buildVtt, computeThumbInterval } from "./thumbnails.js";

const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;
const THUMB_COLS = 10;

describe("computeThumbInterval", () => {
  it("uses the base 15s interval for short/medium files", () => {
    expect(computeThumbInterval(600)).toBe(15); // 40 thumbs
    expect(computeThumbInterval(3600)).toBe(15); // 240 thumbs (at the cap)
  });

  it("widens the interval so long files stay under the thumbnail cap", () => {
    // A 3-hour film would be 720 thumbs at 15s; must stretch past 15s.
    const interval = computeThumbInterval(3 * 3600);
    expect(interval).toBeGreaterThan(15);
    expect(Math.ceil((3 * 3600) / interval)).toBeLessThanOrEqual(240);
  });
});

describe("buildVtt", () => {
  it("emits one cue per interval", () => {
    const vtt = buildVtt("sprite.jpg", 600, 15);
    expect((vtt.match(/-->/g) ?? []).length).toBe(40);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
  });

  it("maps cue index to the expected grid cell (alignment contract)", () => {
    const vtt = buildVtt("sprite.jpg", 600, 15);
    const cells = [...vtt.matchAll(/sprite\.jpg#xywh=(\d+),(\d+),(\d+),(\d+)/g)];
    expect(cells.length).toBe(40);

    cells.forEach((cell, index) => {
      const [, x, y, w, h] = cell.map(Number);
      const col = index % THUMB_COLS;
      const row = Math.floor(index / THUMB_COLS);
      expect(x).toBe(col * THUMB_WIDTH);
      expect(y).toBe(row * THUMB_HEIGHT);
      expect(w).toBe(THUMB_WIDTH);
      expect(h).toBe(THUMB_HEIGHT);
    });
  });

  it("clamps the final cue to the real duration", () => {
    const vtt = buildVtt("sprite.jpg", 20, 15);
    // 20s / 15s => 2 cues; last cue ends at 20.000, not 30.000.
    expect(vtt).toContain("00:00:15.000 --> 00:00:20.000");
  });
});
