import fs from "node:fs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@media-app/shared";
import { eq } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import {
  mediaItems,
  movieFiles,
  tvEpisodes,
  tvSeasons,
} from "../db/schema.js";
import { checkFfmpegAvailable, probeFile } from "../utils/ffmpeg.js";
import { parseIdParam, sendError } from "./util.js";
import {
  deleteOfflineJob,
  getOfflineJob,
  getOfflineJobFilePath,
  previewOfflinePlan,
  startOfflineJob,
  type OfflineJobMeta,
} from "../services/offline-downloads.js";

function parseType(value?: string): "movie" | "episode" | null {
  if (value === "movie" || value === "episode") return value;
  return null;
}

function parseHttpRange(
  range: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!range?.startsWith("bytes=") || size <= 0) return null;
  const spec = range.slice("bytes=".length).split(",")[0]?.trim();
  if (!spec) return null;
  const separator = spec.indexOf("-");
  if (separator === -1) return null;
  const startRaw = spec.slice(0, separator).trim();
  const endRaw = spec.slice(separator + 1).trim();
  const toInt = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : null);

  if (!startRaw) {
    const suffix = toInt(endRaw);
    if (suffix == null || suffix <= 0) return null;
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = toInt(startRaw);
  const end = endRaw ? toInt(endRaw) : size - 1;
  if (start == null || end == null || start < 0 || start >= size || end < start) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function publicJob(meta: OfflineJobMeta) {
  return {
    id: meta.id,
    fileId: meta.fileId,
    type: meta.type,
    mediaId: meta.mediaId,
    title: meta.title,
    subtitle: meta.subtitle,
    posterPath: meta.posterPath,
    durationMs: meta.durationMs,
    status: meta.status,
    progress: meta.progress,
    plan: meta.plan,
    error: meta.error,
    bytes: meta.bytes,
    estimatedBytes: meta.plan.estimatedBytes,
  };
}

async function resolveSource(
  db: DatabaseInstance,
  fileId: number,
  type: "movie" | "episode",
): Promise<{
  filePath: string;
  durationMs: number;
  sourceHeight: number | null;
  mediaId: number | null;
  title: string;
  subtitle: string | null;
  posterPath: string | null;
} | null> {
  if (type === "movie") {
    const row = await db
      .select({
        filePath: movieFiles.filePath,
        durationMs: movieFiles.durationMs,
        height: movieFiles.height,
        mediaId: mediaItems.id,
        title: mediaItems.title,
        posterPath: mediaItems.posterPath,
      })
      .from(movieFiles)
      .innerJoin(mediaItems, eq(movieFiles.mediaItemId, mediaItems.id))
      .where(eq(movieFiles.id, fileId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) return null;
    return {
      filePath: row.filePath,
      durationMs: row.durationMs ?? 0,
      sourceHeight: row.height ?? null,
      mediaId: row.mediaId,
      title: row.title,
      subtitle: null,
      posterPath: row.posterPath,
    };
  }

  const row = await db
    .select({
      filePath: tvEpisodes.filePath,
      durationMs: tvEpisodes.durationMs,
      height: tvEpisodes.height,
      episodeTitle: tvEpisodes.title,
      episodeNumber: tvEpisodes.episodeNumber,
      seasonNumber: tvSeasons.seasonNumber,
      mediaId: mediaItems.id,
      showTitle: mediaItems.title,
      posterPath: mediaItems.posterPath,
      stillPath: tvEpisodes.stillPath,
    })
    .from(tvEpisodes)
    .innerJoin(tvSeasons, eq(tvEpisodes.seasonId, tvSeasons.id))
    .innerJoin(mediaItems, eq(tvSeasons.mediaItemId, mediaItems.id))
    .where(eq(tvEpisodes.id, fileId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) return null;

  const episodeName = row.episodeTitle?.trim() || `Episode ${row.episodeNumber}`;
  return {
    filePath: row.filePath,
    durationMs: row.durationMs ?? 0,
    sourceHeight: row.height ?? null,
    mediaId: row.mediaId,
    title: `${row.showTitle}: ${episodeName} (S${row.seasonNumber}E${row.episodeNumber})`,
    subtitle: row.showTitle,
    posterPath: row.stillPath ?? row.posterPath,
  };
}

export async function offlineRoutes(
  app: FastifyInstance,
  db: DatabaseInstance,
  config: AppConfig,
) {
  const cacheDir = config.transcoding.cache_dir;

  app.get<{ Querystring: { fileId?: string; type?: string } }>(
    "/api/offline/plan",
    async (request, reply) => {
      const fileId = parseIdParam(request.query.fileId);
      const type = parseType(request.query.type);
      if (!fileId || !type) {
        return reply.status(400).send({ error: "Invalid request" });
      }
      const source = await resolveSource(db, fileId, type);
      if (!source || !fs.existsSync(source.filePath)) {
        return reply.status(404).send({ error: "File not found" });
      }
      let durationMs = source.durationMs;
      let sourceHeight = source.sourceHeight;
      if (!durationMs || !sourceHeight) {
        const probe = await probeFile(source.filePath);
        durationMs = durationMs || probe?.durationMs || 0;
        sourceHeight = sourceHeight ?? probe?.height ?? null;
      }
      if (!durationMs) {
        return reply.status(400).send({ error: "Could not read video duration" });
      }
      const plan = await previewOfflinePlan({ durationMs, sourceHeight });
      return {
        ...publicJob({
          id: `${type}-${fileId}`,
          fileId,
          type,
          mediaId: source.mediaId,
          title: source.title,
          subtitle: source.subtitle,
          posterPath: source.posterPath,
          durationMs,
          sourceHeight,
          status: "queued",
          progress: 0,
          plan,
          error: null,
          bytes: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          readyAt: null,
        }),
        status: "plan" as const,
      };
    },
  );

  app.get<{ Params: { id: string } }>("/api/offline/jobs/:id", async (request, reply) => {
    const meta = getOfflineJob(cacheDir, request.params.id);
    if (!meta) return reply.status(404).send({ error: "Download not found" });
    return publicJob(meta);
  });

  app.post<{ Body: { fileId?: number; type?: string } }>(
    "/api/offline/jobs",
    async (request, reply) => {
      if (!config.transcoding.enabled) {
        return reply.status(400).send({ error: "Transcoding is disabled" });
      }
      const ffmpegOk = await checkFfmpegAvailable();
      if (!ffmpegOk) {
        return reply.status(503).send({ error: "FFmpeg is not available" });
      }

      const fileId =
        typeof request.body?.fileId === "number"
          ? request.body.fileId
          : parseIdParam(String(request.body?.fileId ?? ""));
      const type = parseType(request.body?.type);
      if (!fileId || !type) {
        return reply.status(400).send({ error: "Invalid request" });
      }

      const source = await resolveSource(db, fileId, type);
      if (!source || !fs.existsSync(source.filePath)) {
        return reply.status(404).send({ error: "File not found" });
      }

      try {
        const probe = await probeFile(source.filePath);
        const job = await startOfflineJob({
          cacheDir,
          filePath: source.filePath,
          fileId,
          type,
          mediaId: source.mediaId,
          title: source.title,
          subtitle: source.subtitle,
          posterPath: source.posterPath,
          durationMs: source.durationMs || probe?.durationMs || 0,
          sourceHeight: source.sourceHeight ?? probe?.height ?? null,
          audioStreamIndex: probe?.audioStreamIndex ?? null,
          dynamicRange: probe?.dynamicRange ?? null,
        });
        return publicJob(job);
      } catch (err) {
        return sendError(reply, 500, err, "Failed to start offline encode");
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/offline/jobs/:id",
    async (request, reply) => {
      const existed = deleteOfflineJob(cacheDir, request.params.id);
      if (!existed) return reply.status(404).send({ error: "Download not found" });
      return { success: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/offline/jobs/:id/file",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const filePath = getOfflineJobFilePath(cacheDir, request.params.id);
      if (!filePath) {
        return reply.status(409).send({ error: "Compressed file is not ready" });
      }

      const stats = fs.statSync(filePath);
      const range = request.headers.range;
      reply.header("Content-Type", "video/mp4");
      reply.header("Accept-Ranges", "bytes");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${request.params.id}.mp4"`,
      );
      reply.header("Cache-Control", "private, max-age=3600");

      if (range) {
        const parsed = parseHttpRange(range, stats.size);
        if (!parsed) {
          return reply
            .status(416)
            .header("Content-Range", `bytes */${stats.size}`)
            .send({ error: "Invalid range" });
        }
        const { start, end } = parsed;
        const chunkSize = end - start + 1;
        return reply
          .status(206)
          .header("Content-Range", `bytes ${start}-${end}/${stats.size}`)
          .header("Content-Length", chunkSize)
          .send(fs.createReadStream(filePath, { start, end, highWaterMark: 8 * 1024 * 1024 }));
      }

      return reply
        .header("Content-Length", stats.size)
        .send(fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 }));
    },
  );
}
