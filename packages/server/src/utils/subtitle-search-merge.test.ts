import { describe, expect, it } from "vitest";
import { mergeSubtitleSearchResults } from "./subtitle-search-merge.js";

describe("mergeSubtitleSearchResults", () => {
  it("keeps OpenSubtitles hits when Wyzie returns the same release", () => {
    const merged = mergeSubtitleSearchResults([
      [
        {
          language: "en",
          release: "The.Martian.2015.1080p.WEB-DL",
          fileName: "the.martian.2015.1080p.web-dl.srt",
          downloadCount: 10,
          provider: "opensubtitles",
        },
      ],
      [
        {
          language: "en",
          release: "The.Martian.2015.1080p.WEB-DL",
          fileName: "the.martian.2015.1080p.web-dl.srt",
          downloadCount: 99,
          provider: "wyzie",
        },
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.provider).toBe("opensubtitles");
  });

  it("appends distinct Wyzie releases and sorts by download count", () => {
    const merged = mergeSubtitleSearchResults([
      [
        {
          language: "en",
          release: "Release.A",
          downloadCount: 5,
          provider: "opensubtitles",
        },
      ],
      [
        {
          language: "en",
          release: "Release.B",
          downloadCount: 50,
          provider: "wyzie",
        },
      ],
    ]);

    expect(merged.map((item) => item.release)).toEqual(["Release.B", "Release.A"]);
  });
});
