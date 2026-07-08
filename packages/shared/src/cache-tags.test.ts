import { describe, expect, it } from "vitest";
import { mediaPageCacheTag } from "./cache-tags.js";

describe("mediaPageCacheTag", () => {
  it("formats media page cache tags", () => {
    expect(mediaPageCacheTag(42)).toBe("media:42");
  });
});
