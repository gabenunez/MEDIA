import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { THEME_FILENAMES, resolveShowDirectory } from "@media-app/shared";
import type { ConfigManager } from "../config.js";
import type { DatabaseInstance } from "../db/index.js";
import {
  libraries,
  mediaItems,
  movieFiles,
  tvEpisodes,
  tvSeasons,
  type MediaItem,
} from "../db/schema.js";
import type { MetadataService } from "./metadata.js";
import { downloadYoutubeTheme, compressThemeMp3, ensureCompressedThemeMp3 } from "../utils/youtube-theme.js";

const THEMERR_DB_BASE = "https://app.lizardbyte.dev/ThemerrDB";

const THEME_MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

function findThemeInDirectory(dir: string): string | null {
  for (const name of THEME_FILENAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** How long to wait before re-checking a title that had no theme last time.
 * Stops theme-less titles from re-running the full remote fetch chain
 * (fanart.tv → ThemerrDB → yt-dlp) on every page view. */
const THEME_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

export class ThemeService {
  private cacheDir: string;
  /** Dedup concurrent syncs for the same item so a burst of requests triggers
   * at most one remote fetch. */
  private inFlight = new Map<number, Promise<string | null>>();

  constructor(
    private db: DatabaseInstance,
    private configManager: ConfigManager,
    private metadata: MetadataService,
  ) {
    this.cacheDir = path.join(configManager.get().data_dir, "cache", "themes");
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  /** Whether a (non-blocking) sync is worth attempting: no cached theme, and
   * we either never checked or the recheck window has elapsed. */
  shouldAttemptSync(
    item: Pick<MediaItem, "themePath" | "themeCheckedAt">,
  ): boolean {
    if (item.themePath && fs.existsSync(item.themePath)) return false;
    if (!item.themeCheckedAt) return true;
    return Date.now() - item.themeCheckedAt.getTime() > THEME_RECHECK_MS;
  }

  mimeTypeForPath(filePath: string): string {
    return THEME_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "audio/mpeg";
  }

  hasThemeMusic(item: Pick<MediaItem, "themePath">): boolean {
    return Boolean(item.themePath && fs.existsSync(item.themePath));
  }

  async syncForMediaItem(
    item: Pick<
      MediaItem,
      "id" | "libraryId" | "type" | "tmdbId" | "themePath" | "themeCheckedAt"
    >,
  ): Promise<string | null> {
    if (item.themePath && fs.existsSync(item.themePath)) {
      return item.themePath;
    }

    const existing = this.inFlight.get(item.id);
    if (existing) return existing;

    const task = this.runSync(item).finally(() => {
      this.inFlight.delete(item.id);
    });
    this.inFlight.set(item.id, task);
    return task;
  }

  private async runSync(
    item: Pick<MediaItem, "id" | "libraryId" | "type" | "tmdbId" | "themePath">,
  ): Promise<string | null> {
    const localPath = await this.discoverLocalTheme(item);
    if (localPath) {
      await this.saveThemePath(item.id, localPath);
      return localPath;
    }

    if (item.type === "movie" && item.tmdbId) {
      const remotePath = await this.fetchThemerrTheme(
        "movies",
        item.tmdbId,
        `movie_tmdb_${item.tmdbId}.mp3`,
      );
      if (remotePath) {
        await this.saveThemePath(item.id, remotePath);
        return remotePath;
      }
    }

    if (item.type === "tv" && item.tmdbId) {
      const fanartPath = await this.fetchFanartTvTheme(item.tmdbId);
      if (fanartPath) {
        await this.saveThemePath(item.id, fanartPath);
        return fanartPath;
      }

      const themerrPath = await this.fetchThemerrTheme(
        "tv_shows",
        item.tmdbId,
        `tv_tmdb_${item.tmdbId}.mp3`,
      );
      if (themerrPath) {
        await this.saveThemePath(item.id, themerrPath);
        return themerrPath;
      }
    }

    // No theme available — record the attempt so we don't re-run this whole
    // remote fetch chain on every subsequent request.
    await this.db
      .update(mediaItems)
      .set({ themePath: null, themeCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(mediaItems.id, item.id));

    return null;
  }

  async syncThemesForLibrary(libraryId: number): Promise<void> {
    const items = await this.db.query.mediaItems.findMany({
      columns: {
        id: true,
        libraryId: true,
        type: true,
        tmdbId: true,
        themePath: true,
        themeCheckedAt: true,
      },
      where: eq(mediaItems.libraryId, libraryId),
    });

    for (const item of items) {
      try {
        await this.syncForMediaItem(item);
      } catch (err) {
        console.warn(
          `Theme sync failed for media ${item.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  private async saveThemePath(mediaItemId: number, themePath: string): Promise<void> {
    await this.db
      .update(mediaItems)
      .set({ themePath, themeCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(mediaItems.id, mediaItemId));
  }

  private async discoverLocalTheme(
    item: Pick<MediaItem, "id" | "libraryId" | "type">,
  ): Promise<string | null> {
    const library = await this.db.query.libraries.findFirst({
      where: eq(libraries.id, item.libraryId),
    });
    if (!library) return null;

    if (item.type === "movie") {
      const file = await this.db.query.movieFiles.findFirst({
        where: eq(movieFiles.mediaItemId, item.id),
      });
      if (!file) return null;
      return findThemeInDirectory(path.dirname(file.filePath));
    }

    const seasons = await this.db.query.tvSeasons.findMany({
      where: eq(tvSeasons.mediaItemId, item.id),
    });
    if (!seasons.length) return null;

    const episode = await this.db.query.tvEpisodes.findFirst({
      where: inArray(
        tvEpisodes.seasonId,
        seasons.map((season) => season.id),
      ),
    });
    if (!episode) return null;

    const showDir = resolveShowDirectory(episode.filePath, library.path);
    if (!showDir) return null;
    return findThemeInDirectory(showDir);
  }

  private async fetchThemerrTheme(
    mediaType: "movies" | "tv_shows",
    tmdbId: number,
    cacheName: string,
  ): Promise<string | null> {
    const cachePath = path.join(this.cacheDir, cacheName);
    if (fs.existsSync(cachePath)) {
      await ensureCompressedThemeMp3(cachePath);
      return cachePath;
    }

    const res = await fetch(
      `${THEMERR_DB_BASE}/${mediaType}/themoviedb/${tmdbId}.json`,
      { headers: { Accept: "application/json" } },
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { youtube_theme_url?: string };
    const youtubeUrl = data.youtube_theme_url?.trim();
    if (!youtubeUrl) {
      return null;
    }

    const ok = await downloadYoutubeTheme(youtubeUrl, cachePath);
    return ok ? cachePath : null;
  }

  private async fetchFanartTvTheme(tmdbId: number): Promise<string | null> {
    const apiKey = this.configManager.get().metadata.fanart_api_key?.trim();
    if (!apiKey) return null;

    const tvdbId = await this.metadata.getTvdbId(tmdbId);
    if (!tvdbId) return null;

    const cachePath = path.join(this.cacheDir, `tv_${tvdbId}.mp3`);
    if (fs.existsSync(cachePath)) {
      await ensureCompressedThemeMp3(cachePath);
      return cachePath;
    }

    const res = await fetch(
      `https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${encodeURIComponent(apiKey)}`,
      { headers: { Accept: "application/json" } },
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      musictheme?: Array<{ url?: string }>;
      tvtheme?: Array<{ url?: string }>;
    };

    const themeUrl = data.musictheme?.[0]?.url ?? data.tvtheme?.[0]?.url;
    if (!themeUrl) return null;

    const download = await fetch(themeUrl);
    if (!download.ok || !download.body) return null;

    const buffer = Buffer.from(await download.arrayBuffer());
    fs.writeFileSync(cachePath, buffer);
    await compressThemeMp3(cachePath);
    return cachePath;
  }
}
