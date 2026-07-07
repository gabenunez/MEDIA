import { describe, expect, it } from "vitest";
import { resolveHlsSubtitleTimelineOffset } from "./subtitle-timeline";

describe("resolveHlsSubtitleTimelineOffset", () => {
  it("prefers a pending stream restart position", () => {
    expect(
      resolveHlsSubtitleTimelineOffset({
        streamStartSeconds: 7200,
        hlsStartOffset: 3600,
        initialResumeSeconds: 1800,
      }),
    ).toBe(7200);
  });

  it("uses the active HLS offset once playback has started", () => {
    expect(
      resolveHlsSubtitleTimelineOffset({
        streamStartSeconds: null,
        hlsStartOffset: 3600,
        initialResumeSeconds: 1800,
      }),
    ).toBe(3600);
  });

  it("falls back to the resume point before playback updates HLS offset state", () => {
    expect(
      resolveHlsSubtitleTimelineOffset({
        streamStartSeconds: null,
        hlsStartOffset: 0,
        initialResumeSeconds: 3723.5,
      }),
    ).toBe(3723.5);
  });

  it("returns zero for playback from the start", () => {
    expect(
      resolveHlsSubtitleTimelineOffset({
        streamStartSeconds: null,
        hlsStartOffset: 0,
        initialResumeSeconds: 0,
      }),
    ).toBe(0);
  });
});
