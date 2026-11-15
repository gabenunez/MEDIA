import { and, desc, eq, sql } from "drizzle-orm";
import type { MediaType } from "@media-app/shared";
import type { DatabaseInstance } from "../db/index.js";
import { favorites, mediaItems } from "../db/schema.js";
import type { TileMediaItem } from "./media-list.js";

/** The mediaItems columns list tiles need — mirrors TILE_COLUMNS for the
 * lower-level select() joins used here. */
const tileSelect = {
  id: mediaItems.id,
  libraryId: mediaItems.libraryId,
  title: mediaItems.title,
  year: mediaItems.year,
  posterPath: mediaItems.posterPath,
  backdropPath: mediaItems.backdropPath,
  type: mediaItems.type,
} as const;

export async function isFavorite(
  db: DatabaseInstance,
  mediaItemId: number,
): Promise<boolean> {
  const row = await db.query.favorites.findFirst({
    where: eq(favorites.mediaItemId, mediaItemId),
  });
  return Boolean(row);
}

export async function addFavorite(
  db: DatabaseInstance,
  mediaItemId: number,
): Promise<void> {
  const item = await db.query.mediaItems.findFirst({
    where: eq(mediaItems.id, mediaItemId),
  });
  if (!item) {
    throw new Error("Media item not found");
  }

  const existing = await db.query.favorites.findFirst({
    where: eq(favorites.mediaItemId, mediaItemId),
  });
  if (existing) return;

  await db.insert(favorites).values({ mediaItemId });
}

export async function removeFavorite(
  db: DatabaseInstance,
  mediaItemId: number,
): Promise<void> {
  await db.delete(favorites).where(eq(favorites.mediaItemId, mediaItemId));
}

export async function listFavorites(
  db: DatabaseInstance,
  options: { page?: number; limit?: number; type?: MediaType } = {},
): Promise<{
  items: TileMediaItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 48));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (options.type) {
    conditions.push(eq(mediaItems.type, options.type));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const [items, totalResult] = await Promise.all([
    db
      .select(tileSelect)
      .from(favorites)
      .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
      .where(whereClause)
      .orderBy(desc(favorites.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(favorites)
      .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
      .where(whereClause),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function listRecentFavorites(
  db: DatabaseInstance,
  limit = 12,
): Promise<TileMediaItem[]> {
  return db
    .select(tileSelect)
    .from(favorites)
    .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
    .orderBy(desc(favorites.createdAt))
    .limit(limit);
}
