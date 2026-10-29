import { describe, expect, it } from "vitest";
import {
  formatSubtitleSync,
  stepSubtitleSync,
  subtitleLookupSeconds,
} from "./subtitle-sync";

describe("subtitle sync", () => {
  it("steps by a tenth of a second", () => {
    expect(stepSubtitleSync(0, 1)).toBeCloseTo(0.1, 5);
    expect(stepSubtitleSync(0.1, 1)).toBeCloseTo(0.2, 5);
    expect(stepSubtitleSync(0, -1)).toBeCloseTo(-0.1, 5);
  });

  it("formats a signed tenth-second delay", () => {
    expect(formatSubtitleSync(0)).toBe("0.0s");
    expect(formatSubtitleSync(0.3)).toBe("+0.3s");
    expect(formatSubtitleSync(-1.2)).toBe("−1.2s");
  });

  it("looks up earlier cues when the delay is positive", () => {
    expect(subtitleLookupSeconds(10, 0.4)).toBeCloseTo(9.6, 5);
    expect(subtitleLookupSeconds(10, -0.4)).toBeCloseTo(10.4, 5);
  });
});
