import { afterEach, describe, expect, it } from "vitest";
import { invalidateApiCache, seedApiCache } from "./api-cache";
import { initialHomeData } from "./use-live-home-data";
import type { HomeData } from "./server-api";

const cached = {
  continueWatching: [],
  recentlyAdded: [],
  favorites: [],
  libraries: [],
  decks: [],
  tmdbConfigured: true,
  recentPlay: null,
} satisfies HomeData;

afterEach(() => {
  invalidateApiCache();
});

describe("initialHomeData", () => {
  it("paints a cached homepage before the network round trip", () => {
    seedApiCache("home", cached, 30_000);
    expect(initialHomeData(null)).toEqual(cached);
  });

  it("keeps an explicit seed ahead of the cache", () => {
    seedApiCache("home", cached, 30_000);
    const seed = { ...cached, tmdbConfigured: false };
    expect(initialHomeData(seed)).toBe(seed);
  });

  it("stays empty when nothing has been fetched yet", () => {
    expect(initialHomeData(null)).toBeNull();
  });
});
