import { and, like, notInArray, sql } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { mediaItems } from "../db/schema.js";
import { TILE_COLUMNS } from "./media-list.js";

const SEARCH_LIMIT = 24;

export async function searchCatalog(db: DatabaseInstance, query: string, mode?: "tv") {
  const q = query.trim();
  if (!q) return [];

  const tv = mode === "tv";
  const term = tv ? q.replace(/[!%_]/g, (char) => `!${char}`) : q;
  const pattern = `%${term}%`;
  const match = (column: typeof mediaItems.title | typeof mediaItems.overview) =>
    tv ? sql`${column} like ${pattern} escape '!'` : like(column, pattern);
  const prefixMatch = tv
    ? sql`${mediaItems.title} like ${`${term}%`} escape '!'`
    : like(mediaItems.title, `${term}%`);
  const stableTitleOrder = [sql`${mediaItems.title} collate nocase`, mediaItems.id];

  const titleResults = await db.query.mediaItems.findMany({
    columns: TILE_COLUMNS,
    where: match(mediaItems.title),
    orderBy: [
      sql`case
        when ${mediaItems.title} = ${q} collate nocase then 0
        when ${prefixMatch} then 1
        else 2 end`,
      ...stableTitleOrder,
    ],
    limit: SEARCH_LIMIT,
  });
  if (titleResults.length === SEARCH_LIMIT) return titleResults;

  const titleIds = titleResults.map((item) => item.id);
  const overviewMatch = match(mediaItems.overview);
  const overviewResults = await db.query.mediaItems.findMany({
    columns: TILE_COLUMNS,
    where: titleIds.length ? and(overviewMatch, notInArray(mediaItems.id, titleIds)) : overviewMatch,
    orderBy: tv ? stableTitleOrder : undefined,
    limit: SEARCH_LIMIT - titleResults.length,
  });

  return [...titleResults, ...overviewResults];
}
