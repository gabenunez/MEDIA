import fs from "node:fs";
import { gt } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { movieFiles, tvEpisodes } from "../db/schema.js";
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
  private cursors: Record<FileType, number | null> = { movie: 0, episode: 0 };
  private nextType: FileType = "movie";

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
    for (let attempt = 0; attempt < 2; attempt++) {
      const type = this.nextType;
      this.nextType = type === "movie" ? "episode" : "movie";
      const cursor = this.cursors[type];
      if (cursor === null) continue;

      const table = type === "movie" ? movieFiles : tvEpisodes;
      const rows = this.db.select({
        id: table.id,
        filePath: table.filePath,
        fileMtimeMs: table.fileMtimeMs,
        durationMs: table.durationMs,
      }).from(table).where(gt(table.id, cursor)).orderBy(table.id).limit(PAGE_SIZE).all();

      for (const row of rows) {
        this.cursors[type] = row.id;
        const file = { type, ...row };
        if (this.needsPreview(file, now)) return file;
      }
      if (rows.length < PAGE_SIZE) this.cursors[type] = null;
    }
    if (this.cursors.movie === null && this.cursors.episode === null) {
      this.cursors = { movie: 0, episode: 0 };
      this.nextSweepAt = now + RETRY_MS;
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
