import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { mediaItems, tvEpisodes, tvSeasons } from "../db/schema.js";

/**
 * Collapse repeated season rows that share a show and season number.
 * Episodes move onto the earliest row. Later rows fill in any missing metadata.
 */
export async function dedupeDuplicateSeasons(
  db: DatabaseInstance,
  libraryId?: number,
): Promise<number> {
  const seasons = libraryId === undefined
    ? await db.query.tvSeasons.findMany()
    : await seasonsForLibrary(db, libraryId);

  const groups = new Map<string, typeof seasons>();
  for (const season of seasons) {
    const key = `${season.mediaItemId}:${season.seasonNumber}`;
    const group = groups.get(key) ?? [];
    group.push(season);
    groups.set(key, group);
  }

  let removed = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    group.sort((a, b) => a.id - b.id);
    const [keep, ...dupes] = group;
    const patch = {
      name: keep.name ?? dupes.find((season) => season.name)?.name ?? null,
      overview: keep.overview ?? dupes.find((season) => season.overview)?.overview ?? null,
      posterPath: keep.posterPath ?? dupes.find((season) => season.posterPath)?.posterPath ?? null,
      airDate: keep.airDate ?? dupes.find((season) => season.airDate)?.airDate ?? null,
    };

    if (
      patch.name !== keep.name ||
      patch.overview !== keep.overview ||
      patch.posterPath !== keep.posterPath ||
      patch.airDate !== keep.airDate
    ) {
      await db.update(tvSeasons).set(patch).where(eq(tvSeasons.id, keep.id));
    }

    for (const dupe of dupes) {
      await db
        .update(tvEpisodes)
        .set({ seasonId: keep.id })
        .where(eq(tvEpisodes.seasonId, dupe.id));
      await db.delete(tvSeasons).where(eq(tvSeasons.id, dupe.id));
      removed++;
    }
  }

  return removed;
}

async function seasonsForLibrary(db: DatabaseInstance, libraryId: number) {
  const items = await db.query.mediaItems.findMany({
    where: and(eq(mediaItems.libraryId, libraryId), eq(mediaItems.type, "tv")),
  });
  if (!items.length) return [];

  return db.query.tvSeasons.findMany({
    where: inArray(
      tvSeasons.mediaItemId,
      items.map((item) => item.id),
    ),
  });
}
