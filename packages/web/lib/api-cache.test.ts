import { afterEach, describe, expect, it } from "vitest";
import { cachedFetch, invalidateApiCache, peekApiCache } from "./api-cache";

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
