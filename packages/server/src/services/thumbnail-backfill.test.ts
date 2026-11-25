import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../db/index.js";
import { libraries, mediaItems, movieFiles, tvEpisodes, tvSeasons } from "../db/schema.js";
import { ensureThumbnailSprite, thumbnailCacheDir } from "../utils/thumbnails.js";
import { ThumbnailBackfill } from "./thumbnail-backfill.js";

vi.mock("../utils/thumbnails.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../utils/thumbnails.js")>(),
  ensureThumbnailSprite: vi.fn(),
}));

const migrations = fileURLToPath(new URL("../../drizzle", import.meta.url));
const generate = vi.mocked(ensureThumbnailSprite);
let directory: string;
let sqlite: ReturnType<typeof runMigrations>["sqlite"];
let backfill: ThumbnailBackfill;
let moviePath: string;
let episodePath: string;
let cachedMoviePath: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-preview-test-"));
  const database = runMigrations(":memory:", migrations);
  const { db } = database;
  sqlite = database.sqlite;

  const [movieLibrary, tvLibrary] = db.insert(libraries).values([
    { name: "Movies", type: "movies", path: path.join(directory, "movies") },
    { name: "TV shows", type: "tv", path: path.join(directory, "shows") },
  ]).returning().all();
  const [movie, show] = db.insert(mediaItems).values([
    { title: "A movie", type: "movie", libraryId: movieLibrary.id },
    { title: "A show", type: "tv", libraryId: tvLibrary.id },
  ]).returning().all();
  const season = db.insert(tvSeasons).values({
    mediaItemId: show.id, seasonNumber: 1,
  }).returning().get();

  cachedMoviePath = path.join(directory, "cached.mp4");
  moviePath = path.join(directory, "movie.mp4");
  episodePath = path.join(directory, "episode.mp4");
  for (const file of [cachedMoviePath, moviePath, episodePath]) fs.writeFileSync(file, "video");
  const cached = db.insert(movieFiles).values([
    { mediaItemId: movie.id, filePath: cachedMoviePath, durationMs: 45_000 },
    { mediaItemId: movie.id, filePath: moviePath, durationMs: 90_000 },
  ]).returning().all()[0];
  db.insert(tvEpisodes).values({
    seasonId: season.id, episodeNumber: 1, filePath: episodePath, durationMs: 60_000,
  }).run();

  const cachedDir = thumbnailCacheDir(directory, "movie", cached.id);
  fs.mkdirSync(cachedDir, { recursive: true });
  fs.writeFileSync(path.join(cachedDir, "thumbs.vtt"), "WEBVTT");
  fs.writeFileSync(path.join(cachedDir, "sprite.jpg"), "existing JPEG");

  generate.mockReset().mockResolvedValue({ vttPath: "test.vtt", spritePath: "test.webp" });
  backfill = new ThumbnailBackfill(db, directory, {
    onError: (error) => { throw error; },
  });
});

afterEach(() => {
  backfill?.stop();
  sqlite?.close();
  fs.rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("idle preview backfill", () => {
  it("processes missing movies and episodes without rebuilding existing previews", async () => {
    await backfill.runOnce();
    await backfill.runOnce();
    await backfill.runOnce();
    expect(generate.mock.calls.map(([file]) => file)).toEqual([moviePath, episodePath]);
  });

  it("aborts work for playback, waits for all viewers, and retries the interrupted file first", async () => {
    let releaseJob!: () => void;
    generate.mockImplementationOnce(() => new Promise((resolve) => {
      releaseJob = () => resolve(null);
    }));

    const job = backfill.runOnce();
    const signal = generate.mock.calls[0][3];
    await backfill.runOnce();
    expect(generate).toHaveBeenCalledTimes(1);

    backfill.setPlaybackActive("viewer-a", true);
    backfill.setPlaybackActive("viewer-b", true);
    expect(signal.aborted).toBe(true);
    backfill.setPlaybackActive("viewer-a", false);
    releaseJob();
    await job;
    await backfill.runOnce();
    expect(generate).toHaveBeenCalledTimes(1);

    // A viewer disappearing without a stop event cannot lock the queue forever.
    vi.setSystemTime(Date.now() + 120_000);
    await backfill.runOnce();
    await backfill.runOnce();
    expect(generate.mock.calls.map(([file]) => file)).toEqual([moviePath, moviePath, episodePath]);
  });

  it("does not run during a legacy stream or its buffered playback window", async () => {
    const finish = backfill.beginStream();
    vi.setSystemTime(Date.now() + 240_000);
    await backfill.runOnce();
    expect(generate).not.toHaveBeenCalled();

    finish();
    finish(); // Both finish and close can be emitted for a response.
    vi.setSystemTime(Date.now() + 60_000);
    await backfill.runOnce();
    expect(generate).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 180_000);
    await backfill.runOnce();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("lets an unsuccessful title cool down without blocking other titles", async () => {
    generate.mockResolvedValueOnce(null);
    backfill.request({ id: 2, type: "movie", filePath: moviePath, durationMs: 90_000 });
    await backfill.runOnce();
    backfill.request({ id: 2, type: "movie", filePath: moviePath, durationMs: 90_000 });
    await backfill.runOnce();
    expect(generate.mock.calls.map(([file]) => file)).toEqual([moviePath, episodePath]);
  });
});
