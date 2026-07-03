import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@reel/shared";
import type { DatabaseInstance } from "../db/index.js";
import { eq } from "drizzle-orm";
import { movieFiles, tvEpisodes } from "../db/schema.js";
import {
  startHlsTranscode,
  resolveHlsSession,
  generateHlsPlaylist,
  isTranscodeInProgress,
  waitForFirstSegment,
  checkFfmpegAvailable,
  probeFile,
  canDirectCast,
  stopTranscodeSessionsForFile,
} from "../utils/ffmpeg.js";
import { createStreamSessionId } from "../utils/stream-session.js";
import { appendQueryParam, getCastBaseUrl, toAbsoluteUrl } from "../utils/network.js";
import type { AuthService } from "../services/auth.js";

export async function castRoutes(
  app: FastifyInstance,
  db: DatabaseInstance,
  config: AppConfig,
  auth: AuthService,
) {
  app.get("/api/cast/config", async (request) => {
    const castBase = getCastBaseUrl(request, config);
    return {
      requestBaseUrl: castBase,
      lanBaseUrl: castBase,
      castBaseUrl: castBase,
      transcodingEnabled: config.transcoding.enabled,
    };
  });

  app.post<{
    Body: {
      fileId: number;
      type: "movie" | "episode";
      subtitleId?: number;
      title?: string;
      posterPath?: string | null;
      startTimeMs?: number;
    };
  }>("/api/cast/prepare", async (request, reply) => {
    const { fileId, type, subtitleId, title, posterPath, startTimeMs } =
      request.body;

    if (!fileId || (type !== "movie" && type !== "episode")) {
      return reply.status(400).send({ error: "Invalid cast request" });
    }

    let filePath: string | null = null;
    if (type === "movie") {
      const file = await db.query.movieFiles.findFirst({
        where: eq(movieFiles.id, fileId),
      });
      filePath = file?.filePath ?? null;
    } else {
      const episode = await db.query.tvEpisodes.findFirst({
        where: eq(tvEpisodes.id, fileId),
      });
      filePath = episode?.filePath ?? null;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return reply.status(404).send({ error: "File not found" });
    }

    const castBase = getCastBaseUrl(request, config);
    const castToken = auth.createCastToken({
      fileId,
      mediaType: type,
      subtitleId,
    });
    const startSeconds = startTimeMs ? Math.max(0, Math.floor(startTimeMs / 1000)) : 0;
    const probe = await probeFile(filePath);

    let contentUrl: string;
    let contentType: string;

    if (canDirectCast(filePath, probe)) {
      contentUrl = appendQueryParam(
        toAbsoluteUrl(castBase, `/api/stream/${fileId}?type=${type}`),
        "castToken",
        castToken,
      );
      contentType = "video/mp4";
    } else {
      const ffmpegAvailable = await checkFfmpegAvailable();
      if (!ffmpegAvailable || !config.transcoding.enabled) {
        return reply.status(400).send({
          error: "Chromecast requires FFmpeg transcoding for this file format",
        });
      }

      const castQuality = "720p" as const;
      const sessionId = createStreamSessionId(type, fileId, castQuality, startSeconds);
      const outputDir = path.join(config.transcoding.cache_dir, sessionId);
      const sourceHeight = probe?.height ?? null;

      stopTranscodeSessionsForFile(
        config.transcoding.cache_dir,
        type,
        fileId,
        sessionId,
      );

      let session = resolveHlsSession(sessionId, outputDir, startSeconds);
      if (!session) {
        session = startHlsTranscode(
          sessionId,
          filePath,
          outputDir,
          config.transcoding.hls_segment_duration,
          castQuality,
          sourceHeight,
          startSeconds,
        );
      }

      const ready = await waitForFirstSegment(outputDir);
      if (!ready) {
        return reply.status(500).send({
          error: "Transcoding failed to start — try casting again in a moment",
        });
      }

      const inProgress = isTranscodeInProgress(sessionId);
      const playlist = generateHlsPlaylist(
        outputDir,
        config.transcoding.hls_segment_duration,
        inProgress,
      );
      if (!playlist) {
        return reply.status(500).send({
          error: "Transcoding failed to start — try casting again in a moment",
        });
      }

      const masterPath = `/api/stream/${fileId}/hls/master.m3u8?type=${type}&quality=${castQuality}&start=${startSeconds}&cast=1&base=${encodeURIComponent(castBase)}&castToken=${encodeURIComponent(castToken)}`;
      contentUrl = toAbsoluteUrl(castBase, masterPath);
      contentType = "application/vnd.apple.mpegurl";
    }

    let subtitleUrl: string | null = null;
    if (subtitleId) {
      subtitleUrl = appendQueryParam(
        toAbsoluteUrl(castBase, `/api/subtitles/${subtitleId}`),
        "castToken",
        castToken,
      );
    }

    let posterUrl: string | null = null;
    if (posterPath) {
      posterUrl = posterPath.startsWith("http")
        ? posterPath
        : toAbsoluteUrl(castBase, posterPath);
    }

    return {
      contentUrl,
      contentType,
      title: title ?? path.basename(filePath),
      posterUrl,
      subtitleUrl,
      startTime: startSeconds,
      castBaseUrl: castBase,
    };
  });
}
