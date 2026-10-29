import { describe, expect, it } from "vitest";
import { withBasePath } from "./base-path";

// Mirror api.subtitleUrl encoding without spinning up Next/env.
function subtitleUrl(id: number, offsetSeconds = 0, syncDelaySeconds = 0): string {
  const base = withBasePath(`/api/subtitles/${id}`);
  const params = new URLSearchParams();
  if (Number.isFinite(offsetSeconds) && offsetSeconds > 0) {
    params.set("offset", String(Math.round(offsetSeconds * 1000) / 1000));
  }
  if (Number.isFinite(syncDelaySeconds) && Math.abs(syncDelaySeconds) >= 0.05) {
    params.set("sync", (Math.round(syncDelaySeconds * 10) / 10).toFixed(1));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

describe("subtitleUrl offset encoding", () => {
  it("omits offset when not needed", () => {
    expect(subtitleUrl(12)).toBe(withBasePath("/api/subtitles/12"));
    expect(subtitleUrl(12, 0)).toBe(withBasePath("/api/subtitles/12"));
  });

  it("encodes a tenth-second subtitle timing delay", () => {
    expect(subtitleUrl(12, 0, 0.1)).toBe(withBasePath("/api/subtitles/12") + "?sync=0.1");
    expect(subtitleUrl(12, 10, -0.4)).toBe(
      withBasePath("/api/subtitles/12") + "?offset=10&sync=-0.4",
    );
  });

  it("encodes fractional HLS resume offsets at millisecond precision", () => {
    expect(subtitleUrl(12, 3723.4567)).toBe(
      withBasePath("/api/subtitles/12") + "?offset=3723.457",
    );
  });
});
