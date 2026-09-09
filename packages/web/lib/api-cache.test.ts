import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedFetch,
  invalidateApiCache,
  peekApiCache,
  seedApiCache,
} from "./api-cache";

describe("peekApiCache", () => {
  afterEach(() => {
    invalidateApiCache();
  });

  it("returns fresh cached values", async () => {
    await cachedFetch("media:7", async () => ({ id: 7, title: "Test" }), 60_000);
    expect(peekApiCache<{ id: number; title: string }>("media:7")).toEqual({
      id: 7,
      title: "Test",
    });
  });

  it("returns undefined for missing keys", () => {
    expect(peekApiCache("media:999")).toBeUndefined();
  });

  it("can return expired media so Back still paints immediately", async () => {
    await cachedFetch("media:8", async () => ({ id: 8, title: "Stale" }), 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(peekApiCache("media:8")).toBeUndefined();
    expect(peekApiCache<{ id: number; title: string }>("media:8", { allowStale: true })).toEqual({
      id: 8,
      title: "Stale",
    });
  });
});

describe("seedApiCache", () => {
  afterEach(() => {
    invalidateApiCache();
  });

  it("fills an empty key so the next cachedFetch is a hit", async () => {
    expect(seedApiCache("home", { recentlyAdded: [] }, 60_000)).toBe(true);
    const fetcher = vi.fn(async () => ({ recentlyAdded: ["network"] }));
    await expect(cachedFetch("home", fetcher, 60_000)).resolves.toEqual({
      recentlyAdded: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing cache entry", async () => {
    await cachedFetch("home", async () => ({ recentlyAdded: ["live"] }), 60_000);
    expect(seedApiCache("home", { recentlyAdded: ["ssr"] }, 60_000)).toBe(false);
    expect(peekApiCache("home")).toEqual({ recentlyAdded: ["live"] });
  });

  it("refuses to seed after invalidate until a live fetch lands", async () => {
    await cachedFetch("home", async () => ({ recentlyAdded: ["old"] }), 60_000);
    invalidateApiCache("home");
    expect(peekApiCache("home")).toBeUndefined();
    expect(seedApiCache("home", { recentlyAdded: ["stale-ssr"] }, 60_000)).toBe(
      false,
    );

    const fetcher = vi.fn(async () => ({ recentlyAdded: ["fresh"] }));
    await expect(cachedFetch("home", fetcher, 60_000)).resolves.toEqual({
      recentlyAdded: ["fresh"],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(seedApiCache("home", { recentlyAdded: ["ssr"] }, 60_000)).toBe(false);
  });
});
