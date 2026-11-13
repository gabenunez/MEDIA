import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppConfig } from "@media-app/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import type { DatabaseInstance } from "../db/index.js";
import { SubtitleService } from "./subtitles.js";

function createTables(sqlite: Database.Database): DatabaseInstance {
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE media_items (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      library_id integer NOT NULL,
      title text NOT NULL,
      type text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE TABLE movie_files (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      media_item_id integer NOT NULL,
      file_path text NOT NULL UNIQUE,
      created_at integer NOT NULL
    );
    CREATE TABLE tv_episodes (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      season_id integer NOT NULL,
      episode_number integer NOT NULL,
      file_path text NOT NULL UNIQUE,
      created_at integer NOT NULL
    );
    CREATE TABLE subtitles (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      movie_file_id integer REFERENCES movie_files(id) ON DELETE CASCADE,
      episode_id integer REFERENCES tv_episodes(id) ON DELETE CASCADE,
      language text NOT NULL DEFAULT 'und',
      label text,
      source text NOT NULL,
      path_or_index text NOT NULL,
      is_default integer DEFAULT 0
    );
  `);
  return drizzle(sqlite, { schema }) as DatabaseInstance;
}

describe("subtitle cleanup", () => {
  let tmpDir: string;
  let cacheDir: string;
  let externalDir: string;
  let sqlite: Database.Database;
  let db: DatabaseInstance;
  let service: SubtitleService;

  const makeFile = (dir: string, name: string): string => {
    const full = path.join(dir, name);
    fs.writeFileSync(full, "WEBVTT\n\n");
    return full;
  };

  // Insert a subtitle whose owning video does not exist, simulating a row the
  // cascade failed to clean (older data / a prior bug). FK enforcement is
  // toggled off just for the insert so the orphan can exist.
  const insertOrphanSubtitle = (
    ownerCol: "movie_file_id" | "episode_id",
    ownerId: number,
    source: string,
    pathOrIndex: string,
  ) => {
    sqlite.pragma("foreign_keys = OFF");
    sqlite
      .prepare(
        `INSERT INTO subtitles (${ownerCol}, source, path_or_index) VALUES (?, ?, ?)`,
      )
      .run(ownerId, source, pathOrIndex);
    sqlite.pragma("foreign_keys = ON");
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-cleanup-"));
    cacheDir = path.join(tmpDir, "cache", "subtitles");
    externalDir = path.join(tmpDir, "media");
    fs.mkdirSync(externalDir, { recursive: true });

    sqlite = new Database(":memory:");
    db = createTables(sqlite);
    service = new SubtitleService(db, { data_dir: tmpDir } as AppConfig);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prunes rows + cache files for videos that no longer exist", async () => {
    // One existing movie with an embedded sub.
    sqlite
      .prepare(
        "INSERT INTO movie_files (id, media_item_id, file_path, created_at) VALUES (1, 1, '/m/live.mkv', 0)",
      )
      .run();
    const liveCache = makeFile(cacheDir, "movie_1_sub_0.vtt");
    sqlite
      .prepare(
        "INSERT INTO subtitles (movie_file_id, source, path_or_index) VALUES (1, 'embedded', ?)",
      )
      .run(liveCache);

    // An orphaned sub pointing at a movie_file that doesn't exist.
    const orphanCache = makeFile(cacheDir, "movie_999_sub_0.vtt");
    insertOrphanSubtitle("movie_file_id", 999, "opensubtitles", orphanCache);

    const removed = await service.pruneOrphanedSubtitles();

    expect(removed).toBe(1);
    expect(fs.existsSync(orphanCache)).toBe(false); // cache file gone
    expect(fs.existsSync(liveCache)).toBe(true); // live sub untouched

    const rows = sqlite.prepare("SELECT id FROM subtitles").all();
    expect(rows).toHaveLength(1);
  });

  it("removes stray cache files not referenced by any row", async () => {
    const stray = makeFile(cacheDir, "episode_42_sub_2.vtt");
    const removed = await service.pruneOrphanedSubtitles();

    expect(removed).toBe(0); // no DB rows removed
    expect(fs.existsSync(stray)).toBe(false); // but the stray file is swept
  });

  it("never deletes external sidecar files that live outside the cache", async () => {
    const sidecar = makeFile(externalDir, "live.en.srt");
    insertOrphanSubtitle("movie_file_id", 999, "external", sidecar);

    const removed = await service.pruneOrphanedSubtitles();

    expect(removed).toBe(1); // the orphaned DB row is removed
    expect(fs.existsSync(sidecar)).toBe(true); // but the user's file stays
  });

  it("removeForOwner deletes embedded + online cache files before cascade", async () => {
    sqlite
      .prepare(
        "INSERT INTO movie_files (id, media_item_id, file_path, created_at) VALUES (1, 1, '/m/x.mkv', 0)",
      )
      .run();
    const embedded = makeFile(cacheDir, "movie_1_sub_0.vtt");
    const online = makeFile(cacheDir, "os_1_123.vtt");
    const sidecar = makeFile(externalDir, "x.en.srt");
    sqlite
      .prepare(
        "INSERT INTO subtitles (movie_file_id, source, path_or_index) VALUES (1, 'embedded', ?), (1, 'opensubtitles', ?), (1, 'external', ?)",
      )
      .run(embedded, online, sidecar);

    await service.removeForOwner({ movieFileId: 1 });

    expect(fs.existsSync(embedded)).toBe(false);
    expect(fs.existsSync(online)).toBe(false);
    expect(fs.existsSync(sidecar)).toBe(true); // external sidecar preserved
    expect(sqlite.prepare("SELECT id FROM subtitles").all()).toHaveLength(0);
  });
});
