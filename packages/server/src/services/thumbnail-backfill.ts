import fs from "node:fs";
import { desc, eq, sql } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { mediaItems, movieFiles, tvEpisodes } from "../db/schema.js";
import { probeFile } from "../utils/ffmpeg.js";
import {
  ensureThumbnailSprite,
  getCachedThumbnailPaths,
  thumbnailCacheDir,
} from "../utils/thumbnails.js";

type FileType = "movie" | "episode";
type Source = {
  id: number;
  filePath: string;
  fileMtimeMs?: number | null;
  durationMs?: number | null;
};
type Candidate = Source & { type: FileType };
type SweepCursor = Pick<Candidate, "type" | "id"> & { addedAt: number };

const TICK_MS = 3_000;
const PLAYBACK_LEASE_MS = 90_000;
// Native and older clients can play from several minutes of buffered media.
const RECENT_STREAM_MS = 3 * 60_000;
const RETRY_MS = 5 * 60_000;
const PAGE_SIZE = 64;
const MAX_REQUESTED = 64;

function candidateKey({ type, id }: Candidate): string {
  return `${type}:${id}`;
}

export class ThumbnailBackfill {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private current: { file: Candidate; controller: AbortController } | null = null;
  private interrupted: Candidate | null = null;
  private readonly requested = new Map<string, Candidate>();
  private readonly retryAfter = new Map<string, number>();
  private readonly leases = new Map<string, number>();
  private openStreams = 0;
  private streamActiveUntil = 0;
  private nextSweepAt = 0;
  private sweepCursor: SweepCursor | null = null;
  private sweepPage: Candidate[] = [];

  constructor(
    private readonly db: DatabaseInstance,
    private readonly cacheRoot: string,
    private readonly options: { onError: (error: unknown) => void },
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.runOnce().catch(this.options.onError);
    }, TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.stopped = true;
    this.current?.controller.abort();
  }

  setPlaybackActive(sessionId: string, active: boolean): void {
    if (active) {
      this.leases.set(sessionId, Date.now() + PLAYBACK_LEASE_MS);
      this.current?.controller.abort();
    } else {
      this.leases.delete(sessionId);
    }
  }

  beginStream(): () => void {
    this.openStreams++;
    this.current?.controller.abort();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.openStreams--;
      this.streamActiveUntil = Date.now() + RECENT_STREAM_MS;
    };
  }

  request(file: Candidate): void {
    const key = candidateKey(file);
    if (this.current && candidateKey(this.current.file) === key) return;
    if ((this.retryAfter.get(key) ?? 0) > Date.now()) return;
    this.requested.set(key, file);
    if (this.requested.size > MAX_REQUESTED) {
      const oldest = this.requested.keys().next().value;
      if (oldest !== undefined) this.requested.delete(oldest);
    }
  }

  refreshLibraryQueue(): void {
    this.sweepPage = [];
    this.sweepCursor = null;
    this.nextSweepAt = 0;
  }

  isGenerating(type: FileType, id: number): boolean {
    return this.current?.file.id === id &&
      this.current.file.type === type &&
      !this.current.controller.signal.aborted;
  }

  private isIdle(now: number): boolean {
    for (const [id, expiresAt] of this.leases) {
      if (expiresAt <= now) this.leases.delete(id);
    }
    return this.leases.size === 0 && this.openStreams === 0 && now >= this.streamActiveUntil;
  }

  private paths(file: Candidate) {
    return thumbnailCacheDir(this.cacheRoot, file.type, file.id);
  }

  private needsPreview(file: Candidate, now: number): boolean {
    return (this.retryAfter.get(candidateKey(file)) ?? 0) <= now &&
      !getCachedThumbnailPaths(this.paths(file), file.fileMtimeMs);
  }

  private readSweepPage() {
    const movies = this.db.select({
      type: sql<FileType>`'movie'`.as("type"),
      id: movieFiles.id,
      filePath: movieFiles.filePath,
      fileMtimeMs: movieFiles.fileMtimeMs,
      durationMs: movieFiles.durationMs,
      // Match Recently Added, including upgrades that keep the original file ID.
      addedAt: sql<number>`coalesce(${mediaItems.recentlyAddedAt}, ${mediaItems.createdAt} * 1000)`.as("added_at"),
    }).from(movieFiles).innerJoin(mediaItems, eq(movieFiles.mediaItemId, mediaItems.id));

    const episodes = this.db.select({
      type: sql<FileType>`'episode'`.as("type"),
      id: tvEpisodes.id,
      filePath: tvEpisodes.filePath,
      fileMtimeMs: tvEpisodes.fileMtimeMs,
      durationMs: tvEpisodes.durationMs,
      // New episodes of older shows should get previews before the backlog too.
      addedAt: sql<number>`${tvEpisodes.createdAt} * 1000`.as("added_at"),
    }).from(tvEpisodes);

    const files = movies.unionAll(episodes).as("preview_sources");
    const cursor = this.sweepCursor;
    return this.db.select().from(files)
      .where(cursor ? sql`(${files.addedAt}, ${files.type}, ${files.id}) < (${cursor.addedAt}, ${cursor.type}, ${cursor.id})` : undefined)
      .orderBy(desc(files.addedAt), desc(files.type), desc(files.id))
      .limit(PAGE_SIZE).all();
  }

  private nextCandidate(now: number): Candidate | null {
    if (this.interrupted) {
      const file = this.interrupted;
      this.interrupted = null;
      if (this.needsPreview(file, now)) return file;
    }

    for (const [key, file] of this.requested) {
      this.requested.delete(key);
      if (this.needsPreview(file, now)) return file;
    }

    if (now < this.nextSweepAt) return null;
    if (this.sweepPage.length === 0) {
      const rows = this.readSweepPage();
      this.sweepCursor = rows.at(-1) ?? null;
      if (this.sweepCursor === null) {
        this.nextSweepAt = now + RETRY_MS;
        return null;
      }
      this.sweepPage = rows.reverse();
    }
    while (this.sweepPage.length > 0) {
      const file = this.sweepPage.pop()!;
      if (this.needsPreview(file, now)) return file;
    }
    return null;
  }

  async runOnce(): Promise<void> {
    const now = Date.now();
    if (this.stopped || !this.isIdle(now) || this.current) return;
    for (const [key, until] of this.retryAfter) {
      if (until <= now) this.retryAfter.delete(key);
    }
    const file = this.nextCandidate(now);
    if (!file) return;

    const controller = new AbortController();
    const { signal } = controller;
    this.current = { file, controller };
    try {
      if (!fs.existsSync(file.filePath)) return;
      const durationMs = file.durationMs && file.durationMs > 0 ? file.durationMs :
        (await probeFile(file.filePath, { signal }))?.durationMs;
      if (signal.aborted) return;
      if (!durationMs || !await ensureThumbnailSprite(
        file.filePath, this.paths(file), durationMs, signal, file.fileMtimeMs,
      )) {
        if (!signal.aborted) this.retryAfter.set(candidateKey(file), Date.now() + RETRY_MS);
      }
    } finally {
      if (signal.aborted && !this.stopped) this.interrupted = file;
      this.current = null;
    }
  }
}
