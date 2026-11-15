import type { mediaItems } from "../db/schema.js";

/**
 * The only MediaItem fields poster/row tiles actually render:
 *  - id/libraryId: keys + routing
 *  - title/year/type: label
 *  - posterPath: tile art
 *  - backdropPath: the home "featured" hero background (first recent item)
 *
 * Everything else (overview, genres, rating, tmdbId/imdbId, needsMatch,
 * matchConfidence, watchedAt, originalTitle, themePath/themeCheckedAt,
 * createdAt/updatedAt) is never read on a list tile and only bloats catalog
 * payloads — `overview` alone is the dominant per-row cost.
 */
export const TILE_COLUMNS = {
  id: true,
  libraryId: true,
  title: true,
  year: true,
  posterPath: true,
  backdropPath: true,
  type: true,
} as const;

/** A media row trimmed to just the fields list tiles render. */
export type TileMediaItem = Pick<
  typeof mediaItems.$inferSelect,
  "id" | "libraryId" | "title" | "year" | "posterPath" | "backdropPath" | "type"
>;
