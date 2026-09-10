import { describe, expect, it } from "vitest";
import {
  NEXT_EPISODE_COUNTDOWN_SECONDS,
  remainingInNextEpisodeWindow,
} from "./playback-utils";

describe("remainingInNextEpisodeWindow", () => {
  it("is null until the final countdown window", () => {
    expect(remainingInNextEpisodeWindow(100, 200)).toBeNull();
    expect(
      remainingInNextEpisodeWindow(200 - NEXT_EPISODE_COUNTDOWN_SECONDS - 0.01, 200),
    ).toBeNull();
  });

  it("returns remaining seconds inside the window", () => {
    expect(remainingInNextEpisodeWindow(185, 200)).toBe(15);
    expect(remainingInNextEpisodeWindow(190, 200)).toBe(10);
    expect(remainingInNextEpisodeWindow(199.2, 200)).toBeCloseTo(0.8);
    expect(remainingInNextEpisodeWindow(200, 200)).toBe(0);
    expect(remainingInNextEpisodeWindow(205, 200)).toBe(0);
  });

  it("rejects invalid durations", () => {
    expect(remainingInNextEpisodeWindow(10, 0)).toBeNull();
    expect(remainingInNextEpisodeWindow(Number.NaN, 100)).toBeNull();
  });
});

describe("NEXT_EPISODE_COUNTDOWN_SECONDS", () => {
  it("shows the prompt for the last 15 seconds of playback", () => {
    expect(NEXT_EPISODE_COUNTDOWN_SECONDS).toBe(15);
  });
});
