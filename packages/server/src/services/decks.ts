import path from "node:path";
import { eq, or, desc, sql, inArray, type SQL } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import {
  libraryDecks,
  libraries,
  mediaItems,
  movieFiles,
  tvSeasons,
  tvEpisodes,
} from "../db/schema.js";
import { validateDeckPath } from "../utils/paths.js";

export function parseDeckPaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function filePathMatchesPrefix(filePath: string, prefix: string): boolean {
  const normalized = path.resolve(prefix);
  const file = path.resolve(filePath);
  return file === normalized || file.startsWith(normalized + path.sep);
}

function buildFilePathConditions(
  column: typeof movieFiles.filePath | typeof tvEpisodes.filePath,
  prefixes: string[],
): SQL | undefined {
  const conditions = prefixes.flatMap((prefix) => {
    const normalized = path.resolve(prefix);
    return [
      eq(column, normalized),
      sql`${column} LIKE ${normalized + path.sep + "%"}`,
    ];
  });

  if (!conditions.length) return undefined;
  return or(...conditions);
}

export async function resolveDeckPaths(
  db: DatabaseInstance,
  paths: string[],
): Promise<{ valid: boolean; error?: string; resolvedPaths?: string[] }> {
  if (!paths.length) {
    return { valid: false, error: "At least one folder path is required" };
  }

  const allLibraries = await db.query.libraries.findMany();
  const libraryRoots = allLibraries.map((lib) => lib.path);
  const resolvedPaths: string[] = [];

  for (const folderPath of paths) {
    const validation = validateDeckPath(folderPath, libraryRoots);
    if (!validation.valid || !validation.resolvedPath) {
      return { valid: false, error: validation.error ?? "Invalid path" };
    }
    if (!resolvedPaths.includes(validation.resolvedPath)) {
      resolvedPaths.push(validation.resolvedPath);
    }
  }

  return { valid: true, resolvedPaths };
}

export async function getDeckMediaItemIds(
  db: DatabaseInstance,
  deckPaths: string[],
): Promise<number[]> {
  if (!deckPaths.length) return [];

  const movieCondition = buildFilePathConditions(movieFiles.filePath, deckPaths);
  const episodeCondition = buildFilePathConditions(
    tvEpisodes.filePath,
    deckPaths,
  );

  const ids = new Set<number>();

  if (movieCondition) {
    const movieRows = await db
      .selectDistinct({ id: mediaItems.id })
      .from(mediaItems)
      .innerJoin(movieFiles, eq(movieFiles.mediaItemId, mediaItems.id))
      .where(movieCondition);
    for (const row of movieRows) ids.add(row.id);
  }

  if (episodeCondition) {
    const tvRows = await db
      .selectDistinct({ id: mediaItems.id })
      .from(mediaItems)
      .innerJoin(tvSeasons, eq(tvSeasons.mediaItemId, mediaItems.id))
      .innerJoin(tvEpisodes, eq(tvEpisodes.seasonId, tvSeasons.id))
      .where(episodeCondition);
    for (const row of tvRows) ids.add(row.id);
  }

  return [...ids];
}

export async function countDeckItems(
  db: DatabaseInstance,
  deckPaths: string[],
): Promise<number> {
  const ids = await getDeckMediaItemIds(db, deckPaths);
  return ids.length;
}

export async function getDeckItems(
  db: DatabaseInstance,
  deckPaths: string[],
  page: number,
  limit: number,
) {
  const ids = await getDeckMediaItemIds(db, deckPaths);
  const offset = (page - 1) * limit;
  const total = ids.length;

  if (!ids.length) {
    return { items: [], page, limit, total: 0, totalPages: 0 };
  }

  const items = await db.query.mediaItems.findMany({
    where: inArray(mediaItems.id, ids),
    orderBy: [desc(mediaItems.updatedAt)],
    limit,
    offset,
  });

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function listDecksWithCounts(db: DatabaseInstance) {
  const decks = await db.query.libraryDecks.findMany({
    orderBy: [libraryDecks.sortOrder, libraryDecks.name],
  });

  return Promise.all(
    decks.map(async (deck) => {
      const paths = parseDeckPaths(deck.paths);
      const itemCount = await countDeckItems(db, paths);
      const libraryNames = await resolveLibraryNamesForPaths(db, paths);

      return {
        id: deck.id,
        name: deck.name,
        paths,
        sortOrder: deck.sortOrder,
        itemCount,
        libraryNames,
        createdAt: deck.createdAt.toISOString(),
      };
    }),
  );
}

async function resolveLibraryNamesForPaths(
  db: DatabaseInstance,
  deckPaths: string[],
): Promise<string[]> {
  const allLibraries = await db.query.libraries.findMany();
  const names = new Set<string>();

  for (const deckPath of deckPaths) {
    for (const lib of allLibraries) {
      if (
        path.resolve(deckPath) === path.resolve(lib.path) ||
        path.resolve(deckPath).startsWith(path.resolve(lib.path) + path.sep)
      ) {
        names.add(lib.name);
      }
    }
  }

  return [...names];
}

export async function createDeck(
  db: DatabaseInstance,
  data: { name: string; paths: string[]; sortOrder?: number },
) {
  const resolved = await resolveDeckPaths(db, data.paths);
  if (!resolved.valid || !resolved.resolvedPaths) {
    throw new Error(resolved.error ?? "Invalid deck paths");
  }

  const [deck] = await db
    .insert(libraryDecks)
    .values({
      name: data.name.trim(),
      paths: JSON.stringify(resolved.resolvedPaths),
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();

  return deck;
}

export async function updateDeck(
  db: DatabaseInstance,
  deckId: number,
  data: { name?: string; paths?: string[]; sortOrder?: number },
) {
  const existing = await db.query.libraryDecks.findFirst({
    where: eq(libraryDecks.id, deckId),
  });
  if (!existing) throw new Error("Deck not found");

  let pathsJson = existing.paths;
  if (data.paths !== undefined) {
    const resolved = await resolveDeckPaths(db, data.paths);
    if (!resolved.valid || !resolved.resolvedPaths) {
      throw new Error(resolved.error ?? "Invalid deck paths");
    }
    pathsJson = JSON.stringify(resolved.resolvedPaths);
  }

  const [deck] = await db
    .update(libraryDecks)
    .set({
      name: data.name?.trim() ?? existing.name,
      paths: pathsJson,
      sortOrder: data.sortOrder ?? existing.sortOrder,
    })
    .where(eq(libraryDecks.id, deckId))
    .returning();

  return deck;
}

export async function deleteDeck(db: DatabaseInstance, deckId: number) {
  await db.delete(libraryDecks).where(eq(libraryDecks.id, deckId));
}

export function inferDeckTypes(
  paths: string[],
  librariesList: Array<{ name: string; type: string; path: string }>,
): Array<"movies" | "tv"> {
  const types = new Set<"movies" | "tv">();

  for (const deckPath of paths) {
    for (const lib of librariesList) {
      if (
        path.resolve(deckPath) === path.resolve(lib.path) ||
        path.resolve(deckPath).startsWith(path.resolve(lib.path) + path.sep)
      ) {
        types.add(lib.type as "movies" | "tv");
      }
    }
  }

  return [...types];
}

/** Exported for tests — checks whether a file belongs to a deck path prefix. */
export function fileMatchesDeckPath(filePath: string, deckPath: string): boolean {
  return filePathMatchesPrefix(filePath, deckPath);
}
