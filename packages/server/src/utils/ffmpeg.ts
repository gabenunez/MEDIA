import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type { TranscodeQuality } from "@reel/shared";
import {
  TRANSCODE_PRESETS,
  effectiveTranscodeHeight,
} from "@reel/shared";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  durationMs: number;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  subtitleStreams: Array<{
    index: number;
    language?: string;
    title?: string;
    codec?: string;
  }>;
}

export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function probeFile(filePath: string): Promise<ProbeResult | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    const data = JSON.parse(stdout) as {
      format?: { duration?: string; bit_rate?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        tags?: { language?: string; title?: string };
      }>;
    };

    const videoStream = data.streams?.find((s) => s.codec_type === "video");
    const audioStream = data.streams?.find((s) => s.codec_type === "audio");
    const subtitleStreams =
      data.streams
        ?.map((s, index) => ({ ...s, index }))
        .filter((s) => s.codec_type === "subtitle")
        .map((s) => ({
          index: s.index,
          language: s.tags?.language,
          title: s.tags?.title,
          codec: s.codec_name,
        })) ?? [];

    const durationSec = parseFloat(data.format?.duration ?? "0");

    return {
      durationMs: Math.round(durationSec * 1000),
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      width: videoStream?.width,
      height: videoStream?.height,
      bitrate: data.format?.bit_rate
        ? parseInt(data.format.bit_rate, 10)
        : undefined,
      subtitleStreams,
    };
  } catch {
    return null;
  }
}

export function extractEmbeddedSubtitle(
  filePath: string,
  streamIndex: number,
  outputPath: string,
  timeoutMs = 120_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      filePath,
      "-map",
      `0:${streamIndex}`,
      "-f",
      "webvtt",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Subtitle extraction timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputPath)) resolve();
      else reject(new Error(`Failed to extract subtitle stream ${streamIndex}`));
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export interface HlsSession {
  id: string;
  process: ChildProcess | null;
  outputDir: string;
  playlistPath: string;
  lastAccess: number;
}

const activeSessions = new Map<string, HlsSession>();

export function readStartOffset(outputDir: string): number {
  try {
    const marker = path.join(outputDir, ".start-offset");
    if (!fs.existsSync(marker)) return 0;
    const value = JSON.parse(fs.readFileSync(marker, "utf8")) as number;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeStartOffset(outputDir: string, startSeconds: number): void {
  fs.writeFileSync(
    path.join(outputDir, ".start-offset"),
    JSON.stringify(startSeconds),
  );
}

export function clearTranscodeOutput(outputDir: string): void {
  if (!fs.existsSync(outputDir)) return;
  for (const entry of fs.readdirSync(outputDir)) {
    fs.unlinkSync(path.join(outputDir, entry));
  }
}

export function startHlsTranscode(
  sessionId: string,
  filePath: string,
  outputDir: string,
  segmentDuration: number,
  quality: TranscodeQuality,
  sourceHeight?: number | null,
  startSeconds = 0,
): HlsSession {
  fs.mkdirSync(outputDir, { recursive: true });
  const playlistPath = `${outputDir}/master.m3u8`;
  const preset = TRANSCODE_PRESETS[quality];
  const height = effectiveTranscodeHeight(quality, sourceHeight);

  clearTranscodeOutput(outputDir);
  writeStartOffset(outputDir, startSeconds);

  const logPath = `${outputDir}/ffmpeg.log`;
  const logStream = fs.openSync(logPath, "a");
  let logClosed = false;
  const closeLog = () => {
    if (!logClosed) {
      logClosed = true;
      fs.closeSync(logStream);
    }
  };

  const args = ["-y"];
  if (startSeconds > 0) {
    args.push("-ss", String(startSeconds));
  }
  args.push(
    "-i",
    filePath,
    "-vf",
    `scale=-2:${height}`,
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-level",
    preset.h264Level,
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    String(preset.crf),
    "-maxrate",
    preset.maxrate,
    "-bufsize",
    preset.bufsize,
    "-c:a",
    "aac",
    "-b:a",
    preset.audioBitrate,
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    String(segmentDuration),
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "event",
    "-hls_flags",
    "independent_segments+append_list",
    "-hls_segment_filename",
    `${outputDir}/segment_%03d.ts`,
    playlistPath,
  );

  const process = spawn("ffmpeg", args, {
    stdio: ["ignore", logStream, logStream],
  });

  const session: HlsSession = {
    id: sessionId,
    process,
    outputDir,
    playlistPath,
    lastAccess: Date.now(),
  };

  activeSessions.set(sessionId, session);

  process.on("close", (code) => {
    closeLog();
    activeSessions.delete(sessionId);
    if (code !== 0 && code !== null) {
      console.warn(`HLS transcode exited with code ${code} for session ${sessionId}`);
    }
  });

  process.on("error", (err) => {
    closeLog();
    activeSessions.delete(sessionId);
    console.warn(`HLS transcode failed for session ${sessionId}:`, err.message);
  });

  return session;
}

export function resolveHlsSession(
  sessionId: string,
  outputDir: string,
  startSeconds = 0,
): HlsSession | undefined {
  const active = getHlsSession(sessionId);
  if (active) return active;

  if (listHlsSegments(outputDir).length === 0) return undefined;
  if (Math.abs(readStartOffset(outputDir) - startSeconds) > 5) return undefined;

  return {
    id: sessionId,
    process: null,
    outputDir,
    playlistPath: path.join(outputDir, "master.m3u8"),
    lastAccess: Date.now(),
  };
}

export function listHlsSegments(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) return [];

  return fs
    .readdirSync(outputDir)
    .filter((name) => /^segment_\d+\.ts$/.test(name))
    .sort((a, b) => {
      const ai = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const bi = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return ai - bi;
    });
}

export function generateHlsPlaylist(
  outputDir: string,
  segmentDuration: number,
  inProgress: boolean,
): string | null {
  const segments = listHlsSegments(outputDir).filter((name) => {
    try {
      return fs.statSync(path.join(outputDir, name)).size > 0;
    } catch {
      return false;
    }
  });

  if (segments.length === 0) return null;

  const targetDuration = Math.max(segmentDuration + 1, 6);
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:EVENT",
  ];

  for (const segment of segments) {
    lines.push(`#EXTINF:${segmentDuration}.0,`, segment);
  }

  if (!inProgress) {
    lines.push("#EXT-X-ENDLIST");
  }

  return `${lines.join("\n")}\n`;
}

