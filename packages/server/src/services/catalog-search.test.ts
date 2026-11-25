import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../db/index.js";
import { libraries, mediaItems } from "../db/schema.js";
import { searchCatalog } from "./catalog-search.js";

function testCatalog(items: Array<{ title: string; overview?: string }>) {
  const migrations = fileURLToPath(new URL("../../drizzle", import.meta.url));
  const { db, sqlite } = runMigrations(":memory:", migrations);
  db.insert(libraries).values({ id: 1, name: "Movies", path: "/movies", type: "movies" }).run();
  db.insert(mediaItems)
    .values(items.map((item) => ({ ...item, libraryId: 1, type: "movie" as const })))
    .run();
  return { db, sqlite };
}

describe("TV catalog search", () => {
  it("ranks exact and prefix matches ahead of substring matches before cutting off at 24", async () => {
    const { db, sqlite } = testCatalog([
      ...Array.from({ length: 26 }, (_, index) => ({ title: `Beyond Dune ${index}` })),
      { title: "Dune: Part Two" },
      { title: "Dune" },
    ]);
    try {
      const results = await searchCatalog(db, "dune", "tv");
      expect(results).toHaveLength(24);
      expect(results.slice(0, 2).map(({ title }) => title)).toEqual(["Dune", "Dune: Part Two"]);
    } finally {
      sqlite.close();
    }
  });

  it("fills remaining spots with overview matches without duplicating title matches", async () => {
    const { db, sqlite } = testCatalog([
      { title: "Desert Planet", overview: "A story about Dune" },
      { title: "Dune", overview: "Travel to Dune" },
      { title: "100% Wolf" },
      { title: "100 Wolves" },
    ]);
    try {
      expect((await searchCatalog(db, "Dune", "tv")).map(({ title }) => title))
        .toEqual(["Dune", "Desert Planet"]);
      expect((await searchCatalog(db, "100%", "tv")).map(({ title }) => title)).toEqual(["100% Wolf"]);
    } finally {
      sqlite.close();
    }
  });
});
