import fs from "node:fs";
import path from "node:path";
import { eq, and, or, isNull, inArray, notExists, sql } from "drizzle-orm";
import chokidar, { type FSWatcher } from "chokidar";
import PQueue from "p-queue";
import {
  parseMovieFilename,
  parseEpisodeFromPath,
  isVideoFile,
  isUnknownVideoCandidate,
  isSubtitleFile,
  isExcludedFromVideoProbe,
  SKIP_SCAN_DIR_NAMES,
} from "@media-app/shared";
import type { ConfigManager } from "../config.js";
import type { DatabaseInstance } from "../db/index.js";
import {
  libraries,
  mediaItems,
  movieFiles,
  tvSeasons,
  tvEpisodes,
  scanJobs,
  watchProgress,
} from "../db/schema.js";
import { dedupeDuplicateSeasons } from "./dedupe-seasons.js";
import { dedupeDuplicateEpisodes } from "./dedupe-episodes.js";
import { MetadataService } from "./metadata.js";
import { SubtitleService } from "./subtitles.js";
import { ThemeService } from "./themes.js";
import { walkMediaTree } from "./library-walk.js";
import { revalidateCatalog, revalidateMediaPage } from "./page-revalidate.js";
import { probeFile } from "../utils/ffmpeg.js";

/** One or two files at a time. A full series must not spawn an ffprobe per episode. */
const LIBRARY_INGEST_CONCURRENCY = 2;
const CATALOG_REVALIDATE_DELAY_MS = 1500;
// A new quality version can arrive just after the old filename is removed.
const WATCH_REMOVAL_DELAY_MS = 10_000;

type LibraryRoot = { path: string; device: number; inode: number };
type ScanOptions = { reconcileEmpty?: boolean };

function readLibraryRoot(libraryPath: string): LibraryRoot | null {
  try {
    const stat = fs.statSync(libraryPath);
    if (!stat.isDirectory()) return null;
    fs.accessSync(libraryPath, fs.constants.R_OK | fs.constants.X_OK);
    return { path: libraryPath, device: stat.dev, inode: stat.ino };
  } catch {
    return null;
  }
}

function isSameLibraryRoot(root: LibraryRoot): boolean {
  const current = readLibraryRoot(root.path);
  return current?.device === root.device && current.inode === root.inode;
}

function isMissingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath, { throwIfNoEntry: false }) === undefined;
  } catch {
    // Permission and network errors do not confirm a deletion.
    return false;
  }
}

type VideoFileStats = { fileSize: number; fileMtimeMs: number };
type VideoProbe = Awaited<ReturnType<typeof probeFile>>;

function videoMetadata(probe: VideoProbe) {
  return {
    durationMs: probe?.durationMs ?? null,
    videoCodec: probe?.videoCodec ?? null,
    audioCodec: probe?.audioCodec ?? null,
    width: probe?.width ?? null,
    height: probe?.height ?? null,
  };
}

function existingVideoUpdate(
  existing: typeof movieFiles.$inferSelect | typeof tvEpisodes.$inferSelect,
  stats: VideoFileStats,
  probe: VideoProbe,
) {
  // Files imported before mtime tracking get a baseline without moving in
  // Recently Added unless we can see that the stored size already changed.
  const replaced =
    (existing.fileSize != null && existing.fileSize !== stats.fileSize) ||
    (existing.fileMtimeMs != null && existing.fileMtimeMs !== stats.fileMtimeMs);
  const metadata = videoMetadata(probe);
  const fields = replaced
    ? metadata
    : {
        durationMs: existing.durationMs ?? metadata.durationMs,
        videoCodec: existing.videoCodec ?? metadata.videoCodec,
        audioCodec: existing.audioCodec ?? metadata.audioCodec,
        width: existing.width ?? metadata.width,
        height: existing.height ?? metadata.height,
      };
  const changed =
    replaced || existing.fileSize == null || existing.fileMtimeMs == null ||
    (Object.keys(fields) as Array<keyof typeof fields>).some(
      (field) => fields[field] !== existing[field],
    );
  return { replaced, values: changed ? { ...stats, ...fields } : null };
}

export class ScannerService {
  private watchers = new Map<number, FSWatcher>();
  private pendingRemovals = new Map<number, { paths: Set<string>; timer: ReturnType<typeof setTimeout> }>();
  private scanningLibraries = new Set<number>();
  private activeScan: { libraryId: number; jobId: number } | null = null;
  private seasonCreateChain = new Map<string, Promise<void>>();
  private mediaCreateChain = new Map<string, Promise<void>>();
  private ingestQueue = new PQueue({ concurrency: LIBRARY_INGEST_CONCURRENCY });
  private ingestingPaths = new Map<string, Promise<void>>();
  private pendingMediaIds = new Set<number>();
  private revalidateTimer: ReturnType<typeof setTimeout> | null = null;
  private loggedIngestBacklog = false;

  constructor(
    private db: DatabaseInstance,
    private configManager: ConfigManager,
    private metadata: MetadataService,
    private subtitles: SubtitleService,
    private themes: ThemeService,
  ) {}

  private get config() {
    return this.configManager.get();
  }

  async initializeLibraries(): Promise<void> {
    // Merge duplicate show rows first so season/episode dedupe can then
    // consolidate across what used to be separate show entries.
    const removedShows = await this.dedupeTvShows();
    if (removedShows > 0) {
      console.log(`Merged ${removedShows} duplicate TV show(s)`);
    }

    const removedSeasons = await dedupeDuplicateSeasons(this.db);
    if (removedSeasons > 0) {
      console.log(`Merged ${removedSeasons} duplicate TV season(s)`);
    }

    const removedEpisodes = await dedupeDuplicateEpisodes(this.db);
    if (removedEpisodes > 0) {
      console.log(`Removed ${removedEpisodes} duplicate TV episode(s)`);
    }

    const removedSubtitles = await this.subtitles.pruneOrphanedSubtitles();
    if (removedSubtitles > 0) {
      console.log(`Removed ${removedSubtitles} orphaned subtitle(s)`);
    }

    for (const libConfig of this.config.libraries) {
      const existing = await this.db.query.libraries.findFirst({
        where: eq(libraries.path, libConfig.path),
      });

      if (!existing) {
        await this.db.insert(libraries).values({
          name: libConfig.name,
          type: libConfig.type,
          path: libConfig.path,
        });
      } else if (
        existing.name !== libConfig.name ||
        existing.type !== libConfig.type
      ) {
        await this.db
          .update(libraries)
          .set({ name: libConfig.name, type: libConfig.type })
          .where(eq(libraries.id, existing.id));
      }
    }

    const allLibraries = await this.db.query.libraries.findMany();
    for (const lib of allLibraries) {
      const stillConfigured = this.config.libraries.some((c) => c.path === lib.path);
      if (!stillConfigured) continue;

      this.startWatcher(lib.id, lib.path);
      this.scheduleScan(lib.id);
    }
  }

