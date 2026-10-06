import { describe, expect, it } from "vitest";
import { creditTailMs, isWatchCompleted } from "./watch-progress.js";

const MINUTE = 60_000;

describe("isWatchCompleted", () => {
  it("treats the credit roll as finished for a feature", () => {
    const duration = 120 * MINUTE;
    const tail = creditTailMs(duration);
    expect(tail).toBeGreaterThanOrEqual(6 * MINUTE);
    expect(tail).toBeLessThanOrEqual(12 * MINUTE);
    expect(isWatchCompleted(duration - tail, duration)).toBe(true);
    expect(isWatchCompleted(duration - tail - 30_000, duration)).toBe(false);
    expect(isWatchCompleted(duration / 2, duration)).toBe(false);
  });

  it("uses a shorter credit tail for episodes", () => {
    const halfHour = 22 * MINUTE;
    const hour = 60 * MINUTE;
    expect(creditTailMs(halfHour)).toBeLessThanOrEqual(2 * MINUTE);
    expect(creditTailMs(hour)).toBeLessThanOrEqual(4 * MINUTE);
    expect(isWatchCompleted(halfHour - 60_000, halfHour)).toBe(true);
    expect(isWatchCompleted(15 * MINUTE, halfHour)).toBe(false);
  });

  it("does not treat a missing duration as finished", () => {
    expect(isWatchCompleted(120_000, null)).toBe(false);
    expect(isWatchCompleted(120_000, 1)).toBe(false);
    expect(isWatchCompleted(0, 120 * MINUTE)).toBe(false);
  });
});
