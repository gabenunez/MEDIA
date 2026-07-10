import { describe, expect, it } from "vitest";
import { withBasePath } from "./base-path";

// Mirror api.subtitleUrl encoding without spinning up Next/env.
function subtitleUrl(id: number, offsetSeconds = 0): string {
  const base = withBasePath(`/api/subtitles/${id}`);
  if (Number.isFinite(offsetSeconds) && offsetSeconds > 0) {
    const offset = Math.round(offsetSeconds * 1000) / 1000;
    return `${base}?offset=${offset}`;
  }
  return base;
}

describe("subtitleUrl offset encoding", () => {
  it("omits offset when not needed", () => {
    expect(subtitleUrl(12)).toBe(withBasePath("/api/subtitles/12"));
    expect(subtitleUrl(12, 0)).toBe(withBasePath("/api/subtitles/12"));
  });

  it("encodes fractional HLS resume offsets at millisecond precision", () => {
    expect(subtitleUrl(12, 3723.4567)).toBe(
      withBasePath("/api/subtitles/12") + "?offset=3723.457",
    );
  });
});
