import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import {
  mediaItems,
  movieFiles,
  tvEpisodes,
  tvSeasons,
  watchProgress,
} from "../db/schema.js";

export interface ContinueWatchingEntry {
  id: number;
  itemType: "movie" | "episode";
  itemId: number;
  mediaId: number;
  title: string;
  subtitle?: string;
  posterPath?: string | null;
  positionMs: number;
  durationMs: number;
  percent: number;
}

const WATCH_COMPLETED_FRACTION = 0.95;

async function findNextEpisodeInDb(
  db: DatabaseInstance,
  episodeId: number,
): Promise<{
  episode: typeof tvEpisodes.$inferSelect;
  season: typeof tvSeasons.$inferSelect;
  media: typeof mediaItems.$inferSelect;
} | null> {
  const episode = await db.query.tvEpisodes.findFirst({
    where: eq(tvEpisodes.id, episodeId),
  });
  if (!episode) return null;

  const season = await db.query.tvSeasons.findFirst({
    where: eq(tvSeasons.id, episode.seasonId),
  });
  if (!season) return null;

  const media = await db.query.mediaItems.findFirst({
    where: eq(mediaItems.id, season.mediaItemId),
  });
  if (!media) return null;

  const nextInSeason = await db.query.tvEpisodes.findMany({
    where: and(eq(tvEpisodes.seasonId, season.id), gt(tvEpisodes.episodeNumber, episode.episodeNumber)),
    orderBy: [asc(tvEpisodes.episodeNumber)],
    limit: 1,
  });
  if (nextInSeason[0]) {
    return { episode: nextInSeason[0], season, media };
  }

  const nextSeasons = await db.query.tvSeasons.findMany({
    where: and(
      eq(tvSeasons.mediaItemId, season.mediaItemId),
      gt(tvSeasons.seasonNumber, season.seasonNumber),
    ),
    orderBy: [asc(tvSeasons.seasonNumber)],
    limit: 1,
  });
  const nextSeason = nextSeasons[0];
  if (!nextSeason) return null;

  const firstInNextSeason = await db.query.tvEpisodes.findMany({
    where: eq(tvEpisodes.seasonId, nextSeason.id),
    orderBy: [asc(tvEpisodes.episodeNumber)],
    limit: 1,
  });
  if (!firstInNextSeason[0]) return null;

  return { episode: firstInNextSeason[0], season: nextSeason, media };
}

function buildEpisodeContinueEntry(
  progressId: number,
  episode: typeof tvEpisodes.$inferSelect,
  season: typeof tvSeasons.$inferSelect,
  media: typeof mediaItems.$inferSelect,
  positionMs: number,
  durationMs: number,
): ContinueWatchingEntry {
  return {
    id: progressId,
    itemType: "episode",
    itemId: episode.id,
    mediaId: media.id,
    title: media.title,
    subtitle: `S${season.seasonNumber}E${episode.episodeNumber} · ${episode.title}`,
    posterPath: episode.stillPath ?? media.posterPath,
    positionMs,
    durationMs,
    percent: Math.min(100, (positionMs / durationMs) * 100),
  };
}

async function resolveEpisodeContinueWatchingEntry(
  db: DatabaseInstance,
  progress: typeof watchProgress.$inferSelect,
): Promise<ContinueWatchingEntry | null> {
  let episodeId = progress.itemId;

  while (true) {
    const episode = await db.query.tvEpisodes.findFirst({
      where: eq(tvEpisodes.id, episodeId),
    });
    if (!episode) return null;

    const season = await db.query.tvSeasons.findFirst({
      where: eq(tvSeasons.id, episode.seasonId),
    });
    if (!season) return null;

    const media = await db.query.mediaItems.findFirst({
      where: eq(mediaItems.id, season.mediaItemId),
    });
    if (!media) return null;

    const episodeProgress =
      episodeId === progress.itemId
        ? progress
        : await db.query.watchProgress.findFirst({
            where: and(
              eq(watchProgress.itemType, "episode"),
              eq(watchProgress.itemId, episodeId),
            ),
          });

    const durationMs =
      episodeProgress?.durationMs ?? episode.durationMs ?? progress.durationMs ?? 1;
    const positionMs = episodeProgress?.positionMs ?? 0;
    const percent = positionMs / durationMs;

    if (percent >= WATCH_COMPLETED_FRACTION) {
      const next = await findNextEpisodeInDb(db, episodeId);
      if (!next) return null;
      episodeId = next.episode.id;
      continue;
    }

    return buildEpisodeContinueEntry(
      progress.id,
      episode,
      season,
      media,
      positionMs,
      durationMs,
    );
  }
}

async function resolveContinueWatchingEntry(
  db: DatabaseInstance,
  progress: typeof watchProgress.$inferSelect,
): Promise<ContinueWatchingEntry | null> {
  if (progress.itemType === "movie") {
    const file = await db.query.movieFiles.findFirst({
      where: eq(movieFiles.id, progress.itemId),
    });
    if (!file) return null;

    const media = await db.query.mediaItems.findFirst({
      where: eq(mediaItems.id, file.mediaItemId),
    });
    if (!media) return null;

    const duration = progress.durationMs ?? file.durationMs ?? 1;
    return {
      id: progress.id,
      itemType: "movie",
      itemId: file.id,
      mediaId: media.id,
      title: media.title,
      posterPath: media.posterPath,
      positionMs: progress.positionMs,
      durationMs: duration,
      percent: Math.min(100, (progress.positionMs / duration) * 100),
    };
  }

  const episode = await db.query.tvEpisodes.findFirst({
    where: eq(tvEpisodes.id, progress.itemId),
  });
  if (!episode) return null;

  return resolveEpisodeContinueWatchingEntry(db, progress);
}

export async function listContinueWatching(
  db: DatabaseInstance,
  options: { page?: number; limit?: number } = {},
): Promise<{
  items: ContinueWatchingEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 48));
  const offset = (page - 1) * limit;

  const progressItems = await db.query.watchProgress.findMany({
    orderBy: [desc(watchProgress.updatedAt)],
    limit,
    offset,
  });

  const items = (
    await Promise.all(progressItems.map((entry) => resolveContinueWatchingEntry(db, entry)))
  ).filter((item): item is ContinueWatchingEntry => item != null);

  const seenTvMediaIds = new Set<number>();
  const dedupedItems = items.filter((item) => {
    if (item.itemType === "movie") return true;
    if (seenTvMediaIds.has(item.mediaId)) return false;
    seenTvMediaIds.add(item.mediaId);
    return true;
  });

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(watchProgress);
  const total = totalResult[0]?.count ?? 0;

  return {
    items: dedupedItems,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function listRecentlyAdded(
  db: DatabaseInstance,
  options: { page?: number; limit?: number } = {},
): Promise<{
  items: Array<typeof mediaItems.$inferSelect>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 48));
  const offset = (page - 1) * limit;

  const items = await db.query.mediaItems.findMany({
    orderBy: [desc(mediaItems.createdAt)],
    limit,
    offset,
  });

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaItems);
  const total = totalResult[0]?.count ?? 0;

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
