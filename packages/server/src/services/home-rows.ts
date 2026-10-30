import { isWatchCompleted } from "@media-app/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import {
  mediaItems,
  movieFiles,
  tvEpisodes,
  tvSeasons,
  watchProgress,
} from "../db/schema.js";

/** Stay under SQLite's bound-variable cap when a library has a long watch history. */
const ID_CHUNK = 400;
/** Recent progress rows read at a time when the caller only needs one page. */
const PROGRESS_BATCH = 48;

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

async function findByIds<T>(
  ids: number[],
  load: (chunk: number[]) => Promise<T[]>,
): Promise<T[]> {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    rows.push(...(await load(ids.slice(index, index + ID_CHUNK))));
  }
  return rows;
}

type OrderedEpisode = {
  episode: typeof tvEpisodes.$inferSelect;
  season: typeof tvSeasons.$inferSelect;
};

/** One series load per show, shared across every finished episode in this request. */
class SeriesEpisodeIndex {
  private readonly pending = new Map<number, Promise<OrderedEpisode[]>>();

  constructor(private readonly db: DatabaseInstance) {}

  episodes(mediaId: number): Promise<OrderedEpisode[]> {
    let load = this.pending.get(mediaId);
    if (!load) {
      load = this.load(mediaId);
      this.pending.set(mediaId, load);
    }
    return load;
  }

