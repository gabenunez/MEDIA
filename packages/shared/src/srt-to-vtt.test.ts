import { describe, expect, it } from "vitest";
import { convertSrtToVtt } from "./srt-to-vtt.js";
import { findActiveCueTexts, parseWebVttCues } from "./vtt-cues.js";
import {
  formatVttTimestamp,
  normalizeSubtitleOffsetSeconds,
  shiftVttByOffset,
} from "./vtt-timing.js";

describe("convertSrtToVtt", () => {
  it("converts comma decimals and multi-line dialogue", () => {
    const srt = `1
00:01:00,000 --> 00:01:02,500
Hello there

2
00:01:03,000 --> 00:01:05,000
Line one
Line two
`;
    const vtt = convertSrtToVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:01:00.000 --> 00:01:02.500");
    expect(vtt).toContain("Hello there");
    expect(vtt).toContain("Line one\nLine two");
    expect(vtt).not.toContain(",");
  });

  it("strips a UTF-8 BOM and ignores empty cues", () => {
    const srt = `\uFEFF1
00:00:01,000 --> 00:00:02,000

2
00:00:03,000 --> 00:00:04,000
Spoken
`;
    const vtt = convertSrtToVtt(srt);
    expect(vtt).not.toContain("\uFEFF");
    expect(vtt).toContain("Spoken");
    // empty dialogue block dropped
    expect(vtt.match(/-->/g)?.length).toBe(1);
  });
});

describe("normalizeSubtitleOffsetSeconds", () => {
  it("keeps millisecond precision and rejects non-positive values", () => {
    expect(normalizeSubtitleOffsetSeconds(3723.4567)).toBe(3723.457);
    expect(normalizeSubtitleOffsetSeconds(0)).toBe(0);
    expect(normalizeSubtitleOffsetSeconds(-5)).toBe(0);
    expect(normalizeSubtitleOffsetSeconds(Number.NaN)).toBe(0);
  });
});

describe("formatVttTimestamp", () => {
  it("does not emit .1000 after rounding", () => {
    expect(formatVttTimestamp(0.9996)).toBe("0:01.000");
    expect(formatVttTimestamp(3599.9996)).toBe("1:00:00.000");
  });
});

describe("HLS resume subtitle alignment", () => {
  it("keeps native relative cues in sync with web absolute time after fractional resume", () => {
    // Absolute media clock cue at 1:02:03.500
    const absoluteVtt = `WEBVTT

1
1:02:03.000 --> 1:02:05.000
Resume line
`;
    const resumeOffset = 3723.5; // 1:02:03.500
    const shifted = shiftVttByOffset(absoluteVtt, resumeOffset);
    const relativeCues = parseWebVttCues(shifted);
    const absoluteCues = parseWebVttCues(absoluteVtt);

    // ExoPlayer relative clock just after stream start
    expect(findActiveCueTexts(relativeCues, 0.1)).toEqual(["Resume line"]);
    // Web overlay absolute clock at the same moment
    expect(findActiveCueTexts(absoluteCues, resumeOffset + 0.1)).toEqual(["Resume line"]);
  });

  it("clamps cues that straddle the resume offset", () => {
    const source = `WEBVTT

1
1:00:00.000 --> 1:00:05.000
Straddle
`;
    const shifted = shiftVttByOffset(source, 3602);
    expect(shifted).toContain("0:00.000 --> 0:03.000");
    expect(parseWebVttCues(shifted)[0]?.text).toBe("Straddle");
  });
});