  /** Run a library scan in the background without blocking the caller. */
  scheduleScan(libraryId: number, options?: ScanOptions): void {
    void this.scanLibrary(libraryId, options).catch((err) => {
      console.error(
        `Background scan failed for library ${libraryId}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }

  /**
   * Import files through a small queue. Watcher events for a full series
   * arrive together; running them all at once exhausts memory and can exit
   * the process on the first failed insert.
   */
  private enqueueIngest(filePath: string, work: () => Promise<void>): Promise<void> {
    const existing = this.ingestingPaths.get(filePath);
    if (existing) return existing;

    const backlog = this.ingestQueue.size + this.ingestQueue.pending;
    if (backlog >= 20 && !this.loggedIngestBacklog) {
      this.loggedIngestBacklog = true;
      console.warn(
        `Library ingest backlog is ${backlog} files; importing a few at a time so the server stays up`,
      );
    }

    const task = this.ingestQueue
      .add(async () => {
        try {
          await work();
        } catch (err) {
          console.error(
            `Failed to import ${filePath}:`,
            err instanceof Error ? err.message : err,
          );
        }
      })
      .then(() => undefined)
      .finally(() => {
        if (this.ingestingPaths.get(filePath) === task) {
          this.ingestingPaths.delete(filePath);
        }
        if (this.ingestQueue.size + this.ingestQueue.pending === 0) {
          this.loggedIngestBacklog = false;
        }
      });

    this.ingestingPaths.set(filePath, task);
    return task;
  }

  private async importWatchedFile(libraryId: number, filePath: string): Promise<void> {
    try {
      await this.enqueueIngest(filePath, async () => {
        if (!(await this.isMediaVideoFile(filePath))) return;
        const lib = await this.db.query.libraries.findFirst({
          where: eq(libraries.id, libraryId),
        });
        if (lib) await this.processFile(lib, filePath);
      });
    } catch (err) {
      console.error(
        `Failed to import ${filePath}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  private queueWatchedRemoval(libraryId: number, filePaths: Iterable<string>, canReconcile: () => boolean): void {
    const pending = this.pendingRemovals.get(libraryId);
    if (pending) clearTimeout(pending.timer);
    const paths = pending?.paths ?? new Set<string>();
    for (const filePath of filePaths) paths.add(filePath);
    const timer = setTimeout(() => {
      this.pendingRemovals.delete(libraryId);
      if (!canReconcile()) return;
      if (this.scanningLibraries.has(libraryId)) {
        this.queueWatchedRemoval(libraryId, paths, canReconcile);
        return;
      }
      void this.reconcileRemovals(libraryId, paths, canReconcile).catch((err) => {
        console.error(`Failed to reconcile deleted files in library ${libraryId}:`, err);
      });
    }, WATCH_REMOVAL_DELAY_MS);
    timer.unref?.();
    this.pendingRemovals.set(libraryId, { paths, timer });
  }

  /** Coalesce per-episode page rebuilds into one catalog refresh. */
  private scheduleCatalogRevalidate(mediaItemId: number): void {
    if (mediaItemId > 0) this.pendingMediaIds.add(mediaItemId);
    if (this.revalidateTimer) return;
    this.revalidateTimer = setTimeout(() => {
      this.revalidateTimer = null;
      this.flushCatalogRevalidate();
    }, CATALOG_REVALIDATE_DELAY_MS);
    this.revalidateTimer.unref?.();
  }

  private flushCatalogRevalidate(revalidateEvenIfEmpty = false): void {
    if (this.revalidateTimer) {
      clearTimeout(this.revalidateTimer);
      this.revalidateTimer = null;
    }
    const ids = [...this.pendingMediaIds];
    this.pendingMediaIds.clear();
    for (const id of ids) {
      void revalidateMediaPage(id, { alsoHome: false });
    }
    if (ids.length > 0 || revalidateEvenIfEmpty) void revalidateCatalog();
  }

  private shouldSkipScanEntry(name: string, isDirectory: boolean): boolean {
    if (name.startsWith(".")) return true;
    if (isDirectory && SKIP_SCAN_DIR_NAMES.has(name)) return true;
    return false;
  }

  private pathHasSkippedSegment(watchPath: string): boolean {
    for (const segment of watchPath.split(/[/\\]/)) {
      if (!segment) continue;
      if (segment.startsWith(".")) return true;
      if (SKIP_SCAN_DIR_NAMES.has(segment)) return true;
    }
    return false;
  }

  private shouldWatchPath(
    watchPath: string,
    stats?: { isDirectory: () => boolean; isFile: () => boolean },
  ): boolean {
    if (this.pathHasSkippedSegment(watchPath)) return true;

    const name = path.basename(watchPath);
    if (this.shouldSkipScanEntry(name, stats?.isDirectory() ?? false)) {
      return true;
    }
    if (stats?.isFile()) {
      if (isVideoFile(name) || isSubtitleFile(name)) return false;
      if (isExcludedFromVideoProbe(name)) return true;
      const ext = path.extname(name).toLowerCase();
      if (ext && ext !== "") return true;
    }
    return false;
  }

  startWatcher(libraryId: number, libraryPath: string): void {
    if (this.watchers.has(libraryId)) return;

    const root = readLibraryRoot(libraryPath);
    if (!root) {
      console.warn(`Library path is unavailable: ${libraryPath}`);
      return;
    }

    const watcher = chokidar.watch(libraryPath, {
      ignored: (watchPath, stats) => this.shouldWatchPath(watchPath, stats),
      persistent: true,
      ignoreInitial: true,
      depth: 8,
      followSymlinks: true,
      ignorePermissionErrors: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500,
      },
    });

    watcher.on("error", (err) => {
      console.warn(
        `File watcher error for library ${libraryId}:`,
        err instanceof Error ? err.message : err,
      );
    });

    const importFile = (filePath: string) => { void this.importWatchedFile(libraryId, filePath); };
    watcher.on("add", importFile);
    watcher.on("change", importFile);

    const canReconcile = () => this.watchers.get(libraryId) === watcher && isSameLibraryRoot(root);
    watcher.on("unlink", (filePath) => {
      this.queueWatchedRemoval(libraryId, [filePath], canReconcile);
    });

    this.watchers.set(libraryId, watcher);
  }

  async scanLibrary(libraryId: number, options: ScanOptions = {}): Promise<void> {
    if (this.scanningLibraries.has(libraryId)) return;
    this.scanningLibraries.add(libraryId);
    try {
      await this.runLibraryScan(libraryId, options);
    } finally {
      this.scanningLibraries.delete(libraryId);
    }
  }

  private async runLibraryScan(libraryId: number, options: ScanOptions): Promise<void> {
    const lib = await this.db.query.libraries.findFirst({
      where: eq(libraries.id, libraryId),
    });
    if (!lib) throw new Error(`Library ${libraryId} not found`);
    const root = readLibraryRoot(lib.path);
    if (!root) {
      throw new Error(`Library path is unavailable: ${lib.path}`);
    }

    const [job] = await this.db
      .insert(scanJobs)
      .values({
        libraryId,
        status: "running",
        progress: 0,
        message: "Scanning files...",
        startedAt: new Date(),
      })
      .returning();

    this.activeScan = { libraryId, jobId: job.id };

    try {
      const files = await this.collectVideoFiles(lib.path);
      let processed = 0;

      for (const filePath of files) {
        await this.enqueueIngest(filePath, () => this.processFile(lib, filePath));
        processed++;
        const progress = Math.round((processed / files.length) * 100);
        await this.db
          .update(scanJobs)
          .set({ progress, message: `Processed ${processed}/${files.length} files` })
          .where(eq(scanJobs.id, job.id));
      }

      await this.db
        .update(libraries)
        .set({ lastScannedAt: new Date() })
        .where(eq(libraries.id, libraryId));

      if (lib.type === "tv") {
        const merged = await this.dedupeTvShows(libraryId);
        if (merged > 0) {
          console.log(`Merged ${merged} duplicate TV show(s) in ${lib.name}`);
        }
        const removedSeasons = await dedupeDuplicateSeasons(this.db, libraryId);
        if (removedSeasons > 0) {
          console.log(`Merged ${removedSeasons} duplicate TV season(s) in ${lib.name}`);
        }
        const removedEpisodes = await dedupeDuplicateEpisodes(this.db, libraryId);
        if (removedEpisodes > 0) {
          console.log(
            `Removed ${removedEpisodes} duplicate TV episode(s) in ${lib.name}`,
          );
        }
      }

      // An unmounted volume can expose an empty directory during a startup
      // scan. A manual scan or a watcher on the original directory can clear it.
      if ((files.length > 0 || options.reconcileEmpty) && isSameLibraryRoot(root)) {
        await this.reconcileRemovals(libraryId, this.unseenFiles(libraryId, new Set(files)),
          () => isSameLibraryRoot(root), true);
      }

      const removedSubtitles = await this.subtitles.pruneOrphanedSubtitles();
      if (removedSubtitles > 0) {
        console.log(
          `Removed ${removedSubtitles} orphaned subtitle(s) after scanning ${lib.name}`,
        );
      }

      await this.db
        .update(scanJobs)
        .set({
          status: "completed",
          progress: 100,
          message: `Scan complete: ${files.length} files`,
          completedAt: new Date(),
        })
        .where(eq(scanJobs.id, job.id));

      if (this.metadata.isConfigured()) {
        await this.refreshMetadata(libraryId);
      }

      await this.themes.syncThemesForLibrary(libraryId);
      this.flushCatalogRevalidate(true);
    } catch (err) {
      await this.db
        .update(scanJobs)
        .set({
          status: "failed",
          message: err instanceof Error ? err.message : "Scan failed",
          completedAt: new Date(),
        })
        .where(eq(scanJobs.id, job.id));
      throw err;
    } finally {
      this.activeScan = null;
    }
  }

  getActiveScan() {
    return this.activeScan;
  }

  async refreshMetadata(
    libraryId?: number,
  ): Promise<{ updated: number; skipped: number }> {
    if (!this.metadata.isConfigured()) {
      return { updated: 0, skipped: 0 };
    }

    const conditions = [
      or(isNull(mediaItems.tmdbId), eq(mediaItems.needsMatch, true)),
    ];
    if (libraryId !== undefined) {
      conditions.push(eq(mediaItems.libraryId, libraryId));
    }

    const items = await this.db.query.mediaItems.findMany({
      where: and(...conditions),
    });

    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      const success =
        item.type === "movie"
          ? await this.refreshMovieItem(item)
          : await this.refreshTvItem(item);
      if (success) updated++;
      else skipped++;
    }

    return { updated, skipped };
  }

  /**
   * Apply a user-chosen TMDB match (from the Fix match UI). Confidence is
   * forced to 1.0 and needsMatch cleared — the user explicitly confirmed it.
   */
  async applyManualMatch(
    mediaId: number,
    tmdbId: number,
  ): Promise<typeof mediaItems.$inferSelect | null> {
    const item = await this.db.query.mediaItems.findFirst({
      where: eq(mediaItems.id, mediaId),
    });
    if (!item) return null;

    if (item.type === "movie") {
      const match = await this.metadata.getMovieDetails(tmdbId);
      if (!match) return null;

      const posterPath = await this.metadata.cachePoster(match.poster_path);
      const backdropPath = await this.metadata.cacheBackdrop(match.backdrop_path);
      const imdbId =
        match.external_ids?.imdb_id ?? match.imdb_id ?? null;

      const [updated] = await this.db
        .update(mediaItems)
        .set({
          tmdbId: match.id,
          imdbId: imdbId ? imdbId.toLowerCase() : null,
          title: match.title,
          originalTitle: match.original_title ?? null,
          overview: match.overview ?? null,
          year: match.release_date
            ? parseInt(match.release_date.slice(0, 4), 10)
            : item.year ?? null,
          posterPath,
          backdropPath,
          genres: match.genres?.map((g) => g.name).join(", ") ?? null,
          rating: match.vote_average ?? null,
          matchConfidence: 1,
          needsMatch: false,
          updatedAt: new Date(),
        })
        .where(eq(mediaItems.id, item.id))
        .returning();

      await revalidateMediaPage(item.id);
      void this.themes.syncForMediaItem(updated);
      return updated;
    }

    const match = await this.metadata.getTvDetails(tmdbId);
    if (!match) return null;

    const posterPath = await this.metadata.cachePoster(match.poster_path);
    const backdropPath = await this.metadata.cacheBackdrop(match.backdrop_path);
    const imdbId = match.external_ids?.imdb_id ?? null;

    const [updated] = await this.db
      .update(mediaItems)
      .set({
        tmdbId: match.id,
        imdbId: imdbId ? imdbId.toLowerCase() : null,
        title: match.name,
        originalTitle: match.original_name ?? null,
        overview: match.overview ?? null,
        year: match.first_air_date
          ? parseInt(match.first_air_date.slice(0, 4), 10)
          : item.year ?? null,
        posterPath,
        backdropPath,
        genres: match.genres?.map((g) => g.name).join(", ") ?? null,
        rating: match.vote_average ?? null,
        matchConfidence: 1,
        needsMatch: false,
        updatedAt: new Date(),
      })
      .where(eq(mediaItems.id, item.id))
      .returning();

    await this.refreshTvEpisodes(item.id, match.id);
    await revalidateMediaPage(item.id);
    void this.themes.syncForMediaItem(updated);
    return updated;
  }

  private async refreshMovieItem(
    item: typeof mediaItems.$inferSelect,
  ): Promise<boolean> {
    const file = await this.db.query.movieFiles.findFirst({
      where: eq(movieFiles.mediaItemId, item.id),
    });

    const parsed = file
      ? parseMovieFilename(path.basename(file.filePath))
      : { title: item.title, year: item.year ?? undefined, rawFilename: "" };

    const { match, confidence } = await this.metadata.searchMovie(
      parsed.title,
      parsed.year ?? item.year ?? undefined,
    );

    if (!match) return false;

    const posterPath = await this.metadata.cachePoster(match.poster_path);
    const backdropPath = await this.metadata.cacheBackdrop(match.backdrop_path);

    await this.db
      .update(mediaItems)
      .set({
        tmdbId: match.id,
        imdbId: match.imdb_id?.toLowerCase() ?? null,
        title: match.title,
        originalTitle: match.original_title ?? null,
        overview: match.overview ?? null,
        year: match.release_date
          ? parseInt(match.release_date.slice(0, 4), 10)
          : parsed.year ?? item.year ?? null,
        posterPath,
        backdropPath,
        genres: match.genres?.map((g) => g.name).join(", ") ?? null,
        rating: match.vote_average ?? null,
        matchConfidence: confidence,
        needsMatch: confidence < 0.6,
        updatedAt: new Date(),
      })
      .where(eq(mediaItems.id, item.id));

    return true;
  }

  private async refreshTvItem(
    item: typeof mediaItems.$inferSelect,
  ): Promise<boolean> {
    let showName = item.title;
    const lib = await this.db.query.libraries.findFirst({
      where: eq(libraries.id, item.libraryId),
    });

    if (lib) {
      const seasons = await this.db.query.tvSeasons.findMany({
        where: eq(tvSeasons.mediaItemId, item.id),
      });
      const seasonIds = seasons.map((season) => season.id);
      const episodes = seasonIds.length
        ? await this.db.query.tvEpisodes.findMany({
            where: inArray(tvEpisodes.seasonId, seasonIds),
          })
        : [];
      for (const episode of episodes) {
        const parsed = parseEpisodeFromPath(episode.filePath, lib.path);
        if (parsed?.showName) {
          showName = parsed.showName;
          break;
        }
      }
    }

    const { match, confidence } = await this.metadata.searchTv(showName);
    if (!match) return false;

    const posterPath = await this.metadata.cachePoster(match.poster_path);
    const backdropPath = await this.metadata.cacheBackdrop(match.backdrop_path);

    await this.db
      .update(mediaItems)
      .set({
        tmdbId: match.id,
        title: match.name,
        originalTitle: match.original_name ?? null,
        overview: match.overview ?? null,
        year: match.first_air_date
          ? parseInt(match.first_air_date.slice(0, 4), 10)
          : item.year ?? null,
        posterPath,
        backdropPath,
        genres: match.genres?.map((g) => g.name).join(", ") ?? null,
        rating: match.vote_average ?? null,
        matchConfidence: confidence,
        needsMatch: confidence < 0.6,
        updatedAt: new Date(),
      })
      .where(eq(mediaItems.id, item.id));

    await this.refreshTvEpisodes(item.id, match.id);
    return true;
  }

  private async refreshTvEpisodes(
    mediaItemId: number,
    tmdbId: number,
  ): Promise<void> {
    const seasons = await this.db.query.tvSeasons.findMany({
      where: eq(tvSeasons.mediaItemId, mediaItemId),
    });
    const seasonIds = seasons.map((season) => season.id);
    const allEpisodes = seasonIds.length
      ? await this.db.query.tvEpisodes.findMany({
          where: inArray(tvEpisodes.seasonId, seasonIds),
        })
      : [];
    const episodesBySeasonId = new Map<number, typeof allEpisodes>();
    for (const episode of allEpisodes) {
      const list = episodesBySeasonId.get(episode.seasonId) ?? [];
      list.push(episode);
      episodesBySeasonId.set(episode.seasonId, list);
    }

    for (const season of seasons) {
      const seasonMeta = await this.metadata.getTvSeason(
        tmdbId,
        season.seasonNumber,
      );

      if (seasonMeta) {
        const seasonPoster = await this.metadata.cachePoster(
          seasonMeta.poster_path,
        );
        await this.db
          .update(tvSeasons)
          .set({
            name: seasonMeta.name ?? season.name,
            overview: seasonMeta.overview ?? season.overview,
            posterPath: seasonPoster ?? season.posterPath,
            airDate: seasonMeta.air_date ?? season.airDate,
          })
          .where(eq(tvSeasons.id, season.id));
      }

      const episodes = episodesBySeasonId.get(season.id) ?? [];

      for (const ep of episodes) {
        const epMeta = seasonMeta?.episodes?.find(
          (e) => e.episode_number === ep.episodeNumber,
        );
        if (!epMeta) continue;

        const stillPath = epMeta.still_path
          ? await this.metadata.cachePoster(epMeta.still_path)
          : ep.stillPath;

        await this.db
          .update(tvEpisodes)
          .set({
            title: epMeta.name ?? ep.title,
            overview: epMeta.overview ?? ep.overview,
            stillPath,
            airDate: epMeta.air_date ?? ep.airDate,
          })
          .where(eq(tvEpisodes.id, ep.id));
      }
    }
  }

  stopWatcher(libraryId: number): void {
    const pending = this.pendingRemovals.get(libraryId);
    if (pending) clearTimeout(pending.timer);
    this.pendingRemovals.delete(libraryId);
    const watcher = this.watchers.get(libraryId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(libraryId);
    }
  }

  async syncConfigLibraries(): Promise<void> {
    const dbLibraries = await this.db.query.libraries.findMany();
    this.configManager.setLibraries(
      dbLibraries.map((lib) => ({
        name: lib.name,
        type: lib.type,
        path: lib.path,
      })),
    );
  }

  async createLibrary(input: {
    name: string;
    type: "movies" | "tv";
    path: string;
  }): Promise<typeof libraries.$inferSelect> {
    const existing = await this.db.query.libraries.findFirst({
      where: eq(libraries.path, input.path),
    });
    if (existing) {
      throw new Error("A library with this path already exists");
    }

    const [lib] = await this.db
      .insert(libraries)
      .values({
        name: input.name.trim(),
        type: input.type,
        path: input.path,
      })
      .returning();

    await this.syncConfigLibraries();
    this.startWatcher(lib.id, lib.path);
    this.scheduleScan(lib.id);
    return lib;
  }

  async updateLibrary(
    libraryId: number,
    input: { name?: string; type?: "movies" | "tv"; path?: string },
  ): Promise<typeof libraries.$inferSelect> {
    const lib = await this.db.query.libraries.findFirst({
      where: eq(libraries.id, libraryId),
    });
    if (!lib) throw new Error("Library not found");

    if (input.path && input.path !== lib.path) {
      const duplicate = await this.db.query.libraries.findFirst({
        where: eq(libraries.path, input.path),
      });
      if (duplicate && duplicate.id !== libraryId) {
        throw new Error("A library with this path already exists");
      }
    }

    const [updated] = await this.db
      .update(libraries)
      .set({
        name: input.name?.trim() ?? lib.name,
        type: input.type ?? lib.type,
        path: input.path ?? lib.path,
      })
      .where(eq(libraries.id, libraryId))
      .returning();

    const pathChanged = updated.path !== lib.path;
    if (pathChanged) {
      this.stopWatcher(libraryId);
      this.startWatcher(updated.id, updated.path);
    }

    await this.syncConfigLibraries();

    if (pathChanged) {
      this.scheduleScan(updated.id);
    }

    return updated;
  }

  async deleteLibrary(libraryId: number): Promise<void> {
    const lib = await this.db.query.libraries.findFirst({
      where: eq(libraries.id, libraryId),
    });
    if (!lib) throw new Error("Library not found");

    this.stopWatcher(libraryId);
    await this.db.delete(libraries).where(eq(libraries.id, libraryId));
    await this.syncConfigLibraries();
  }

  private async isMediaVideoFile(filePath: string): Promise<boolean> {
    const name = path.basename(filePath);
    if (isVideoFile(name)) return true;

    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile() || !isUnknownVideoCandidate(name, stats.size)) {
        return false;
      }
      const probe = await probeFile(filePath);
      return Boolean(probe?.videoCodec);
    } catch {
      return false;
    }
  }

