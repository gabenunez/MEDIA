import { describe, expect, it } from "vitest";
import { findActiveCueTexts, parseWebVttCues } from "./vtt-cues.js";

const SAMPLE = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
First line.

2
00:00:05.500 --> 00:00:08.000
Second <i>line</i>.
`;

describe("parseWebVttCues", () => {
  it("parses dialogue cues", () => {
    const cues = parseWebVttCues(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      start: 1,
      end: 4,
      text: "First line.",
    });
    expect(cues[1]?.text).toBe("Second line.");
  });

  it("finds active cue text for a playback time", () => {
    const cues = parseWebVttCues(SAMPLE);
    expect(findActiveCueTexts(cues, 0.5)).toEqual([]);
    expect(findActiveCueTexts(cues, 2)).toEqual(["First line."]);
    expect(findActiveCueTexts(cues, 6)).toEqual(["Second line."]);
    expect(findActiveCueTexts(cues, 9)).toEqual([]);
  });
});
