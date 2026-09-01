import { describe, expect, it } from "vitest";
import {
  canResumePlayback,
  getPlaybackButtonLabel,
  resolveWatchInitialResumeSeconds,
} from "./utils";

describe("canResumePlayback", () => {
  it("requires progress inside the 2–95% window", () => {
    expect(canResumePlayback(null, 3_600_000)).toBe(false);
    expect(canResumePlayback(0, 3_600_000)).toBe(false);
    expect(canResumePlayback(60_000, 3_600_000)).toBe(false);
    expect(canResumePlayback(72_001, 3_600_000)).toBe(true);
    expect(canResumePlayback(600_000, 3_600_000)).toBe(true);
    expect(canResumePlayback(3_420_000, 3_600_000)).toBe(false);
  });
});

describe("getPlaybackButtonLabel", () => {
  it("labels resume when progress is in the window", () => {
    expect(getPlaybackButtonLabel(600_000, 3_600_000)).toBe("Resume at 10:00");
    expect(getPlaybackButtonLabel(0, 3_600_000)).toBe("Play");
  });
});

describe("resolveWatchInitialResumeSeconds", () => {
  it("starts from zero when fromStart is set", () => {
    expect(
      resolveWatchInitialResumeSeconds({
        fromStart: true,
        castStartSeconds: Number.NaN,
        positionMs: 600_000,
        durationMs: 3_600_000,
      }),
    ).toBe(0);
  });

  it("honors cast start seconds over saved progress", () => {
    expect(
      resolveWatchInitialResumeSeconds({
        fromStart: false,
        castStartSeconds: 120,
        positionMs: 600_000,
        durationMs: 3_600_000,
      }),
    ).toBe(120);
  });

  it("resumes within the saved progress window", () => {
    expect(
      resolveWatchInitialResumeSeconds({
        fromStart: false,
        castStartSeconds: Number.NaN,
        positionMs: 600_000,
        durationMs: 3_600_000,
      }),
    ).toBe(600);
  });

  it("fromStart wins over a cast start offset", () => {
    expect(
      resolveWatchInitialResumeSeconds({
        fromStart: true,
        castStartSeconds: 120,
        positionMs: 600_000,
        durationMs: 3_600_000,
      }),
    ).toBe(0);
  });
});
