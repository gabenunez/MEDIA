import { describe, expect, it } from "vitest";
import {
  parseFfmpegOutTimeSeconds,
  progressFromFfmpegLine,
} from "./ffmpeg-progress.js";

describe("parseFfmpegOutTimeSeconds", () => {
  it("parses HH:MM:SS.fraction", () => {
    expect(parseFfmpegOutTimeSeconds("01:02:03.5")).toBe(3723.5);
    expect(parseFfmpegOutTimeSeconds("00:00:00.00")).toBe(0);
  });

  it("rejects junk", () => {
    expect(parseFfmpegOutTimeSeconds("n/a")).toBeNull();
    expect(parseFfmpegOutTimeSeconds("")).toBeNull();
  });
});

describe("progressFromFfmpegLine", () => {
  it("maps out_time to a 0–1 ratio", () => {
    expect(progressFromFfmpegLine("out_time=00:30:00.00", 3_600_000)).toBe(0.5);
    expect(progressFromFfmpegLine("progress=end", 3_600_000)).toBe(1);
  });

  it("ignores unrelated keys", () => {
    expect(progressFromFfmpegLine("frame=123", 3_600_000)).toBeNull();
  });
});
