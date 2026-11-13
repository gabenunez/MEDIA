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

describe("scanner duplicate-show prevention", () => {
  it("creates the show row through a serialized, locked find-or-create", () => {
    // processTvFile must not inline its own find-then-insert (the old race);
    // it delegates to ensureTvMediaItem.
    const processTvFn = scannerSrc.slice(
      scannerSrc.indexOf("private async processTvFile"),
      scannerSrc.indexOf("private async removeFile"),
    );
    expect(processTvFn).toContain("ensureTvMediaItem(lib.id, parsed.showName)");
    expect(processTvFn).not.toContain("insert(mediaItems)");

    const ensureFn = scannerSrc.slice(
      scannerSrc.indexOf("private async ensureTvMediaItem"),
      scannerSrc.indexOf("async dedupeTvShows"),
    );
    // Serialized per show, re-checks existence inside the lock, and only then
    // inserts — mirroring ensureTvSeason.
    expect(ensureFn).toContain("withChainLock");
    expect(ensureFn).toContain("this.mediaCreateChain");
    expect(ensureFn).toContain("findTvMediaItem(libraryId, showName)");
    expect(ensureFn).toContain("insert(mediaItems)");
  });

  it("merges duplicate shows on startup before season/episode dedupe", () => {
    const initFn = scannerSrc.slice(
      scannerSrc.indexOf("async initializeLibraries"),
      scannerSrc.indexOf("for (const libConfig"),
    );
    const showIdx = initFn.indexOf("dedupeTvShows()");
    const seasonIdx = initFn.indexOf("dedupeDuplicateSeasons");
    expect(showIdx).toBeGreaterThanOrEqual(0);
    expect(seasonIdx).toBeGreaterThanOrEqual(0);
    expect(showIdx).toBeLessThan(seasonIdx);
  });
});