  private async collectVideoFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const probeCandidates: Array<{ path: string; size: number }> = [];

    walkMediaTree(
      dir,
      (fullPath, entryName) => {
        if (isVideoFile(entryName)) {
          results.push(fullPath);
          return;
        }
        if (isExcludedFromVideoProbe(entryName)) return;
        try {
          const size = fs.statSync(fullPath).size;
          if (isUnknownVideoCandidate(entryName, size)) {
            probeCandidates.push({ path: fullPath, size });
          }
        } catch {
          // skip unreadable files
        }
      },
      (name, isDirectory) => this.shouldSkipScanEntry(name, isDirectory),
    );

    for (const candidate of probeCandidates) {
      const probe = await probeFile(candidate.path);
      if (probe?.videoCodec) {
        results.push(candidate.path);
      }
    }

    return results;
  }

  private async processFile(
    lib: typeof libraries.$inferSelect,
    filePath: string,
  ): Promise<void> {
    const stats = fs.statSync(filePath);
    const probe = await probeFile(filePath);
    const fileStats = { fileSize: stats.size, fileMtimeMs: Math.trunc(stats.mtimeMs) };

    if (lib.type === "movies") {
      await this.processMovieFile(lib, filePath, fileStats, probe);
    } else {
      await this.processTvFile(lib, filePath, fileStats, probe);
    }
  }

  private async markRecentlyAdded(mediaItemId: number): Promise<void> {
    await this.db.update(mediaItems)
      .set({ recentlyAddedAt: new Date() })
      .where(eq(mediaItems.id, mediaItemId));
  }

  private async processMovieFile(
    lib: typeof libraries.$inferSelect,
    filePath: string,
    stats: VideoFileStats,
    probe: VideoProbe,
  ): Promise<void> {
    const existing = await this.db.query.movieFiles.findFirst({
      where: eq(movieFiles.filePath, filePath),
    });
    if (existing) {
      const { replaced, values } = existingVideoUpdate(existing, stats, probe);
      if (values) {
        await this.db.update(movieFiles).set(values).where(eq(movieFiles.id, existing.id));
      }
      if (replaced) {
        await this.markRecentlyAdded(existing.mediaItemId);
        this.scheduleCatalogRevalidate(existing.mediaItemId);
        await this.subtitles.discoverForMovieFile(existing.id, filePath, probe);
      }
      return;
    }

    const parsed = parseMovieFilename(path.basename(filePath));
    const mediaItemId = await this.ensureMovieMediaItem(lib.id, parsed);

    const files = await this.db.query.movieFiles.findMany({
      where: eq(movieFiles.mediaItemId, mediaItemId),
      columns: { id: true, filePath: true },
    });
    // A scan can discover the new filename before an unlink was observed (for
    // example after an offline upgrade). Replace the missing entry instead of
    // leaving the title's Play button pointed at the former path.
    const missing = files.filter((file) => isMissingFile(file.filePath));
    const values = { filePath, ...stats, ...videoMetadata(probe) };
    const [file] = missing.length === 1
      ? await this.db.update(movieFiles).set(values)
        .where(and(eq(movieFiles.id, missing[0].id), eq(movieFiles.filePath, missing[0].filePath)))
        .returning({ id: movieFiles.id })
      : [];
    const fileId = file?.id ?? (await this.db.insert(movieFiles)
      .values({ mediaItemId, ...values }).returning({ id: movieFiles.id }))[0].id;

    await this.markRecentlyAdded(mediaItemId);
    this.scheduleCatalogRevalidate(mediaItemId);
    await this.subtitles.discoverForMovieFile(fileId, filePath, probe);
  }

  private async ensureMovieMediaItem(
    libraryId: number,
    parsed: ReturnType<typeof parseMovieFilename>,
  ): Promise<number> {
    return this.withChainLock(this.mediaCreateChain, `${libraryId}:movie:${parsed.title.toLowerCase()}`, async () => {
      const inLibrary = and(eq(mediaItems.libraryId, libraryId), eq(mediaItems.type, "movie"));
      const candidates = await this.db.query.mediaItems.findMany({
        where: and(inLibrary, sql`lower(${mediaItems.title}) = lower(${parsed.title})`),
        columns: { id: true, year: true },
      });
      const exactYear = parsed.year == null
        ? undefined
        : candidates.find((item) => item.year === parsed.year);
      const onlyCandidate = candidates.length === 1 ? candidates[0] : undefined;
      const existing = exactYear ?? (parsed.year == null || onlyCandidate?.year == null ? onlyCandidate : undefined);
      if (existing) return existing.id;

      const { match, confidence } = await this.metadata.searchMovie(
        parsed.title,
        parsed.year,
      );
      if (match) {
        const byTmdb = await this.db.query.mediaItems.findFirst({
          where: and(inLibrary, eq(mediaItems.tmdbId, match.id)),
          columns: { id: true },
        });
        if (byTmdb) return byTmdb.id;
      }

      const posterPath = match
        ? await this.metadata.cachePoster(match.poster_path)
        : null;
      const backdropPath = match
        ? await this.metadata.cacheBackdrop(match.backdrop_path)
        : null;

      const [item] = await this.db
        .insert(mediaItems)
        .values({
          libraryId,
          tmdbId: match?.id ?? null,
          imdbId: match?.imdb_id?.toLowerCase() ?? null,
          title: match?.title ?? parsed.title,
          originalTitle: match?.original_title ?? null,
          overview: match?.overview ?? null,
          year: match?.release_date
            ? parseInt(match.release_date.slice(0, 4), 10)
            : parsed.year ?? null,
          posterPath,
          backdropPath,
          type: "movie",
          genres: match?.genres?.map((g) => g.name).join(", ") ?? null,
          rating: match?.vote_average ?? null,
          matchConfidence: confidence,
          needsMatch: !match || confidence < 0.6,
        })
        .returning();

      return item.id;
    });
  }

  /** Find a TV show by folder name or TMDB id (stored title may differ after metadata match). */
  private async findTvMediaItem(
    libraryId: number,
    showName: string,
    tmdbId?: number | null,
  ) {
    const byFolderName = await this.db.query.mediaItems.findFirst({
      where: and(
        eq(mediaItems.libraryId, libraryId),
        eq(mediaItems.type, "tv"),
        eq(mediaItems.title, showName),
      ),
    });
    if (byFolderName) return byFolderName;

    if (tmdbId) {
      return this.db.query.mediaItems.findFirst({
        where: and(
          eq(mediaItems.libraryId, libraryId),
          eq(mediaItems.type, "tv"),
          eq(mediaItems.tmdbId, tmdbId),
        ),
      });
    }

    return undefined;
  }

  /**
   * Find-or-create the show row for an episode, serialized per show so that a
   * batch of episodes for a brand-new show (ingested concurrently) share one
   * row instead of racing into duplicates. Mirrors {@link ensureTvSeason}.
   */
  private async ensureTvMediaItem(
    libraryId: number,
    showName: string,
  ): Promise<typeof mediaItems.$inferSelect> {
    return this.withChainLock(
      this.mediaCreateChain,
      `${libraryId}:${showName.toLowerCase()}`,
      async () => {
        const byFolderName = await this.findTvMediaItem(libraryId, showName);
        if (byFolderName) return byFolderName;

        const { match, confidence } = await this.metadata.searchTv(showName);

        if (match) {
          const byTmdb = await this.findTvMediaItem(
            libraryId,
            showName,
            match.id,
          );
          if (byTmdb) return byTmdb;
        }

        const posterPath = match
          ? await this.metadata.cachePoster(match.poster_path)
          : null;
        const backdropPath = match
          ? await this.metadata.cacheBackdrop(match.backdrop_path)
          : null;

        const [item] = await this.db
          .insert(mediaItems)
          .values({
            libraryId,
            tmdbId: match?.id ?? null,
            title: match?.name ?? showName,
            originalTitle: match?.original_name ?? null,
            overview: match?.overview ?? null,
            year: match?.first_air_date
              ? parseInt(match.first_air_date.slice(0, 4), 10)
              : null,
            posterPath,
            backdropPath,
            type: "tv",
            genres: match?.genres?.map((g) => g.name).join(", ") ?? null,
            rating: match?.vote_average ?? null,
            matchConfidence: confidence,
            needsMatch: !match || confidence < 0.6,
          })
          .returning();

        return item;
      },
    );
  }

  /** Merge duplicate TV show rows created when folder name != TMDB title. */
  async dedupeTvShows(libraryId?: number): Promise<number> {
    const conditions = [eq(mediaItems.type, "tv")];
    if (libraryId !== undefined) {
      conditions.push(eq(mediaItems.libraryId, libraryId));
    }

    const items = await this.db.query.mediaItems.findMany({
      where: and(...conditions),
    });

    const groups = new Map<string, (typeof items)[number][]>();
    for (const item of items) {
      const key = item.tmdbId
        ? `${item.libraryId}:tmdb:${item.tmdbId}`
        : `${item.libraryId}:title:${item.title.toLowerCase()}`;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    let merged = 0;

    for (const group of groups.values()) {
      if (group.length <= 1) continue;

      group.sort((a, b) => a.id - b.id);
      const [canonical, ...dupes] = group;

      for (const dupe of dupes) {
        const dupeSeasons = await this.db.query.tvSeasons.findMany({
          where: eq(tvSeasons.mediaItemId, dupe.id),
        });

        for (const season of dupeSeasons) {
          const canonicalSeason = await this.db.query.tvSeasons.findFirst({
            where: and(
              eq(tvSeasons.mediaItemId, canonical.id),
              eq(tvSeasons.seasonNumber, season.seasonNumber),
            ),
          });

          if (canonicalSeason) {
            await this.db
              .update(tvEpisodes)
              .set({ seasonId: canonicalSeason.id })
              .where(eq(tvEpisodes.seasonId, season.id));
            await this.db.delete(tvSeasons).where(eq(tvSeasons.id, season.id));
          } else {
            await this.db
              .update(tvSeasons)
              .set({ mediaItemId: canonical.id })
              .where(eq(tvSeasons.id, season.id));
          }
        }

        await this.db.delete(mediaItems).where(eq(mediaItems.id, dupe.id));
        merged++;
      }
    }

    return merged;
  }

  /** Serialize work on a per-key promise chain so concurrent ingests of the
   * same show/season don't race find-or-create into duplicate rows. */
  private async withChainLock<T>(
    chain: Map<string, Promise<void>>,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = chain.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    chain.set(key, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (chain.get(key) === tail) {
        chain.delete(key);
      }
    }
  }

  /** Serialize season creation so a batch of new episodes shares one season row. */
  private async withSeasonLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.withChainLock(this.seasonCreateChain, key, fn);
  }

  private async ensureTvSeason(
    mediaItemId: number,
    seasonNumber: number,
    tmdbId: number | null,
  ): Promise<typeof tvSeasons.$inferSelect> {
    return this.withSeasonLock(`${mediaItemId}:${seasonNumber}`, async () => {
      const existing = await this.db.query.tvSeasons.findFirst({
        where: and(
          eq(tvSeasons.mediaItemId, mediaItemId),
          eq(tvSeasons.seasonNumber, seasonNumber),
        ),
      });
      if (existing) return existing;

      let seasonMeta = null;
      if (tmdbId) {
        seasonMeta = await this.metadata.getTvSeason(tmdbId, seasonNumber);
      }

      const seasonPoster = seasonMeta
        ? await this.metadata.cachePoster(seasonMeta.poster_path)
        : null;

      const [created] = await this.db
        .insert(tvSeasons)
        .values({
          mediaItemId,
          seasonNumber,
          name: seasonMeta?.name ?? `Season ${seasonNumber}`,
          overview: seasonMeta?.overview ?? null,
          posterPath: seasonPoster,
          airDate: seasonMeta?.air_date ?? null,
        })
        .onConflictDoNothing({
          target: [tvSeasons.mediaItemId, tvSeasons.seasonNumber],
        })
        .returning();

      if (created) return created;

      const raced = await this.db.query.tvSeasons.findFirst({
        where: and(
          eq(tvSeasons.mediaItemId, mediaItemId),
          eq(tvSeasons.seasonNumber, seasonNumber),
        ),
      });
      if (!raced) {
        throw new Error(
          `Failed to create season ${seasonNumber} for media ${mediaItemId}`,
        );
      }
      return raced;
    });
  }

  private async processTvFile(
    lib: typeof libraries.$inferSelect,
    filePath: string,
    stats: VideoFileStats,
    probe: VideoProbe,
  ): Promise<void> {
    const existing = await this.db.query.tvEpisodes.findFirst({
      where: eq(tvEpisodes.filePath, filePath),
    });
    if (existing) {
      const { replaced, values } = existingVideoUpdate(existing, stats, probe);
      if (values) {
        await this.db.update(tvEpisodes).set(values).where(eq(tvEpisodes.id, existing.id));
      }
      if (replaced) {
        const season = await this.db.query.tvSeasons.findFirst({
          where: eq(tvSeasons.id, existing.seasonId),
          columns: { mediaItemId: true },
        });
        if (season) {
          await this.markRecentlyAdded(season.mediaItemId);
          this.scheduleCatalogRevalidate(season.mediaItemId);
        }
        await this.subtitles.discoverForEpisode(existing.id, filePath, probe);
      }
      return;
    }

    const parsed = parseEpisodeFromPath(filePath, lib.path);
    if (!parsed) {
      console.warn(`Could not parse TV episode: ${filePath}`);
      return;
    }

    const mediaItem = await this.ensureTvMediaItem(lib.id, parsed.showName);

    const season = await this.ensureTvSeason(
      mediaItem.id,
      parsed.season,
      mediaItem.tmdbId,
    );

    const episodeMeta = mediaItem.tmdbId
      ? (await this.metadata.getTvSeason(mediaItem.tmdbId, parsed.season))
          ?.episodes?.find((e) => e.episode_number === parsed.episode)
      : null;

    const stillPath = episodeMeta?.still_path
      ? await this.metadata.cachePoster(episodeMeta.still_path)
      : null;

    const [episode] = await this.db
      .insert(tvEpisodes)
      .values({
        seasonId: season.id,
        episodeNumber: parsed.episode,
        title: episodeMeta?.name ?? `Episode ${parsed.episode}`,
        overview: episodeMeta?.overview ?? null,
        filePath,
        ...stats,
        ...videoMetadata(probe),
        stillPath,
        airDate: episodeMeta?.air_date ?? null,
      })
      .returning();

    await this.markRecentlyAdded(mediaItem.id);
    this.scheduleCatalogRevalidate(mediaItem.id);
    await this.subtitles.discoverForEpisode(episode.id, filePath, probe);
  }

  private unseenFiles(libraryId: number, pathsSeen: Set<string>): string[] {
    const movies = this.db.select({ filePath: movieFiles.filePath }).from(movieFiles)
      .innerJoin(mediaItems, eq(mediaItems.id, movieFiles.mediaItemId))
      .where(eq(mediaItems.libraryId, libraryId)).all();
    const episodes = this.db.select({ filePath: tvEpisodes.filePath }).from(tvEpisodes)
      .innerJoin(tvSeasons, eq(tvSeasons.id, tvEpisodes.seasonId))
      .innerJoin(mediaItems, eq(mediaItems.id, tvSeasons.mediaItemId))
      .where(eq(mediaItems.libraryId, libraryId)).all();
    return [...movies, ...episodes].map(({ filePath }) => filePath).filter((filePath) => !pathsSeen.has(filePath));
  }

  private async reconcileRemovals(
    libraryId: number,
    paths: Iterable<string>,
    canReconcile: () => boolean,
    sweepEmpty = false,
  ): Promise<void> {
    await this.ingestQueue.onIdle();
    if (!canReconcile()) return;

    let removedFile = false;
    for (const filePath of paths) {
      const missing = () => !this.ingestingPaths.has(filePath) && canReconcile() && isMissingFile(filePath);
      if (!missing()) continue;
      const mediaItemId = await this.removeFile(libraryId, filePath, missing);
      if (mediaItemId == null) continue;
      removedFile = true;
      this.scheduleCatalogRevalidate(mediaItemId);
    }

    if (!removedFile && !sweepEmpty) return;
    // Ingest may create a title before its file is attached. Only prune after
    // the queue settles, and recheck ownership atomically in the DELETEs.
    await this.ingestQueue.onIdle();
    if (canReconcile()) this.removeEmptyTitles(libraryId);
  }

  private removeEmptyTitles(libraryId: number): void {
    const libraryTitles = this.db.select({ id: mediaItems.id }).from(mediaItems)
      .where(eq(mediaItems.libraryId, libraryId));
    const emptySeason = notExists(this.db.select({ id: tvEpisodes.id }).from(tvEpisodes)
      .where(eq(tvEpisodes.seasonId, tvSeasons.id)));
    const noMovieFiles = notExists(this.db.select({ id: movieFiles.id }).from(movieFiles)
      .where(eq(movieFiles.mediaItemId, mediaItems.id)));
    const noSeasons = notExists(this.db.select({ id: tvSeasons.id }).from(tvSeasons)
      .where(eq(tvSeasons.mediaItemId, mediaItems.id)));

    const removed = this.db.transaction((tx) => {
      tx.delete(tvSeasons).where(and(inArray(tvSeasons.mediaItemId, libraryTitles), emptySeason)).run();
      return tx.delete(mediaItems).where(and(eq(mediaItems.libraryId, libraryId), noMovieFiles, noSeasons))
        .returning({ id: mediaItems.id }).all();
    });
    for (const { id } of removed) this.scheduleCatalogRevalidate(id);
  }

  private async removeFile(libraryId: number, filePath: string, stillMissing: () => boolean): Promise<number | null> {
    const movieFile = this.db.select({ id: movieFiles.id, mediaItemId: movieFiles.mediaItemId })
      .from(movieFiles).innerJoin(mediaItems, eq(mediaItems.id, movieFiles.mediaItemId))
      .where(and(eq(movieFiles.filePath, filePath), eq(mediaItems.libraryId, libraryId))).get();
    if (movieFile) {
      // Clean up subtitle rows + cached files before the FK cascade drops the
      // rows and orphans their .vtt files on disk.
      await this.subtitles.removeForOwner({ movieFileId: movieFile.id });
      if (!stillMissing()) return null;
      const result = this.db.delete(movieFiles)
        .where(and(eq(movieFiles.id, movieFile.id), eq(movieFiles.filePath, filePath))).run();
      if (result.changes === 0) return null;
      this.db.delete(watchProgress)
        .where(and(eq(watchProgress.itemType, "movie"), eq(watchProgress.itemId, movieFile.id))).run();
      return movieFile.mediaItemId;
    }

    const episode = this.db.select({ id: tvEpisodes.id, mediaItemId: tvSeasons.mediaItemId })
      .from(tvEpisodes).innerJoin(tvSeasons, eq(tvSeasons.id, tvEpisodes.seasonId))
      .innerJoin(mediaItems, eq(mediaItems.id, tvSeasons.mediaItemId))
      .where(and(eq(tvEpisodes.filePath, filePath), eq(mediaItems.libraryId, libraryId))).get();
    if (!episode) return null;
    await this.subtitles.removeForOwner({ episodeId: episode.id });
    if (!stillMissing()) return null;
    const result = this.db.delete(tvEpisodes)
      .where(and(eq(tvEpisodes.id, episode.id), eq(tvEpisodes.filePath, filePath))).run();
    if (result.changes === 0) return null;
    this.db.delete(watchProgress)
      .where(and(eq(watchProgress.itemType, "episode"), eq(watchProgress.itemId, episode.id))).run();
    return episode.mediaItemId;
  }
}
