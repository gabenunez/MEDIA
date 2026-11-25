import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigManager } from "../config.js";
import { MetadataService } from "./metadata.js";

describe.each([
  { type: "movie", titleKey: "title", dateKey: "release_date", yearParam: "year", method: "searchMovie" },
  { type: "tv", titleKey: "name", dateKey: "first_air_date", yearParam: "first_air_date_year", method: "searchTv" },
] as const)("automatic $type matching", ({ type, titleKey, dateKey, yearParam, method }) => {
  let tmpDir: string;
  let metadata: MetadataService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "media-metadata-match-"));
    const config = { data_dir: tmpDir, metadata: { tmdb_api_key: "fixture-key", language: "en-US" } };
    metadata = new MetadataService({ get: () => config } as ConfigManager);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const title = "Little Women";
  const target = { id: 2, [titleKey]: title, [dateKey]: "1994-12-21" };
  const remake = { id: 1, [titleKey]: title, [dateKey]: "2019-12-25" };

  it("picks the requested release even if another version ranks first", async () => {
    const fetch = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === `/3/search/${type}`) {
        expect(url.searchParams.get(yearParam)).toBe("1994");
        return Response.json({ results: [remake, target] });
      }
      expect(url.pathname).toBe(`/3/${type}/2`);
      return Response.json(target);
    });
    vi.stubGlobal("fetch", fetch);
    expect((await metadata[method](title, 1994)).match).toMatchObject({ id: 2 });
  });

  it("leaves a release unmatched when only a different year is returned", async () => {
    const fetch = vi.fn(async () => Response.json({ results: [remake] }));
    vi.stubGlobal("fetch", fetch);
    expect(await metadata[method](title, 1994)).toEqual({ match: null, confidence: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
