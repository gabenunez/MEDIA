import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("home page", () => {
  it("puts the cached catalog in the first paint", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "page.tsx"),
      "utf8",
    );
    expect(source).toContain('"use cache"');
    expect(source).toContain("cacheLife(catalogCacheLife)");
    expect(source).toContain("cacheTag(HOME_CATALOG_CACHE_TAG)");
    expect(source).toContain("return await CachedHome()");
    expect(source).toContain("<HomeClient initialData={data} />");
  });
});
