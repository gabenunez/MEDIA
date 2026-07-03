import { and, desc, eq, sql } from "drizzle-orm";
import type { MediaType } from "@reel/shared";
import type { DatabaseInstance } from "../db/index.js";
import { favorites, mediaItems } from "../db/schema.js";

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
  items: Array<typeof mediaItems.$inferSelect>;
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

  const rows = await db
    .select({ item: mediaItems })
    .from(favorites)
    .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
    .where(whereClause)
    .orderBy(desc(favorites.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(favorites)
    .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
    .where(whereClause);

  const total = totalResult[0]?.count ?? 0;

  return {
    items: rows.map((row) => row.item),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function listRecentFavorites(
  db: DatabaseInstance,
  limit = 12,
): Promise<Array<typeof mediaItems.$inferSelect>> {
  const rows = await db
    .select({ item: mediaItems })
    .from(favorites)
    .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
    .orderBy(desc(favorites.createdAt))
    .limit(limit);

  return rows.map((row) => row.item);
}
