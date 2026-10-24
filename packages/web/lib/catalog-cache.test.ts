import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  catalogCacheLife,
  homeRefreshOptions,
  invalidateClientCatalogCache,
  libraryCountsSignature,
  mediaCacheLife,
} from "./catalog-cache";
import { cachedFetch, invalidateApiCache, peekApiCache } from "./api-cache";

describe("catalog cache", () => {
  it("tags cached catalog reads so a library scan can bust them", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "server-api.ts"),
      "utf8",
    );
    expect(catalogCacheLife).toEqual({ stale: 60, revalidate: 60, expire: 300 });
    expect(mediaCacheLife).toEqual({ stale: 300, revalidate: 300, expire: 3600 });
    expect(source).toContain('"use cache"');
    expect(source).toContain("cacheTag(HOME_CATALOG_CACHE_TAG)");
    expect(source).toContain("cacheLife(catalogCacheLife)");
    expect(source).toContain("cacheLife(mediaCacheLife)");
    expect(source).toContain("HOME_CATALOG_CACHE_TAG");
  });
});

describe("libraryCountsSignature", () => {
  it("changes when a library gains a title", () => {
    expect(
      libraryCountsSignature([
        { id: 1, itemCount: 10 },
        { id: 2, itemCount: 4 },
      ]),
    ).not.toBe(
      libraryCountsSignature([
        { id: 1, itemCount: 11 },
        { id: 2, itemCount: 4 },
      ]),
    );
  });
});

describe("invalidateClientCatalogCache", () => {
  afterEach(() => {
    invalidateApiCache();
  });

  it("drops the cached home payload so the next fetch is live", async () => {
    await cachedFetch("home", async () => ({ recentlyAdded: [] }), 60_000);
    expect(peekApiCache("home")).toEqual({ recentlyAdded: [] });
    invalidateClientCatalogCache();
    expect(peekApiCache("home")).toBeUndefined();
  });
});

describe("homeRefreshOptions", () => {
  it("keeps cached home on the screen when remounting after watch", () => {
    expect(homeRefreshOptions("mount")).toEqual({ bust: false, refreshRsc: false });
    expect(homeRefreshOptions("visible")).toEqual({ bust: false, refreshRsc: false });
  });

  it("busts caches only when the catalog itself changed", () => {
    expect(homeRefreshOptions("scan-complete")).toEqual({
      bust: true,
      refreshRsc: true,
    });
    expect(homeRefreshOptions("library-counts")).toEqual({
      bust: true,
      refreshRsc: true,
    });
  });
});
