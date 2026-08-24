import { describe, expect, it } from "vitest";
import {
  CATALOG_REVALIDATE_PATHS,
  HOME_CATALOG_CACHE_TAG,
  collectRevalidateTags,
  mediaInternalRevalidateUrl,
  mediaPageCacheTag,
} from "./cache-tags.js";

describe("mediaPageCacheTag", () => {
  it("formats media page cache tags", () => {
    expect(mediaPageCacheTag(42)).toBe("media:42");
  });
});

describe("mediaInternalRevalidateUrl", () => {
  it("prefixes the Next base path so gateway POSTs reach the app", () => {
    expect(mediaInternalRevalidateUrl("http://127.0.0.1:8096", "/reel")).toBe(
      "http://127.0.0.1:8096/reel/internal/revalidate/",
    );
  });

  it("keeps the unprefixed path when no public prefix is set", () => {
    expect(mediaInternalRevalidateUrl("http://127.0.0.1:8096/", "")).toBe(
      "http://127.0.0.1:8096/internal/revalidate/",
    );
  });
});

describe("collectRevalidateTags", () => {
  it("includes the home catalog tag when catalog paths are revalidated", () => {
    expect(
      collectRevalidateTags({
        tag: "media:9",
        mediaId: 9,
        paths: [...CATALOG_REVALIDATE_PATHS],
      }),
    ).toEqual(expect.arrayContaining(["media:9", HOME_CATALOG_CACHE_TAG]));
  });

  it("accepts extra tags without a media id", () => {
    expect(
      collectRevalidateTags({
        tag: HOME_CATALOG_CACHE_TAG,
        paths: ["/"],
      }),
    ).toEqual([HOME_CATALOG_CACHE_TAG]);
  });
});
