import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "@media-app/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigManager } from "../config.js";
import { runMigrations, type DatabaseInstance } from "../db/index.js";
import { favorites, libraries, mediaItems, movieFiles, tvEpisodes } from "../db/schema.js";
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

describe("Recently Added after a video is replaced", () => {
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
    const upgraded = writeMovie("dune.2021.2160p.BluRay.mkv", "higher quality file");

    await scanner.scanLibrary(1);

    expect((await listRecentlyAdded(db)).items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(await db.query.movieFiles.findMany()).toMatchObject([{ id: 7, mediaItemId: 1, filePath: upgraded }]);
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
});
