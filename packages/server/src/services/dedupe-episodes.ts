import fs from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { mediaItems, tvEpisodes, tvSeasons } from "../db/schema.js";

type EpisodeRow = typeof tvEpisodes.$inferSelect;

/** A library file is usable only if it (or its symlink target) still exists. */
function fileExists(filePath: string): boolean {
  try {
    // statSync follows symlinks, so a dangling alias reports as missing.
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick the episode row to keep from a group that share a season and episode
 * number. Prefer a file that still resolves on disk (a live symlink beats a
 * dangling one left behind when a download was renamed), then the richest probe
 * metadata, then the largest file, then the oldest row for stability.
 */
function chooseKeeper(group: EpisodeRow[]): {
  keep: EpisodeRow;
  dupes: EpisodeRow[];
} {
  const scored = group
    .map((episode) => ({
      episode,
      exists: fileExists(episode.filePath),
    }))
    .sort((a, b) => {
      if (a.exists !== b.exists) return a.exists ? -1 : 1;
      const aProbed = a.episode.videoCodec ? 1 : 0;
      const bProbed = b.episode.videoCodec ? 1 : 0;
      if (aProbed !== bProbed) return bProbed - aProbed;
      const aSize = a.episode.fileSize ?? 0;
      const bSize = b.episode.fileSize ?? 0;
      if (aSize !== bSize) return bSize - aSize;
      return a.episode.id - b.episode.id;
    });

  const [keep, ...rest] = scored;
  return { keep: keep.episode, dupes: rest.map((entry) => entry.episode) };
}

/** Remove a dangling alias symlink so the stale file stops reappearing. */
function removeDanglingAlias(filePath: string): void {
  try {
    const link = fs.lstatSync(filePath);
    if (link.isSymbolicLink() && !fileExists(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // nothing on disk to clean up
  }
}

/**
 * Collapse duplicate episode rows that share a season and episode number.
 *
 * These appear when the same episode is aliased under two different filenames —
 * typically because an alias scan ran against an in-progress download and a
 * second alias was created once the client renamed the finished file. The
 * loser's dangling symlink is deleted from disk so it does not come back on the
 * next scan.
 */
export async function dedupeDuplicateEpisodes(
  db: DatabaseInstance,
  libraryId?: number,
): Promise<number> {
  const episodes =
    libraryId === undefined
      ? await db.query.tvEpisodes.findMany()
      : await episodesForLibrary(db, libraryId);

  const groups = new Map<string, EpisodeRow[]>();
  for (const episode of episodes) {
    const key = `${episode.seasonId}:${episode.episodeNumber}`;
    const group = groups.get(key) ?? [];
    group.push(episode);
    groups.set(key, group);
  }

  let removed = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const { keep, dupes } = chooseKeeper(group);

    for (const dupe of dupes) {
      removeDanglingAlias(dupe.filePath);
      await db.delete(tvEpisodes).where(eq(tvEpisodes.id, dupe.id));
      removed++;
    }

    // If the kept row had thinner metadata than a loser, backfill it.
    if (!keep.videoCodec) {
      const donor = dupes.find((dupe) => dupe.videoCodec);
      if (donor) {
        await db
          .update(tvEpisodes)
          .set({
            durationMs: keep.durationMs ?? donor.durationMs ?? null,
            videoCodec: keep.videoCodec ?? donor.videoCodec ?? null,
            audioCodec: keep.audioCodec ?? donor.audioCodec ?? null,
            width: keep.width ?? donor.width ?? null,
            height: keep.height ?? donor.height ?? null,
          })
          .where(eq(tvEpisodes.id, keep.id));
      }
    }
  }

  return removed;
}

async function episodesForLibrary(
  db: DatabaseInstance,
  libraryId: number,
): Promise<EpisodeRow[]> {
  const items = await db.query.mediaItems.findMany({
    where: and(eq(mediaItems.libraryId, libraryId), eq(mediaItems.type, "tv")),
  });
  if (!items.length) return [];

  const seasons = await db.query.tvSeasons.findMany({
    where: inArray(
      tvSeasons.mediaItemId,
      items.map((item) => item.id),
    ),
  });
  if (!seasons.length) return [];

  return db.query.tvEpisodes.findMany({
    where: inArray(
      tvEpisodes.seasonId,
      seasons.map((season) => season.id),
    ),
  });
}
