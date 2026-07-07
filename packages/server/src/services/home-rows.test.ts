import { describe, expect, it, vi, type Mock } from "vitest";
import type { DatabaseInstance } from "../db/index.js";
import { listContinueWatching } from "./home-rows.js";

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
  media?: Map<number, { id: number; title: string; posterPath: string | null }>;
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
        findMany: vi.fn(async () => progress),
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          void where;
          return null;
        }),
      },
      tvEpisodes: {
        findFirst: vi.fn(async ({ where }: { where: { value?: number } }) => {
          const id = where?.value;
          return id != null ? episodes.get(id) ?? null : null;
        }),
        findMany: vi.fn(async () => []),
      },
      tvSeasons: {
        findFirst: vi.fn(async ({ where }: { where: { value?: number } }) => {
          const id = where?.value;
          return id != null ? seasons.get(id) ?? null : null;
        }),
        findMany: vi.fn(async () => []),
      },
      mediaItems: {
        findFirst: vi.fn(async ({ where }: { where: { value?: number } }) => {
          const id = where?.value;
          return id != null ? media.get(id) ?? null : null;
        }),
      },
      movieFiles: {
        findFirst: vi.fn(async ({ where }: { where: { value?: number } }) => {
          const id = where?.value;
          return id != null ? movieFiles.get(id) ?? null : null;
        }),
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
});
