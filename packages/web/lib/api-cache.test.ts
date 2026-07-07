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
});
