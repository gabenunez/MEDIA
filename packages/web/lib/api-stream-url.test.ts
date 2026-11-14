import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./api";

/** Read the `start` query param from a streamUrl result. */
function startParam(url: string): string | null {
  const query = url.split("?")[1] ?? "";
  return new URLSearchParams(query).get("start");
}

describe("api.streamUrl start offset", () => {
  const prevPrefix = process.env.MEDIA_PUBLIC_PREFIX;
  const prevBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
  const prevApi = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    delete process.env.MEDIA_PUBLIC_PREFIX;
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    if (prevPrefix === undefined) delete process.env.MEDIA_PUBLIC_PREFIX;
    else process.env.MEDIA_PUBLIC_PREFIX = prevPrefix;
    if (prevBasePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = prevBasePath;
    if (prevApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = prevApi;
  });

  it("preserves sub-second precision instead of flooring (no backward drift on resume)", () => {
    const url = api.streamUrl(42, "episode", "1080p", 123.456);
    expect(startParam(url)).toBe("123.456");
  });

  it("rounds to milliseconds", () => {
    const url = api.streamUrl(42, "episode", "1080p", 123.4567);
    expect(startParam(url)).toBe("123.457");
  });

  it("keeps whole-second values clean", () => {
    const url = api.streamUrl(42, "episode", "1080p", 90);
    expect(startParam(url)).toBe("90");
  });

  it("clamps negative/undefined starts to 0", () => {
    expect(startParam(api.streamUrl(42, "movie", "720p", -5))).toBe("0");
    expect(startParam(api.streamUrl(42, "movie", "720p"))).toBe("0");
  });

  it("includes start on the HLS path and omits it for original direct play", () => {
    const hls = api.streamUrl(7, "movie", "1080p", 61.25);
    expect(hls).toContain("/api/stream/7/hls/master.m3u8");
    expect(startParam(hls)).toBe("61.25");

    const direct = api.streamUrl(7, "movie", "original");
    expect(direct).toBe("/api/stream/7?type=movie");
  });

  it("carries start through the remux quality too", () => {
    const url = api.streamUrl(7, "episode", "original", 61.25, undefined, "remux");
    expect(url).toContain("quality=remux");
    expect(startParam(url)).toBe("61.25");
  });
});
