import { afterEach, describe, expect, it, vi } from "vitest";
import { shiftVttByOffset } from "@media-app/shared";
import {
  clearSubtitleVttCache,
  formatSubtitleFetchError,
  peekPreparedSubtitleVtt,
  prepareWebSubtitleVtt,
} from "./web-subtitle-attach";

describe("formatSubtitleFetchError", () => {
  it("maps common HTTP failures to user-facing messages", () => {
    expect(formatSubtitleFetchError(new Response(null, { status: 401 }))).toBe(
      "Sign in required to load subtitles.",
    );
    expect(formatSubtitleFetchError(new Response(null, { status: 404 }))).toBe(
      "This subtitle file is missing or empty.",
    );
    expect(formatSubtitleFetchError(new Response(null, { status: 500 }))).toBe(
      "Couldn't load subtitles (HTTP 500).",
    );
  });

  it("falls back to a generic network message", () => {
    expect(formatSubtitleFetchError(null)).toBe(
      "Couldn't load subtitles. Check your connection and try again.",
    );
    expect(formatSubtitleFetchError(null, new Error("Network down"))).toBe("Network down");
  });
});

describe("prepareWebSubtitleVtt", () => {
  afterEach(() => {
    clearSubtitleVttCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns unshifted VTT for web absolute-time overlay (offset 0)", async () => {
    const source = `WEBVTT

1
1:02:03.000 --> 1:02:05.000
Hello
`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(source, { status: 200 })),
    );

    const result = await prepareWebSubtitleVtt(42, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vtt).toContain("1:02:03.000 --> 1:02:05.000");
      expect(result.vtt).toContain("Hello");
    }
  });

  it("shifts cached VTT by fractional offset for native relative timelines", async () => {
    const source = `WEBVTT

1
1:02:03.750 --> 1:02:05.000
Hello
`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(source, { status: 200 })),
    );

    const result = await prepareWebSubtitleVtt(7, 3723.5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vtt).toBe(shiftVttByOffset(source, 3723.5));
      expect(result.vtt).toContain("0:00.250 --> 0:01.500");
    }
  });

  it("exposes cached VTT synchronously for native overlay swaps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n", { status: 200 })),
    );
    expect(peekPreparedSubtitleVtt(9)).toBeNull();
    await prepareWebSubtitleVtt(9, 0);
    expect(peekPreparedSubtitleVtt(9)).toContain("Hi");
  });
});
