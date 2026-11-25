import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
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
let db: ReturnType<typeof runMigrations>["db"];
let sqlite: ReturnType<typeof runMigrations>["sqlite"];
let backfill: ThumbnailBackfill;
let moviePath: string;
let episodePath: string;
let movieMediaId: number;
let seasonId: number;

const day = (number: number) => new Date(Date.UTC(2026, 0, number));

function writeVideo(name: string) {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, "video");
  return filePath;
}

function cacheMoviePreview(id: number) {
  const cachedDir = thumbnailCacheDir(directory, "movie", id);
  fs.mkdirSync(cachedDir, { recursive: true });
  fs.writeFileSync(path.join(cachedDir, "thumbs.vtt"), "WEBVTT");
  fs.writeFileSync(path.join(cachedDir, "sprite.jpg"), "existing JPEG");
}

function addEpisode(name: string, createdAt: Date) {
  const filePath = writeVideo(name);
  db.insert(tvEpisodes).values({
    seasonId, episodeNumber: 2, filePath, durationMs: 60_000, createdAt,
  }).run();
  return filePath;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-preview-test-"));
  const database = runMigrations(":memory:", migrations);
  db = database.db;
  sqlite = database.sqlite;

  const [movieLibrary, tvLibrary] = db.insert(libraries).values([
    { name: "Movies", type: "movies", path: path.join(directory, "movies") },
    { name: "TV shows", type: "tv", path: path.join(directory, "shows") },
  ]).returning().all();
  const [movie, show] = db.insert(mediaItems).values([
    { title: "A movie", type: "movie", libraryId: movieLibrary.id, createdAt: day(3) },
    { title: "A show", type: "tv", libraryId: tvLibrary.id, createdAt: day(1) },
  ]).returning().all();
  movieMediaId = movie.id;
  const season = db.insert(tvSeasons).values({
    mediaItemId: show.id, seasonNumber: 1,
  }).returning().get();
  seasonId = season.id;

  const cachedMoviePath = writeVideo("cached.mp4");
  moviePath = writeVideo("movie.mp4");
  episodePath = writeVideo("episode.mp4");
  const cached = db.insert(movieFiles).values([
    { mediaItemId: movie.id, filePath: cachedMoviePath, durationMs: 45_000 },
    { mediaItemId: movie.id, filePath: moviePath, durationMs: 90_000 },
  ]).returning().all()[0];
  db.insert(tvEpisodes).values({
    seasonId, episodeNumber: 1, filePath: episodePath, durationMs: 60_000, createdAt: day(2),
  }).run();

  cacheMoviePreview(cached.id);

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

  it("orders movies and episodes together by import time, including upgraded movies", async () => {
    const newestEpisode = addEpisode("just-added-episode.mp4", day(6));
    const newMovie = db.insert(mediaItems).values({
      title: "Recently imported movie", type: "movie", createdAt: day(4),
      libraryId: db.select({ id: libraries.id }).from(libraries).where(eq(libraries.type, "movies")).get()!.id,
    }).returning().get();
    const newerMoviePath = writeVideo("newer-movie.mp4");
    db.insert(movieFiles).values({ mediaItemId: newMovie.id, filePath: newerMoviePath, durationMs: 60_000 }).run();
    db.update(mediaItems).set({ recentlyAddedAt: day(5) }).where(eq(mediaItems.id, movieMediaId)).run();

    for (let i = 0; i < 4; i++) await backfill.runOnce();
    expect(generate.mock.calls.map(([file]) => file)).toEqual([
      newestEpisode, moviePath, newerMoviePath, episodePath,
    ]);
  });

  it("moves a new episode ahead of an already loaded page of older files", async () => {
    await backfill.runOnce();
    cacheMoviePreview(2);

    const newestEpisode = addEpisode("just-added-episode.mp4", day(6));
    backfill.refreshLibraryQueue();
    await backfill.runOnce();
    await backfill.runOnce();

    expect(generate.mock.calls.map(([file]) => file)).toEqual([moviePath, newestEpisode, episodePath]);
  });

  it("continues past a full page of cached movies with the same import time", async () => {
    db.update(tvEpisodes).set({ createdAt: day(3) }).run();
    const cached = db.insert(movieFiles).values(Array.from({ length: 64 }, (_, index) => ({
      mediaItemId: movieMediaId, filePath: path.join(directory, `cached-${index}.mp4`),
    }))).returning({ id: movieFiles.id }).all();
    for (const { id } of cached) cacheMoviePreview(id);

    await backfill.runOnce();
    expect(generate).not.toHaveBeenCalled();
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