export function isTranscodeInProgress(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

export function getHlsSession(sessionId: string): HlsSession | undefined {
  const session = activeSessions.get(sessionId);
  if (session) session.lastAccess = Date.now();
  return session;
}

export function stopHlsSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session?.process) {
    session.process.kill("SIGTERM");
    activeSessions.delete(sessionId);
  }
}

export function cleanupIdleSessions(maxIdleMs = 5 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (now - session.lastAccess > maxIdleMs) {
      session.process?.kill("SIGTERM");
      activeSessions.delete(id);
    }
  }
}

setInterval(() => cleanupIdleSessions(), 60_000);

export async function waitForFirstSegment(
  outputDir: string,
  timeoutMs = 90_000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const segments = listHlsSegments(outputDir);
    if (
      segments.length > 0 &&
      fs.statSync(path.join(outputDir, segments[0])).size > 0
    ) {
      return true;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return false;
}

/** @deprecated Use waitForFirstSegment — FFmpeg 4.x may not write m3u8 until complete. */
export async function waitForPlaylist(
  playlistPath: string,
  outputDir?: string,
  timeoutMs = 90_000,
): Promise<boolean> {
  if (outputDir) {
    return waitForFirstSegment(outputDir, timeoutMs);
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(playlistPath)) {
      const content = fs.readFileSync(playlistPath, "utf-8");
      if (content.includes("#EXTINF")) return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function waitForCompletePlaylist(
  playlistPath: string,
  timeoutMs = 120_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(playlistPath)) {
      const content = fs.readFileSync(playlistPath, "utf-8");
      if (content.includes("#EXTINF") && content.includes("#EXT-X-ENDLIST")) {
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export function canDirectCast(
  filePath: string,
  probe: ProbeResult | null,
): boolean {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
  if (ext !== ".mp4" && ext !== ".m4v") return false;
  if (!probe) return false;

  const videoOk = probe.videoCodec === "h264";
  const audioOk =
    !probe.audioCodec || ["aac", "mp3"].includes(probe.audioCodec);

  return videoOk && audioOk;
}
