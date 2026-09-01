import { describe, expect, it } from "vitest";
import { isOnlineSubtitleSource } from "./types.js";

describe("isOnlineSubtitleSource", () => {
  it("treats OpenSubtitles and Wyzie as removable online tracks", () => {
    expect(isOnlineSubtitleSource("opensubtitles")).toBe(true);
    expect(isOnlineSubtitleSource("wyzie")).toBe(true);
    expect(isOnlineSubtitleSource("embedded")).toBe(false);
    expect(isOnlineSubtitleSource("external")).toBe(false);
  });
});
