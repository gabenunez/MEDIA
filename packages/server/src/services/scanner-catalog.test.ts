import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scannerSrc = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "scanner.ts"),
  "utf8",
);

describe("scanner catalog revalidation", () => {
  it("revalidates home after inserting a movie file", () => {
    const movieFn = scannerSrc.slice(
      scannerSrc.indexOf("processMovieFile"),
      scannerSrc.indexOf("findTvMediaItem"),
    );
    expect(movieFn).toContain("insert(movieFiles)");
    expect(movieFn).toContain("scheduleCatalogRevalidate(mediaItemId)");
    expect(scannerSrc).toContain("revalidateMediaPage(id, { alsoHome: false })");
    expect(scannerSrc).toContain("LIBRARY_INGEST_CONCURRENCY");
  });

  it("revalidates the catalog after a library scan finishes", () => {
    expect(scannerSrc).toContain("void revalidateCatalog()");
  });
});
