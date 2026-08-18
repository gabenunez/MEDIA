import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  isJunkDownloadName,
  padSeason,
  sanitizeFolderName,
  suggestedAliasPath,
  type AliasLibrary,
} from "./aliases.js";

const libraries: AliasLibrary[] = [
  { id: 1, name: "Movies", type: "movies", path: "/media/Movies" },
  { id: 2, name: "TV", type: "tv", path: "/media/TV Shows" },
];

describe("alias helpers", () => {
  it("skips samples and incomplete downloads", () => {
    expect(isJunkDownloadName("Movie.SAMPLE.mkv")).toBe(true);
    expect(isJunkDownloadName("show.s01e01.sample.mkv")).toBe(true);
    expect(isJunkDownloadName("Movie.mkv.part")).toBe(true);
    expect(isJunkDownloadName("Dune.2021.2160p.mkv")).toBe(false);
  });

  it("sanitizes folder names", () => {
    expect(sanitizeFolderName("Foo/Bar")).toBe("Foo Bar");
    expect(sanitizeFolderName("  ")).toBe("Unknown");
  });

  it("pads season folders", () => {
    expect(padSeason(1)).toBe("01");
    expect(padSeason(12)).toBe("12");
  });
});

describe("suggestedAliasPath", () => {
  it("places movies under Title (Year)", () => {
    const result = suggestedAliasPath(
      "/downloads/Dune.2021.2160p.BluRay.x265.mkv",
      libraries,
    );
    expect(result).toMatchObject({
      kind: "movie",
      title: "Dune",
      year: 2021,
      libraryId: 1,
      libraryName: "Movies",
    });
    expect(result?.aliasPath).toBe(
      path.join("/media/Movies", "Dune (2021)", "Dune.2021.2160p.BluRay.x265.mkv"),
    );
  });

  it("places episodes under Show/Season NN", () => {
    const result = suggestedAliasPath(
      "/downloads/The.Office.S02E01.HDTV.x264.mkv",
      libraries,
    );
    expect(result).toMatchObject({
      kind: "episode",
      title: "The Office",
      season: 2,
      episode: 1,
      libraryId: 2,
      libraryName: "TV",
    });
    expect(result?.aliasPath).toBe(
      path.join(
        "/media/TV Shows",
        "The Office",
        "Season 02",
        "The.Office.S02E01.HDTV.x264.mkv",
      ),
    );
  });

  it("returns null when the matching library type is missing", () => {
    expect(
      suggestedAliasPath("/downloads/The.Office.S02E01.mkv", [libraries[0]]),
    ).toBeNull();
  });
});
