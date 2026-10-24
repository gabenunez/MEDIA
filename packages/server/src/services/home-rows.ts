import { isWatchCompleted } from "@media-app/shared";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
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
    if (media.watchedAt) return null;

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

    if (isWatchCompleted(positionMs, durationMs)) {
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

type ContinueLookups = {
  files: Map<number, typeof movieFiles.$inferSelect>;
  episodes: Map<number, typeof tvEpisodes.$inferSelect>;
  seasons: Map<number, typeof tvSeasons.$inferSelect>;
  media: Map<number, typeof mediaItems.$inferSelect>;
};

async function loadContinueLookups(
  db: DatabaseInstance,
  progress: Array<typeof watchProgress.$inferSelect>,
): Promise<ContinueLookups> {
  const movieIds = [
    ...new Set(
      progress.filter((entry) => entry.itemType === "movie").map((entry) => entry.itemId),
    ),
  ];
  const episodeIds = [
    ...new Set(
      progress.filter((entry) => entry.itemType === "episode").map((entry) => entry.itemId),
    ),
  ];

  const [files, episodes] = await Promise.all([
    movieIds.length
      ? db.query.movieFiles.findMany({ where: inArray(movieFiles.id, movieIds) })
      : Promise.resolve([]),
    episodeIds.length
      ? db.query.tvEpisodes.findMany({ where: inArray(tvEpisodes.id, episodeIds) })
      : Promise.resolve([]),
  ]);

  const seasonIds = [...new Set(episodes.map((episode) => episode.seasonId))];
  const seasons = seasonIds.length
    ? await db.query.tvSeasons.findMany({ where: inArray(tvSeasons.id, seasonIds) })
    : [];
  const mediaIds = [
    ...new Set([
      ...files.map((file) => file.mediaItemId),
      ...seasons.map((season) => season.mediaItemId),
    ]),
  ];
  const mediaRows = mediaIds.length
    ? await db.query.mediaItems.findMany({ where: inArray(mediaItems.id, mediaIds) })
    : [];

  return {
    files: new Map(files.map((file) => [file.id, file])),
    episodes: new Map(episodes.map((episode) => [episode.id, episode])),
    seasons: new Map(seasons.map((season) => [season.id, season])),
    media: new Map(mediaRows.map((item) => [item.id, item])),
  };
}

function resolveMovieFromLookup(
  progress: typeof watchProgress.$inferSelect,
  lookups: ContinueLookups,
): ContinueWatchingEntry | null {
  const file = lookups.files.get(progress.itemId);
  if (!file) return null;
  const media = lookups.media.get(file.mediaItemId);
  if (!media || media.watchedAt) return null;

  const duration = progress.durationMs ?? file.durationMs ?? 1;
  if (isWatchCompleted(progress.positionMs, duration)) return null;

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

async function resolveFromLookups(
  db: DatabaseInstance,
  progress: typeof watchProgress.$inferSelect,
  lookups: ContinueLookups,
): Promise<ContinueWatchingEntry | null> {
  if (progress.itemType === "movie") {
    return resolveMovieFromLookup(progress, lookups);
  }

  const episode = lookups.episodes.get(progress.itemId);
  const season = episode ? lookups.seasons.get(episode.seasonId) : undefined;
  const media = season ? lookups.media.get(season.mediaItemId) : undefined;
  if (!episode || !season || !media) {
    return resolveEpisodeContinueWatchingEntry(db, progress);
  }
  if (media.watchedAt) return null;

  const durationMs = progress.durationMs ?? episode.durationMs ?? 1;
  if (isWatchCompleted(progress.positionMs, durationMs)) {
    return resolveEpisodeContinueWatchingEntry(db, progress);
  }

  return buildEpisodeContinueEntry(
    progress.id,
    episode,
    season,
    media,
    progress.positionMs,
    durationMs,
  );
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

  const allProgress = await db.query.watchProgress.findMany({
    orderBy: [desc(watchProgress.updatedAt)],
  });
  const lookups = await loadContinueLookups(db, allProgress);

  const orphanIds = allProgress
    .filter((entry) =>
      entry.itemType === "movie"
        ? !lookups.files.has(entry.itemId)
        : !lookups.episodes.has(entry.itemId),
    )
    .map((entry) => entry.id);
  if (orphanIds.length > 0) {
    await db.delete(watchProgress).where(inArray(watchProgress.id, orphanIds));
  }

  const activeProgress = allProgress.filter((entry) => !orphanIds.includes(entry.id));

  const items = (
    await Promise.all(
      activeProgress.map((entry) => resolveFromLookups(db, entry, lookups)),
    )
  ).filter((item): item is ContinueWatchingEntry => item != null);

  const seenTvMediaIds = new Set<number>();
  const dedupedItems = items.filter((item) => {
    if (item.itemType === "movie") return true;
    if (seenTvMediaIds.has(item.mediaId)) return false;
    seenTvMediaIds.add(item.mediaId);
    return true;
  });

  const total = dedupedItems.length;

  return {
    items: dedupedItems.slice(offset, offset + limit),
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
