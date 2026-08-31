import { describe, expect, it } from "vitest";
import {
  isHighSourceFrameRate,
  parseFfprobeFrameRate,
  resolveVideoFrameRate,
} from "./frame-rate.js";

describe("frame rate helpers", () => {
  it("parses fractional ffprobe frame rates", () => {
    expect(parseFfprobeFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseFfprobeFrameRate("60/1")).toBe(60);
  });

  it("prefers avg_frame_rate over r_frame_rate", () => {
    expect(
      resolveVideoFrameRate({
        avg_frame_rate: "24/1",
        r_frame_rate: "60/1",
      }),
    ).toBe(24);
  });

  it("flags high source frame rates for TV transcode routing", () => {
    expect(isHighSourceFrameRate(59.94)).toBe(true);
    expect(isHighSourceFrameRate(24)).toBe(false);
  });
});
