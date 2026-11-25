import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "@media-app/shared";
import chokidar, { type FSWatcher } from "chokidar";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigManager } from "../config.js";
import { runMigrations, type DatabaseInstance } from "../db/index.js";
import { favorites, libraries, mediaItems, movieFiles, subtitles, tvEpisodes, tvSeasons, watchProgress } from "../db/schema.js";
import { probeFile } from "../utils/ffmpeg.js";
import { listRecentlyAdded } from "./home-rows.js";
import { MetadataService } from "./metadata.js";
import { ScannerService } from "./scanner.js";
import { SubtitleService } from "./subtitles.js";
import { ThemeService } from "./themes.js";

vi.mock("../utils/ffmpeg.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../utils/ffmpeg.js")>(),
  probeFile: vi.fn(),
}));
vi.mock("./page-revalidate.js", () => ({
  revalidateCatalog: vi.fn(),
  revalidateMediaPage: vi.fn(),
}));

const migrations = fileURLToPath(new URL("../../drizzle", import.meta.url));
const firstDay = new Date("2024-11-01T00:00:00Z");
const secondDay = new Date("2024-11-02T00:00:00Z");

describe("Catalog changes when videos are replaced or removed", () => {
  let dir: string;
  let db: DatabaseInstance;
  let closeDb: () => void;
  let scanner: ScannerService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-recent-replacement-"));
    const fixture = runMigrations(":memory:", migrations);
    db = fixture.db;
    closeDb = () => fixture.sqlite.close();
    const config = { data_dir: dir, metadata: { tmdb_api_key: "" } } as AppConfig;
    const manager = { get: () => config } as ConfigManager;
    const metadata = new MetadataService(manager);
    const themes = new ThemeService(db, manager, metadata);
    vi.spyOn(themes, "syncThemesForLibrary").mockResolvedValue(undefined);
    vi.mocked(probeFile).mockResolvedValue({
      durationMs: 7200000, videoCodec: "hevc", audioCodec: "aac", width: 3840, height: 2160,
      dynamicRange: { dolbyVision: false, dolbyVisionProfile: null, hdr10: false, hlg: false },
      subtitleStreams: [],
    });
    scanner = new ScannerService(db, manager, metadata, new SubtitleService(db, config), themes);
    db.insert(libraries).values({ id: 1, name: "Movies", type: "movies", path: dir }).run();
  });

  afterEach(() => {
    scanner.stopWatcher(1);
    scanner.stopWatcher(2);
    vi.restoreAllMocks();
    vi.useRealTimers();
    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeMovie(filename: string, contents: string, mtime = firstDay) {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, contents);
    fs.utimesSync(filePath, mtime, mtime);
    return filePath;
  }

  function seedMovies(filePath: string, fileSize: number) {
    db.insert(mediaItems).values([
      { id: 1, libraryId: 1, title: "Dune", year: 2021, type: "movie", createdAt: firstDay },
      { id: 2, libraryId: 1, title: "Arrival", year: 2016, type: "movie", createdAt: secondDay },
    ]).run();
    db.insert(movieFiles).values({ id: 7, mediaItemId: 1, filePath, fileSize, videoCodec: "h264", height: 1080 }).run();
    const arrival = writeMovie("Arrival (2016).mkv", "original");
    db.insert(movieFiles).values({ id: 8, mediaItemId: 2, filePath: arrival, fileSize: 8 }).run();
    db.insert(favorites).values({ mediaItemId: 1 }).run();
  }

  it("leaves legacy items in place on the first scan, then promotes an in-place replacement", async () => {
    const original = "Dune (2021).mkv";
    seedMovies(writeMovie(original, "original"), 8);
    await scanner.scanLibrary(1);
    expect((await listRecentlyAdded(db)).items.map((item) => item.id)).toEqual([2, 1]);

    writeMovie(original, "new copy", secondDay); // Same size, different modification time.
    await scanner.scanLibrary(1);
    expect((await listRecentlyAdded(db, { limit: 1, includeTotal: false })).items[0]?.id).toBe(1);
    expect((await listRecentlyAdded(db, { limit: 1, page: 2 })).items[0]?.id).toBe(2);
    expect(await db.query.movieFiles.findFirst()).toMatchObject({ id: 7, videoCodec: "hevc", height: 2160 });
    const updated = await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, 1) });
    expect(updated?.createdAt).toEqual(firstDay);

    await scanner.scanLibrary(1);
    const rescanned = await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, 1) });
    expect(rescanned?.recentlyAddedAt).toEqual(updated?.recentlyAddedAt);
  });

  it("recognizes a same-path upgrade by size even before mtime has been recorded", async () => {
    seedMovies(writeMovie("Dune (2021).mkv", "higher quality file"), 8);
    await scanner.scanLibrary(1);
    expect((await listRecentlyAdded(db)).items.map((item) => item.id)).toEqual([1, 2]);
    expect(await db.query.movieFiles.findFirst()).toMatchObject({ id: 7, fileSize: 19 });
  });

  it("reuses the movie for a renamed quality upgrade without merging a remake", async () => {
    seedMovies(path.join(dir, "Dune (2021) 1080p.mkv"), 8);
    db.insert(mediaItems).values({
      id: 3, libraryId: 1, title: "Dune", year: 1984, type: "movie", createdAt: firstDay,
    }).run();
    const remake = writeMovie("Dune (1984).mkv", "original");
    db.insert(movieFiles).values({ mediaItemId: 3, filePath: remake, fileSize: 8 }).run();
    const upgraded = writeMovie("dune.2021.2160p.BluRay.mkv", "higher quality file");

    await scanner.scanLibrary(1);

    expect((await listRecentlyAdded(db)).items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(await db.query.movieFiles.findMany({ where: eq(movieFiles.mediaItemId, 1) }))
      .toMatchObject([{ id: 7, mediaItemId: 1, filePath: upgraded }]);
    expect(await db.query.favorites.findFirst()).toMatchObject({ mediaItemId: 1 });
  });

  it("moves a show up when one of its episodes is replaced", async () => {
    const tvDir = path.join(dir, "TV");
    fs.mkdirSync(path.join(tvDir, "Example Show"), { recursive: true });
    db.insert(libraries).values({ id: 2, name: "TV", type: "tv", path: tvDir }).run();
    const filePath = writeMovie("TV/Example Show/Example.Show.S01E01.mkv", "original");
    await scanner.scanLibrary(2);
    const [show] = await db.query.mediaItems.findMany();
    db.update(mediaItems).set({ recentlyAddedAt: firstDay }).where(eq(mediaItems.id, show.id)).run();
    db.insert(mediaItems).values({ libraryId: 1, title: "Arrival", type: "movie", createdAt: secondDay }).run();
    expect((await listRecentlyAdded(db)).items[0]?.title).toBe("Arrival");

    fs.appendFileSync(filePath, " upgrade");
    await scanner.scanLibrary(2);

    expect((await listRecentlyAdded(db)).items[0]?.id).toBe(show.id);
    expect(await db.query.tvEpisodes.findMany()).toMatchObject([{ filePath, fileSize: 16 }]);
  });

  it("removes a movie and its metadata on rescan once its last file is deleted", async () => {
    const original = writeMovie("Dune (2021).mkv", "original");
    seedMovies(original, 8);
    db.insert(watchProgress).values({ itemType: "movie", itemId: 7, positionMs: 3000 }).run();
    db.insert(subtitles).values({ movieFileId: 7, source: "external", pathOrIndex: path.join(dir, "Dune.srt") }).run();
    const alternate = writeMovie("Dune (2021) 2160p.mkv", "higher quality");
    await scanner.scanLibrary(1);

    fs.unlinkSync(original);
    await scanner.scanLibrary(1);
    expect(await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, 1) })).toMatchObject({ title: "Dune" });
    expect(await db.query.movieFiles.findMany({ where: eq(movieFiles.mediaItemId, 1) }))
      .toMatchObject([{ filePath: alternate }]);

    fs.unlinkSync(alternate);
    await scanner.scanLibrary(1);
    expect((await listRecentlyAdded(db)).items.map(item => item.title)).toEqual(["Arrival"]);
    expect(await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, 1) })).toBeUndefined();
    expect(await db.query.favorites.findMany()).toEqual([]);
    expect(await db.query.subtitles.findMany()).toEqual([]);
    expect(await db.query.watchProgress.findMany()).toEqual([]);
  });

  function watchLibrary(libraryId: number, root: string) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
    vi.spyOn(chokidar, "watch").mockReturnValue(watcher as unknown as FSWatcher);
    scanner.startWatcher(libraryId, root);
    return watcher;
  }

  it("removes an empty season, then removes the show only when its final episode is deleted", async () => {
    const tvDir = path.join(dir, "TV");
    fs.mkdirSync(path.join(tvDir, "Example Show"), { recursive: true });
    db.insert(libraries).values({ id: 2, name: "TV", type: "tv", path: tvDir }).run();
    const first = writeMovie("TV/Example Show/Example.Show.S01E01.mkv", "season one");
    const last = writeMovie("TV/Example Show/Example.Show.S02E01.mkv", "season two");
    await scanner.scanLibrary(2);
    const watcher = watchLibrary(2, tvDir);

    fs.unlinkSync(first);
    watcher.emit("unlink", first);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await db.query.tvSeasons.findMany()).toMatchObject([{ seasonNumber: 2 }]);
    expect((await listRecentlyAdded(db)).items[0]?.title).toBe("Example Show");

    fs.unlinkSync(last);
    watcher.emit("unlink", last);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await db.query.tvSeasons.findMany()).toEqual([]);
    expect((await listRecentlyAdded(db)).items).toEqual([]);
  });

  it("keeps the title and favorite when a differently named replacement arrives during cleanup delay", async () => {
    const original = writeMovie("Dune (2021).mkv", "original");
    seedMovies(original, 8);
    const watcher = watchLibrary(1, dir);
    fs.unlinkSync(original);
    watcher.emit("unlink", original);
    await vi.advanceTimersByTimeAsync(1000);
    const replacement = writeMovie("Dune.2021.2160p.mkv", "higher quality");
    watcher.emit("add", replacement);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await db.query.movieFiles.findMany({ where: eq(movieFiles.mediaItemId, 1) }))
      .toMatchObject([{ id: 7, filePath: replacement }]);
    expect(await db.query.favorites.findFirst()).toMatchObject({ mediaItemId: 1 });
    expect((await listRecentlyAdded(db)).items[0]?.id).toBe(1);
  });

  it("preserves metadata when the watched library root changes, and only clears an empty scan on request", async () => {
    const original = writeMovie("Dune (2021).mkv", "original");
    seedMovies(original, 8);
    const watcher = watchLibrary(1, dir);
    const formerRoot = dir + "-unmounted";
    fs.renameSync(dir, formerRoot);
    fs.mkdirSync(dir);
    try {
      watcher.emit("unlink", original);
      await vi.advanceTimersByTimeAsync(12_000);
      await scanner.scanLibrary(1);
      expect((await listRecentlyAdded(db)).items).toHaveLength(2);

      await scanner.scanLibrary(1, { reconcileEmpty: true });
      expect((await listRecentlyAdded(db)).items).toEqual([]);
    } finally {
      fs.rmSync(formerRoot, { recursive: true, force: true });
    }
  });
});
