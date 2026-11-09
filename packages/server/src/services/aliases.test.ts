import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DOWNLOAD_STABLE_MS,
  isCompletedDownload,
  isJunkDownloadName,
  isUnderIncompleteDir,
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

describe("isUnderIncompleteDir", () => {
  const root = "/downloads";

  it("flags files inside an incomplete folder", () => {
    expect(
      isUnderIncompleteDir("/downloads/incomplete/show.s01e01.mkv", root),
    ).toBe(true);
    expect(
      isUnderIncompleteDir("/downloads/.incomplete/show.s01e01.mkv", root),
    ).toBe(true);
    expect(
      isUnderIncompleteDir("/downloads/_unpack_/show.s01e01.mkv", root),
    ).toBe(true);
  });

  it("allows files in a normal completed folder", () => {
    expect(
      isUnderIncompleteDir("/downloads/Dance Moms S01/show.s01e01.mkv", root),
    ).toBe(false);
  });
});

describe("isCompletedDownload", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alias-complete-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("treats a settled, fully-written file as complete", () => {
    const file = path.join(tmpDir, "show.s01e01.mkv");
    fs.writeFileSync(file, "video");
    const stat = fs.statSync(file);
    const now = stat.mtimeMs + DOWNLOAD_STABLE_MS + 1000;
    expect(isCompletedDownload(file, stat, now)).toBe(true);
  });

  it("skips a file still being written (recent mtime)", () => {
    const file = path.join(tmpDir, "show.s01e01.mkv");
    fs.writeFileSync(file, "video");
    const stat = fs.statSync(file);
    // "now" is essentially the write time, so it is within the stable window.
    expect(isCompletedDownload(file, stat, stat.mtimeMs)).toBe(false);
  });

  it("skips a file with a sibling incomplete marker", () => {
    const file = path.join(tmpDir, "show.s01e01.mkv");
    fs.writeFileSync(file, "video");
    fs.writeFileSync(`${file}.part`, "");
    const stat = fs.statSync(file);
    const now = stat.mtimeMs + DOWNLOAD_STABLE_MS + 1000;
    expect(isCompletedDownload(file, stat, now)).toBe(false);
  });

  it("skips a zero-byte placeholder", () => {
    const file = path.join(tmpDir, "show.s01e01.mkv");
    fs.writeFileSync(file, "");
    const stat = fs.statSync(file);
    const now = stat.mtimeMs + DOWNLOAD_STABLE_MS + 1000;
    expect(isCompletedDownload(file, stat, now)).toBe(false);
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
