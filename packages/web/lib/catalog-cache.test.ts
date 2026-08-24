import { afterEach, describe, expect, it } from "vitest";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import {
  catalogDataCache,
  invalidateClientCatalogCache,
  libraryCountsSignature,
} from "./catalog-cache";
import { cachedFetch, invalidateApiCache, peekApiCache } from "./api-cache";

describe("catalogDataCache", () => {
  it("tags home ISR fetches so catalog revalidate can bust them", () => {
    expect(catalogDataCache(60)).toEqual({
      revalidate: 60,
      tags: [HOME_CATALOG_CACHE_TAG],
    });
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
