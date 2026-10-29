import { describe, expect, it } from "vitest";
import {
  describeSubtitleSync,
  stepSubtitleSync,
  subtitleLookupSeconds,
} from "./subtitle-sync";

describe("subtitle sync", () => {
  it("steps by a tenth of a second", () => {
    expect(stepSubtitleSync(0, 1)).toBeCloseTo(0.1, 5);
    expect(stepSubtitleSync(0.1, 1)).toBeCloseTo(0.2, 5);
    expect(stepSubtitleSync(0, -1)).toBeCloseTo(-0.1, 5);
  });

  it("describes the offset in plain language", () => {
    expect(describeSubtitleSync(0)).toBe("On time");
    expect(describeSubtitleSync(0.3)).toBe("0.3 seconds later");
    expect(describeSubtitleSync(1)).toBe("1 second later");
    expect(describeSubtitleSync(-1.2)).toBe("1.2 seconds earlier");
    expect(describeSubtitleSync(-2)).toBe("2 seconds earlier");
  });

  it("looks up earlier cues when the delay is positive", () => {
    expect(subtitleLookupSeconds(10, 0.4)).toBeCloseTo(9.6, 5);
    expect(subtitleLookupSeconds(10, -0.4)).toBeCloseTo(10.4, 5);
  });
});
