import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import type { DatabaseInstance } from "../db/index.js";
import { dedupeDuplicateEpisodes } from "./dedupe-episodes.js";

function createEpisodeTables(sqlite: Database.Database): DatabaseInstance {
  sqlite.exec(`
    CREATE TABLE media_items (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      library_id integer NOT NULL,
      tmdb_id integer,
      imdb_id text,
      title text NOT NULL,
      original_title text,
      overview text,
      year integer,
      poster_path text,
      backdrop_path text,
      theme_path text,
      type text NOT NULL,
      genres text,
      rating real,
      match_confidence real,
      needs_match integer DEFAULT 0,
      watched_at integer,
      created_at integer NOT NULL DEFAULT 0,
      updated_at integer NOT NULL DEFAULT 0
    );
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
      created_at integer NOT NULL
    );
  `);
  return drizzle(sqlite, { schema }) as DatabaseInstance;
}

function insertEpisode(
  sqlite: Database.Database,
  values: {
    seasonId: number;
    episodeNumber: number;
    filePath: string;
    fileSize?: number;
    videoCodec?: string | null;
  },
): number {
  const result = sqlite
    .prepare(
      `INSERT INTO tv_episodes
         (season_id, episode_number, title, file_path, file_size, video_codec, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.seasonId,
      values.episodeNumber,
      `Episode ${values.episodeNumber}`,
      values.filePath,
      values.fileSize ?? null,
      values.videoCodec ?? null,
      0,
    );
  return Number(result.lastInsertRowid);
}

describe("dedupeDuplicateEpisodes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dedupe-eps-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps the live file and removes the dangling duplicate", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = createEpisodeTables(sqlite);

    // A real completed file + a live symlink alias pointing at it.
    const real = path.join(tmpDir, "Dance.Moms.S01E01.1080p.mkv");
    fs.writeFileSync(real, "video");
    const live = path.join(tmpDir, "live.mkv");
    fs.symlinkSync(real, live);

    // A dangling alias left over from an incomplete download that got renamed.
    const dangling = path.join(tmpDir, "dangling.mkv");
    fs.symlinkSync(path.join(tmpDir, "gone.mkv"), dangling);

    const keeper = insertEpisode(sqlite, {
      seasonId: 1,
      episodeNumber: 1,
      filePath: live,
      videoCodec: "h264",
      fileSize: 100,
    });
    const stale = insertEpisode(sqlite, {
      seasonId: 1,
      episodeNumber: 1,
      filePath: dangling,
    });

    const removed = await dedupeDuplicateEpisodes(db);

    expect(removed).toBe(1);
    const rows = sqlite
      .prepare(`SELECT id FROM tv_episodes ORDER BY id`)
      .all() as Array<{ id: number }>;
    expect(rows.map((r) => r.id)).toEqual([keeper]);
    expect(stale).not.toBe(keeper);
    // The dangling symlink is cleaned up from disk.
    expect(fs.existsSync(dangling)).toBe(false);
    // The live alias is untouched.
    expect(fs.existsSync(live)).toBe(true);
  });

  it("does not touch distinct episodes", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = createEpisodeTables(sqlite);

    insertEpisode(sqlite, { seasonId: 1, episodeNumber: 1, filePath: "/a.mkv" });
    insertEpisode(sqlite, { seasonId: 1, episodeNumber: 2, filePath: "/b.mkv" });
    insertEpisode(sqlite, { seasonId: 2, episodeNumber: 1, filePath: "/c.mkv" });

    const removed = await dedupeDuplicateEpisodes(db);
    expect(removed).toBe(0);
    const count = sqlite
      .prepare(`SELECT COUNT(*) as n FROM tv_episodes`)
      .get() as { n: number };
    expect(count.n).toBe(3);
  });

  it("scopes to a single library when asked", async () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = createEpisodeTables(sqlite);

    sqlite
      .prepare(
        `INSERT INTO media_items (id, library_id, title, type) VALUES (1, 10, 'Dance Moms', 'tv')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO tv_seasons (id, media_item_id, season_number) VALUES (1, 1, 1)`,
      )
      .run();

    insertEpisode(sqlite, { seasonId: 1, episodeNumber: 1, filePath: "/x1.mkv" });
    insertEpisode(sqlite, { seasonId: 1, episodeNumber: 1, filePath: "/x2.mkv" });

    const removed = await dedupeDuplicateEpisodes(db, 10);
    expect(removed).toBe(1);
  });
});
