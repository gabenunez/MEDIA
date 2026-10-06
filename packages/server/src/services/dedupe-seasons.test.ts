import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import type { DatabaseInstance } from "../db/index.js";
import { dedupeDuplicateSeasons } from "./dedupe-seasons.js";

const migrationSql = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../drizzle/0008_tv_season_unique.sql",
  ),
  "utf8",
);

function createSeasonTables(sqlite: Database.Database): DatabaseInstance {
  sqlite.exec(`
    CREATE TABLE tv_seasons (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      media_item_id integer NOT NULL,
      season_number integer NOT NULL,
      name text,
      overview text,
      poster_path text,
      air_date text
    );
    CREATE TABLE tv_episodes (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      season_id integer NOT NULL,
      episode_number integer NOT NULL,
      title text,
      overview text,
      file_path text NOT NULL UNIQUE,
      duration_ms integer,
      file_size integer,
      video_codec text,
      audio_codec text,
      width integer,
      height integer,
      still_path text,
      air_date text,
      created_at integer NOT NULL,
      FOREIGN KEY (season_id) REFERENCES tv_seasons(id) ON DELETE CASCADE
    );
  `);
  return drizzle(sqlite, { schema }) as DatabaseInstance;
}

function insertSeason(
  sqlite: Database.Database,
  values: {
    mediaItemId: number;
    seasonNumber: number;
    name: string;
    posterPath?: string | null;
  },
): number {
  const result = sqlite
    .prepare(
      `INSERT INTO tv_seasons (media_item_id, season_number, name, poster_path)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      values.mediaItemId,
      values.seasonNumber,
      values.name,
      values.posterPath ?? null,
    );
  return Number(result.lastInsertRowid);
}

function insertEpisode(
  sqlite: Database.Database,
  seasonId: number,
  episodeNumber: number,
  filePath: string,
): void {
  sqlite
    .prepare(
      `INSERT INTO tv_episodes (season_id, episode_number, title, file_path, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(seasonId, episodeNumber, `Episode ${episodeNumber}`, filePath, 0);
}

describe("dedupeDuplicateSeasons", () => {
  it("merges repeated season rows and keeps episodes from every copy", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = createSeasonTables(sqlite);

    const seasonOne = insertSeason(sqlite, {
      mediaItemId: 1,
      seasonNumber: 1,
      name: "Season 1",
    });
    const seasonSix = [
      insertSeason(sqlite, {
        mediaItemId: 1,
        seasonNumber: 6,
        name: "Season 6",
      }),
      insertSeason(sqlite, {
        mediaItemId: 1,
        seasonNumber: 6,
        name: "Season 6",
        posterPath: "/posters/s6.jpg",
      }),
      insertSeason(sqlite, {
        mediaItemId: 1,
        seasonNumber: 6,
        name: "Season 6",
      }),
      insertSeason(sqlite, {
        mediaItemId: 1,
        seasonNumber: 6,
        name: "Season 6",
      }),
    ];
    const otherShow = insertSeason(sqlite, {
      mediaItemId: 2,
      seasonNumber: 6,
      name: "Season 6",
    });

    insertEpisode(sqlite, seasonOne, 1, "/tv/dance-moms/s01e01.mkv");
    insertEpisode(sqlite, seasonSix[0], 1, "/tv/dance-moms/s06e01.mkv");
    insertEpisode(sqlite, seasonSix[1], 8, "/tv/dance-moms/s06e08.mkv");
    insertEpisode(sqlite, seasonSix[2], 15, "/tv/dance-moms/s06e15.mkv");
    insertEpisode(sqlite, seasonSix[3], 33, "/tv/dance-moms/s06e33.mkv");
    insertEpisode(sqlite, otherShow, 1, "/tv/other/s06e01.mkv");

    const removed = await dedupeDuplicateSeasons(db);

    expect(removed).toBe(3);
    const seasons = sqlite
      .prepare(
        `SELECT id, media_item_id, season_number, poster_path
         FROM tv_seasons
         ORDER BY media_item_id, season_number, id`,
      )
      .all() as Array<{
      id: number;
      media_item_id: number;
      season_number: number;
      poster_path: string | null;
    }>;
    expect(seasons).toEqual([
      {
        id: seasonOne,
        media_item_id: 1,
        season_number: 1,
        poster_path: null,
      },
      {
        id: seasonSix[0],
        media_item_id: 1,
        season_number: 6,
        poster_path: "/posters/s6.jpg",
      },
      {
        id: otherShow,
        media_item_id: 2,
        season_number: 6,
        poster_path: null,
      },
    ]);

    const episodes = sqlite
      .prepare(
        `SELECT season_id, episode_number FROM tv_episodes WHERE season_id = ? ORDER BY episode_number`,
      )
      .all(seasonSix[0]) as Array<{ season_id: number; episode_number: number }>;
    expect(episodes.map((episode) => episode.episode_number)).toEqual([1, 8, 15, 33]);
  });
});

describe("duplicate season migration", () => {
  it("collapses duplicate seasons before adding the unique index", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    createSeasonTables(sqlite);

    const first = insertSeason(sqlite, {
      mediaItemId: 1,
      seasonNumber: 6,
      name: "Season 6",
    });
    const second = insertSeason(sqlite, {
      mediaItemId: 1,
      seasonNumber: 6,
      name: "Season 6",
      posterPath: "/posters/s6.jpg",
    });
    insertEpisode(sqlite, first, 1, "/tv/dance-moms/s06e01.mkv");
    insertEpisode(sqlite, second, 2, "/tv/dance-moms/s06e02.mkv");

    for (const statement of migrationSql.split("--> statement-breakpoint")) {
      sqlite.exec(statement);
    }

    const seasons = sqlite
      .prepare(`SELECT id, poster_path FROM tv_seasons`)
      .all() as Array<{ id: number; poster_path: string | null }>;
    expect(seasons).toEqual([{ id: first, poster_path: "/posters/s6.jpg" }]);

    const episodes = sqlite
      .prepare(`SELECT episode_number FROM tv_episodes ORDER BY episode_number`)
      .all() as Array<{ episode_number: number }>;
    expect(episodes.map((episode) => episode.episode_number)).toEqual([1, 2]);

    expect(() =>
      insertSeason(sqlite, {
        mediaItemId: 1,
        seasonNumber: 6,
        name: "Season 6",
      }),
    ).toThrow(/UNIQUE/);
  });
});
