import { creditTailMs } from "@media-app/shared";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { DatabaseInstance } from "../db/index.js";
import { listContinueWatching } from "./home-rows.js";

function boundId(where: unknown): number | undefined {
  const chunks = (where as { queryChunks?: unknown[] } | null)?.queryChunks ?? [];
  for (const chunk of chunks) {
    if (
      chunk &&
      typeof chunk === "object" &&
      "value" in chunk &&
      typeof (chunk as { value: unknown }).value === "number"
    ) {
      return (chunk as { value: number }).value;
    }
  }
  return undefined;
}

type MockDb = DatabaseInstance & {
  delete: Mock;
};

function createDb(overrides: {
  progress?: Array<{
    id: number;
    itemType: "movie" | "episode";
    itemId: number;
    positionMs: number;
    durationMs: number | null;
    updatedAt: Date;
  }>;
  episodes?: Map<number, { id: number; seasonId: number; episodeNumber: number; title: string; durationMs: number | null; stillPath: string | null }>;
  seasons?: Map<number, { id: number; mediaItemId: number; seasonNumber: number }>;
  media?: Map<number, { id: number; title: string; posterPath: string | null; watchedAt?: Date | null }>;
  movieFiles?: Map<number, { id: number; mediaItemId: number; durationMs: number | null }>;
  deletedIds?: number[];
}) {
  const deletedIds = overrides.deletedIds ?? [];
  const progress = overrides.progress ?? [];
  const episodes = overrides.episodes ?? new Map();
  const seasons = overrides.seasons ?? new Map();
  const media = overrides.media ?? new Map();
  const movieFiles = overrides.movieFiles ?? new Map();

  return {
    query: {
      watchProgress: {
        findMany: vi.fn(async (args?: { limit?: number; offset?: number }) => {
          if (args?.limit == null) return progress;
          const offset = args.offset ?? 0;
          return progress.slice(offset, offset + args.limit);
        }),
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          void where;
          return null;
        }),
      },
      tvEpisodes: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          const id = boundId(where);
          return id != null ? episodes.get(id) ?? null : null;
        }),
        findMany: vi.fn(async (args?: { limit?: number }) => {
          if (args?.limit != null) return [];
          return [...episodes.values()];
        }),
      },
      tvSeasons: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          const id = boundId(where);
          return id != null ? seasons.get(id) ?? null : null;
        }),
        findMany: vi.fn(async (args?: { limit?: number }) => {
          if (args?.limit != null) return [];
          return [...seasons.values()];
        }),
      },
      mediaItems: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          const id = boundId(where);
          return id != null ? media.get(id) ?? null : null;
        }),
        findMany: vi.fn(async () => [...media.values()]),
      },
      movieFiles: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          const id = boundId(where);
          return id != null ? movieFiles.get(id) ?? null : null;
        }),
        findMany: vi.fn(async () => [...movieFiles.values()]),
      },
    },
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        deletedIds.push(...progress.map((entry) => entry.id));
      }),
    })),
  } as unknown as MockDb;
}

