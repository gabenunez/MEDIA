import { describe, expect, it } from "vitest";
import { formatSubtitleFetchError } from "./web-subtitle-attach";

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
