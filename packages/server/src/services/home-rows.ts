import { desc, eq, sql } from "drizzle-orm";
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

  const season = await db.query.tvSeasons.findFirst({
    where: eq(tvSeasons.id, episode.seasonId),
  });
  if (!season) return null;

  const media = await db.query.mediaItems.findFirst({
    where: eq(mediaItems.id, season.mediaItemId),
  });
  if (!media) return null;

  const duration = progress.durationMs ?? episode.durationMs ?? 1;
  return {
    id: progress.id,
    itemType: "episode",
    itemId: episode.id,
    mediaId: media.id,
    title: media.title,
    subtitle: `S${season.seasonNumber}E${episode.episodeNumber} · ${episode.title}`,
    posterPath: episode.stillPath ?? media.posterPath,
    positionMs: progress.positionMs,
    durationMs: duration,
    percent: Math.min(100, (progress.positionMs / duration) * 100),
  };
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

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(watchProgress);
  const total = totalResult[0]?.count ?? 0;

  return {
    items,
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