describe("listContinueWatching", () => {
  it("removes orphaned progress rows and returns an empty list", async () => {
    const deletedIds: number[] = [];
    const db = createDb({
      progress: [
        {
          id: 1,
          itemType: "episode",
          itemId: 99,
          positionMs: 1000,
          durationMs: 10000,
          updatedAt: new Date(),
        },
      ],
      deletedIds,
    });

    const result = await listContinueWatching(db as DatabaseInstance, { page: 1, limit: 48 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(db.delete).toHaveBeenCalled();
  });

  it("does not surface progress for a media item marked watched", async () => {
    const db = createDb({
      progress: [
        {
          id: 2,
          itemType: "movie",
          itemId: 12,
          positionMs: 120_000,
          durationMs: 600_000,
          updatedAt: new Date(),
        },
      ],
      movieFiles: new Map([
        [12, { id: 12, mediaItemId: 7, durationMs: 600_000 }],
      ]),
      media: new Map([
        [7, { id: 7, title: "Already Seen", posterPath: null, watchedAt: new Date() }],
      ]),
    });

    const result = await listContinueWatching(db as DatabaseInstance);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("drops a movie left in the credits and keeps one still in progress", async () => {
    const durationMs = 120 * 60_000;
    const inCredits = durationMs - creditTailMs(durationMs) + 1_000;
    const db = createDb({
      progress: [
        {
          id: 3,
          itemType: "movie",
          itemId: 30,
          positionMs: inCredits,
          durationMs,
          updatedAt: new Date("2026-10-06T12:00:00Z"),
        },
        {
          id: 4,
          itemType: "movie",
          itemId: 31,
          positionMs: 40 * 60_000,
          durationMs,
          updatedAt: new Date("2026-10-06T11:00:00Z"),
        },
      ],
      movieFiles: new Map([
        [30, { id: 30, mediaItemId: 8, durationMs }],
        [31, { id: 31, mediaItemId: 9, durationMs }],
      ]),
      media: new Map([
        [8, { id: 8, title: "Finished Feature", posterPath: null }],
        [9, { id: 9, title: "Halfway Feature", posterPath: null }],
      ]),
    });

    const result = await listContinueWatching(db as DatabaseInstance);

    expect(result.items.map((item) => item.title)).toEqual(["Halfway Feature"]);
  });

  it("drops a series whose latest episode was left in the credits", async () => {
    const durationMs = 42 * 60_000;
    const inCredits = durationMs - creditTailMs(durationMs) + 1_000;
    const db = createDb({
      progress: [
        {
          id: 5,
          itemType: "episode",
          itemId: 50,
          positionMs: inCredits,
          durationMs,
          updatedAt: new Date(),
        },
      ],
      episodes: new Map([
        [
          50,
          {
            id: 50,
            seasonId: 6,
            episodeNumber: 10,
            title: "Finale",
            durationMs,
            stillPath: null,
          },
        ],
      ]),
      seasons: new Map([
        [6, { id: 6, mediaItemId: 11, seasonNumber: 2 }],
      ]),
      media: new Map([
        [11, { id: 11, title: "Finished Show", posterPath: null }],
      ]),
    });

    const result = await listContinueWatching(db as DatabaseInstance);

    expect(result.items).toEqual([]);
  });

  it("advances a finished episode to the next one in the season", async () => {
    const durationMs = 42 * 60_000;
    const inCredits = durationMs - creditTailMs(durationMs) + 1_000;
    const db = createDb({
      progress: [
        {
          id: 8,
          itemType: "episode",
          itemId: 50,
          positionMs: inCredits,
          durationMs,
          updatedAt: new Date(),
        },
      ],
      episodes: new Map([
        [
          50,
          {
            id: 50,
            seasonId: 6,
            episodeNumber: 1,
            title: "Pilot",
            durationMs,
            stillPath: null,
          },
        ],
        [
          51,
          {
            id: 51,
            seasonId: 6,
            episodeNumber: 2,
            title: "Next",
            durationMs,
            stillPath: "/still.jpg",
          },
        ],
      ]),
      seasons: new Map([[6, { id: 6, mediaItemId: 11, seasonNumber: 1 }]]),
      media: new Map([
        [11, { id: 11, title: "The Show", posterPath: "/poster.jpg" }],
      ]),
    });

    const result = await listContinueWatching(db as DatabaseInstance);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemType: "episode",
      itemId: 51,
      mediaId: 11,
      title: "The Show",
      subtitle: "S1E2 · Next",
      posterPath: "/still.jpg",
      positionMs: 0,
    });
  });

  it("reads one page of progress when an exact total is not required", async () => {
    const durationMs = 120 * 60_000;
    const progress = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      itemType: "movie" as const,
      itemId: 100 + index,
      positionMs: 10_000,
      durationMs,
      updatedAt: new Date(Date.UTC(2026, 0, 5 - index)),
    }));
    const db = createDb({
      progress,
      movieFiles: new Map(
        progress.map((row) => [
          row.itemId,
          { id: row.itemId, mediaItemId: row.itemId, durationMs },
        ]),
      ),
      media: new Map(
        progress.map((row) => [
          row.itemId,
          { id: row.itemId, title: `Movie ${row.itemId}`, posterPath: null },
        ]),
      ),
    });

    const result = await listContinueWatching(db as DatabaseInstance, {
      limit: 1,
      exactTotal: false,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe("Movie 100");
    expect(db.query.watchProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: expect.any(Number) }),
    );
  });
});
