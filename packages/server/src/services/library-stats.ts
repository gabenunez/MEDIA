import { eq, sql } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { libraries, mediaItems } from "../db/schema.js";

export async function getLibraryItemCounts(
  db: DatabaseInstance,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      libraryId: mediaItems.libraryId,
      count: sql<number>`count(*)`,
    })
    .from(mediaItems)
    .groupBy(mediaItems.libraryId);

  return new Map(rows.map((row) => [row.libraryId, row.count]));
}

export async function listLibrariesWithCounts(db: DatabaseInstance) {
  const librariesList = await db.query.libraries.findMany();
  const counts = await getLibraryItemCounts(db);

  return librariesList.map((lib) => ({
    id: lib.id,
    name: lib.name,
    type: lib.type,
    path: lib.path,
    itemCount: counts.get(lib.id) ?? 0,
    lastScannedAt: lib.lastScannedAt?.toISOString() ?? null,
  }));
}
