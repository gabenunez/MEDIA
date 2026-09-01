import { describe, expect, it } from "vitest";
import {
  canResumePlayback,
  resolveWatchInitialResumeSeconds,
} from "./utils";

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
