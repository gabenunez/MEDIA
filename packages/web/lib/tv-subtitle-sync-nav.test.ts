import { describe, expect, it, beforeEach } from "vitest";
import {
  TV_SUBTITLE_SYNC_HOLD_MS,
  TV_SUBTITLE_SYNC_STEP_EVENT,
  tryAdjustSubtitleSync,
} from "./tv-subtitle-sync-nav";

describe("TV subtitle timing remote", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="timing" type="button" data-tv-subtitle-sync></button>`;
  });

  it("steps earlier and later without leaving the row", () => {
    const timing = document.getElementById("timing")!;
    const steps: number[] = [];
    timing.addEventListener(TV_SUBTITLE_SYNC_STEP_EVENT, (event) => {
      steps.push((event as CustomEvent<number>).detail);
    });

    expect(tryAdjustSubtitleSync(timing, "left", { now: 1_000 })).toBe(true);
    expect(tryAdjustSubtitleSync(timing, "right", { now: 1_000 })).toBe(true);
    expect(steps).toEqual([-1, 1]);
  });

  it("ignores a held direction until the step interval elapses", () => {
    const timing = document.getElementById("timing")!;
    const steps: number[] = [];
    timing.addEventListener(TV_SUBTITLE_SYNC_STEP_EVENT, (event) => {
      steps.push((event as CustomEvent<number>).detail);
    });

    expect(tryAdjustSubtitleSync(timing, "right", { now: 2_000 })).toBe(true);
    expect(
      tryAdjustSubtitleSync(timing, "right", {
        now: 2_000 + TV_SUBTITLE_SYNC_HOLD_MS - 1,
        repeat: true,
      }),
    ).toBe(true);
    expect(
      tryAdjustSubtitleSync(timing, "right", {
        now: 2_000 + TV_SUBTITLE_SYNC_HOLD_MS,
        repeat: true,
      }),
    ).toBe(true);
    expect(steps).toEqual([1, 1]);
  });

  it("lets the opposite direction correct immediately", () => {
    const timing = document.getElementById("timing")!;
    const steps: number[] = [];
    timing.addEventListener(TV_SUBTITLE_SYNC_STEP_EVENT, (event) => {
      steps.push((event as CustomEvent<number>).detail);
    });

    expect(tryAdjustSubtitleSync(timing, "right", { now: 5_000 })).toBe(true);
    expect(tryAdjustSubtitleSync(timing, "right", { now: 5_040 })).toBe(true);
    expect(tryAdjustSubtitleSync(timing, "left", { now: 5_050 })).toBe(true);
    expect(steps).toEqual([1, -1]);
  });

  it("leaves other menu items alone", () => {
    const other = document.createElement("button");
    expect(tryAdjustSubtitleSync(other, "left", { now: 3_000 })).toBe(false);
  });
});