  private async load(mediaId: number): Promise<OrderedEpisode[]> {
    const seasons = await this.db.query.tvSeasons.findMany({
      where: eq(tvSeasons.mediaItemId, mediaId),
    });
    if (!seasons.length) return [];

    const seasonById = new Map(seasons.map((season) => [season.id, season]));
    const episodes = await findByIds(
      seasons.map((season) => season.id),
      (chunk) =>
        this.db.query.tvEpisodes.findMany({
          where: inArray(tvEpisodes.seasonId, chunk),
        }),
    );

    return episodes
      .flatMap((episode) => {
        const season = seasonById.get(episode.seasonId);
        return season ? [{ episode, season }] : [];
      })
      .sort(
        (left, right) =>
          left.season.seasonNumber - right.season.seasonNumber ||
          left.episode.episodeNumber - right.episode.episodeNumber ||
          left.episode.id - right.episode.id,
      );
  }
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
  episode: typeof tvEpisodes.$inferSelect,
  season: typeof tvSeasons.$inferSelect,
  media: typeof mediaItems.$inferSelect,
  series: SeriesEpisodeIndex,
): Promise<ContinueWatchingEntry | null> {
  if (media.watchedAt) return null;

  const ordered = await series.episodes(media.id);
  const start = ordered.findIndex((row) => row.episode.id === episode.id);
  const rows = start >= 0 ? ordered.slice(start) : [{ episode, season }];

  const progressRows = await findByIds(
    rows.map((row) => row.episode.id),
    (chunk) =>
      db.query.watchProgress.findMany({
        where: and(
          eq(watchProgress.itemType, "episode"),
          inArray(watchProgress.itemId, chunk),
        ),
      }),
  );
  const progressByEpisodeId = new Map(
    progressRows.map((row) => [row.itemId, row]),
  );
  progressByEpisodeId.set(progress.itemId, progress);

  for (const row of rows) {
    const episodeProgress = progressByEpisodeId.get(row.episode.id);
    const durationMs =
      episodeProgress?.durationMs ??
      row.episode.durationMs ??
      progress.durationMs ??
      1;
    const positionMs = episodeProgress?.positionMs ?? 0;
    if (isWatchCompleted(positionMs, durationMs)) continue;

    return buildEpisodeContinueEntry(
      progress.id,
      row.episode,
      row.season,
      media,
      positionMs,
      durationMs,
    );
  }

  return null;
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
    findByIds(movieIds, (chunk) =>
      db.query.movieFiles.findMany({ where: inArray(movieFiles.id, chunk) }),
    ),
    findByIds(episodeIds, (chunk) =>
      db.query.tvEpisodes.findMany({ where: inArray(tvEpisodes.id, chunk) }),
    ),
  ]);

  const seasonIds = [...new Set(episodes.map((episode) => episode.seasonId))];
  const seasons = await findByIds(seasonIds, (chunk) =>
    db.query.tvSeasons.findMany({ where: inArray(tvSeasons.id, chunk) }),
  );
  const mediaIds = [
    ...new Set([
      ...files.map((file) => file.mediaItemId),
      ...seasons.map((season) => season.mediaItemId),
    ]),
  ];
  const mediaRows = await findByIds(mediaIds, (chunk) =>
    db.query.mediaItems.findMany({ where: inArray(mediaItems.id, chunk) }),
  );

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
  series: SeriesEpisodeIndex,
): Promise<ContinueWatchingEntry | null> {
  if (progress.itemType === "movie") {
    return resolveMovieFromLookup(progress, lookups);
  }

  const episode = lookups.episodes.get(progress.itemId);
  const season = episode ? lookups.seasons.get(episode.seasonId) : undefined;
  const media = season ? lookups.media.get(season.mediaItemId) : undefined;
  if (!episode || !season || !media || media.watchedAt) return null;

  const durationMs = progress.durationMs ?? episode.durationMs ?? 1;
  if (isWatchCompleted(progress.positionMs, durationMs)) {
    return resolveEpisodeContinueWatchingEntry(
      db,
      progress,
      episode,
      season,
      media,
      series,
    );
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
  options: { page?: number; limit?: number; exactTotal?: boolean } = {},
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
  const exactTotal = options.exactTotal !== false;
  const needed = exactTotal ? Number.POSITIVE_INFINITY : offset + limit;
  const series = new SeriesEpisodeIndex(db);
  const seenTvMediaIds = new Set<number>();
  const seenProgressIds = new Set<number>();
  const orphanIds: number[] = [];
  const items: ContinueWatchingEntry[] = [];

  let progressOffset = 0;
  while (items.length < needed) {
    const batch = await db.query.watchProgress.findMany({
      orderBy: [desc(watchProgress.updatedAt), desc(watchProgress.id)],
      ...(exactTotal
        ? {}
        : { limit: PROGRESS_BATCH, offset: progressOffset }),
    });
    const fresh = batch.filter((entry) => {
      if (seenProgressIds.has(entry.id)) return false;
      seenProgressIds.add(entry.id);
      return true;
    });
    if (!fresh.length) break;

    const lookups = await loadContinueLookups(db, fresh);
    const active: Array<typeof watchProgress.$inferSelect> = [];
    for (const entry of fresh) {
      const missing =
        entry.itemType === "movie"
          ? !lookups.files.has(entry.itemId)
          : !lookups.episodes.has(entry.itemId);
      if (missing) orphanIds.push(entry.id);
      else active.push(entry);
    }

    for (const entry of active) {
      const resolved = await resolveFromLookups(db, entry, lookups, series);
      if (!resolved) continue;
      if (resolved.itemType !== "movie") {
        if (seenTvMediaIds.has(resolved.mediaId)) continue;
        seenTvMediaIds.add(resolved.mediaId);
      }
      items.push(resolved);
      if (items.length >= needed) break;
    }

    if (exactTotal || batch.length < PROGRESS_BATCH) break;
    progressOffset += PROGRESS_BATCH;
  }

  if (orphanIds.length > 0) {
    await db.delete(watchProgress).where(inArray(watchProgress.id, orphanIds));
  }

  const total = items.length;

  return {
    items: items.slice(offset, offset + limit),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function listRecentlyAdded(
  db: DatabaseInstance,
  options: { page?: number; limit?: number; includeTotal?: boolean } = {},
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

  const itemsQuery = db.query.mediaItems.findMany({
    orderBy: [desc(mediaItems.createdAt)],
    limit,
    offset,
  });

  if (options.includeTotal === false) {
    const items = await itemsQuery;
    return {
      items,
      page,
      limit,
      total: items.length,
      totalPages: 1,
    };
  }

  const [items, totalResult] = await Promise.all([
    itemsQuery,
    db.select({ count: sql<number>`count(*)` }).from(mediaItems),
  ]);
  const total = totalResult[0]?.count ?? 0;

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
