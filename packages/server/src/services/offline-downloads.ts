import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  buildTranscodeVideoFilter,
  ffmpegBitrateKbps,
  offlineRecordId,
  planOfflineEncode,
  type OfflineEncodePlan,
  type VideoDynamicRange,
} from "@media-app/shared";
import { checkHevcEncoderAvailable, probeFile } from "./ffmpeg.js";
import { progressFromFfmpegLine } from "./ffmpeg-progress.js";

export type OfflineJobStatus = "queued" | "encoding" | "ready" | "error";

export interface OfflineJobMeta {
  id: string;
  fileId: number;
  type: "movie" | "episode";
  mediaId: number | null;
  title: string;
  subtitle: string | null;
  posterPath: string | null;
  durationMs: number;
  sourceHeight: number | null;
  status: OfflineJobStatus;
  progress: number;
  plan: OfflineEncodePlan;
  error: string | null;
  bytes: number | null;
  createdAt: number;
  updatedAt: number;
  readyAt: number | null;
}

interface ActiveEncode {
  process: ChildProcess;
  startedAt: number;
}

const OUTPUT_NAME = "output.mp4";
const PARTIAL_NAME = "output.partial.mp4";
const META_NAME = "meta.json";
const MAX_CONCURRENT = 1;
const READY_TTL_MS = 48 * 60 * 60 * 1000;

const active = new Map<string, ActiveEncode>();
const waiters: Array<() => void> = [];

function jobDir(cacheDir: string, id: string): string {
  return path.join(cacheDir, "offline", id);
}

function metaPath(dir: string): string {
  return path.join(dir, META_NAME);
}

function outputPath(dir: string): string {
  return path.join(dir, OUTPUT_NAME);
}

function readMeta(dir: string): OfflineJobMeta | null {
  try {
    const raw = fs.readFileSync(metaPath(dir), "utf8");
    return JSON.parse(raw) as OfflineJobMeta;
  } catch {
    return null;
  }
}

function writeMeta(dir: string, meta: OfflineJobMeta): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${metaPath(dir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
  fs.renameSync(tmp, metaPath(dir));
}

function updateMeta(
  dir: string,
  patch: Partial<OfflineJobMeta>,
): OfflineJobMeta | null {
  const current = readMeta(dir);
  if (!current) return null;
  const next: OfflineJobMeta = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  writeMeta(dir, next);
  return next;
}

export function getOfflineJob(
  cacheDir: string,
  id: string,
): OfflineJobMeta | null {
  const dir = jobDir(cacheDir, id);
  const meta = readMeta(dir);
  if (!meta) return null;
  if (meta.status === "ready") {
    const file = outputPath(dir);
    if (!fs.existsSync(file)) {
      return updateMeta(dir, {
        status: "error",
        error: "Compressed file is missing",
        bytes: null,
      });
    }
    try {
      const bytes = fs.statSync(file).size;
      if (bytes !== meta.bytes) {
        return updateMeta(dir, { bytes });
      }
    } catch {
      // ignore
    }
  }
  return meta;
}

export function getOfflineJobFilePath(
  cacheDir: string,
  id: string,
): string | null {
  const meta = getOfflineJob(cacheDir, id);
  if (!meta || meta.status !== "ready") return null;
  const file = outputPath(jobDir(cacheDir, id));
  return fs.existsSync(file) ? file : null;
}

export function deleteOfflineJob(cacheDir: string, id: string): boolean {
  stopOfflineEncode(id);
  const dir = jobDir(cacheDir, id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function stopOfflineEncode(id: string): void {
  const session = active.get(id);
  if (!session) return;
  try {
    session.process.kill("SIGKILL");
  } catch {
    // already exited
  }
  active.delete(id);
}

export function stopAllOfflineEncodes(): void {
  for (const id of [...active.keys()]) {
    stopOfflineEncode(id);
  }
}

export function recoverOrphanedOfflineJobs(cacheDir: string): number {
  const root = path.join(cacheDir, "offline");
  if (!fs.existsSync(root)) return 0;
  let recovered = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const meta = readMeta(dir);
    if (!meta) continue;
    if (meta.status === "encoding" || meta.status === "queued") {
      if (!active.has(meta.id)) {
        writeMeta(dir, {
          ...meta,
          status: "error",
          error: "Encode interrupted",
          updatedAt: Date.now(),
        });
        recovered += 1;
      }
    }
  }
  return recovered;
}

export function pruneReadyOfflineJobs(
  cacheDir: string,
  maxAgeMs = READY_TTL_MS,
): number {
  const root = path.join(cacheDir, "offline");
  if (!fs.existsSync(root)) return 0;
  const now = Date.now();
  let removed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const meta = readMeta(dir);
    if (!meta) continue;
    if (meta.status !== "ready" || !meta.readyAt) continue;
    if (now - meta.readyAt < maxAgeMs) continue;
    if (active.has(meta.id)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function pumpQueue(): void {
  while (active.size < MAX_CONCURRENT && waiters.length > 0) {
    const next = waiters.shift();
    next?.();
  }
}

function enqueueEncode(): Promise<void> {
  if (active.size < MAX_CONCURRENT) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

function buildEncodeArgs(options: {
  filePath: string;
  outputFile: string;
  plan: OfflineEncodePlan;
  audioStreamIndex?: number | null;
  dynamicRange?: VideoDynamicRange | null;
  sourceHeight?: number | null;
}): string[] {
  const { filePath, outputFile, plan, audioStreamIndex, dynamicRange, sourceHeight } =
    options;
  const maxrate = ffmpegBitrateKbps(plan.videoBitrate);
  const bufsize = ffmpegBitrateKbps(plan.videoBitrate * 2);
  const audio = ffmpegBitrateKbps(plan.audioBitrate);
  const audioMap =
    audioStreamIndex != null && audioStreamIndex >= 0
      ? ["-map", `0:${audioStreamIndex}`]
      : ["-map", "0:a:0?"];

  const videoCodecArgs =
    plan.codec === "hevc"
      ? [
          "-c:v",
          "libx265",
          "-tag:v",
          "hvc1",
          "-preset",
          "veryfast",
          "-x265-params",
          "log-level=error",
        ]
      : [
          "-c:v",
          "libx264",
          "-profile:v",
          "main",
          "-level",
          "3.1",
          "-preset",
          "veryfast",
        ];

  return [
    "-y",
    "-i",
    filePath,
    "-map",
    "0:v:0",
    ...audioMap,
    "-vf",
    buildTranscodeVideoFilter(plan.height, dynamicRange, sourceHeight),
    ...videoCodecArgs,
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(plan.crf),
    "-maxrate",
    maxrate,
    "-bufsize",
    bufsize,
    "-c:a",
    "aac",
    "-b:a",
    audio,
    "-ac",
    "2",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-progress",
    "pipe:1",
    "-nostats",
    outputFile,
  ];
}

function runEncode(
  cacheDir: string,
  id: string,
  filePath: string,
  plan: OfflineEncodePlan,
  durationMs: number,
  audioStreamIndex?: number | null,
  dynamicRange?: VideoDynamicRange | null,
  sourceHeight?: number | null,
): Promise<void> {
  const dir = jobDir(cacheDir, id);
  const partial = path.join(dir, PARTIAL_NAME);
  const finalPath = outputPath(dir);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.unlinkSync(partial);
  } catch {
    // none
  }

  const args = buildEncodeArgs({
    filePath,
    outputFile: partial,
    plan,
    audioStreamIndex,
    dynamicRange,
    sourceHeight,
  });
  const logPath = path.join(dir, "ffmpeg.log");
  const logStream = fs.openSync(logPath, "a");

  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", logStream],
    });
    active.set(id, { process: child, startedAt: Date.now() });
    updateMeta(dir, { status: "encoding", progress: 0, error: null });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const ratio = progressFromFfmpegLine(line, durationMs);
        if (ratio == null) continue;
        updateMeta(dir, { progress: ratio, status: "encoding" });
      }
    });

    const fail = (error: string) => {
      try {
        fs.closeSync(logStream);
      } catch {
        // closed
      }
      active.delete(id);
      updateMeta(dir, { status: "error", error, progress: 0 });
      pumpQueue();
      reject(new Error(error));
    };

    child.on("error", (err) => {
      fail(err.message || "Failed to start ffmpeg");
    });

    child.on("close", (code) => {
      try {
        fs.closeSync(logStream);
      } catch {
        // closed
      }
      active.delete(id);
      pumpQueue();

      if (code !== 0 || !fs.existsSync(partial)) {
        updateMeta(dir, {
          status: "error",
          error: `Encode failed (exit ${code ?? "unknown"})`,
        });
        reject(new Error(`Encode failed (exit ${code ?? "unknown"})`));
        return;
      }

      try {
        fs.renameSync(partial, finalPath);
        const bytes = fs.statSync(finalPath).size;
        updateMeta(dir, {
          status: "ready",
          progress: 1,
          bytes,
          error: null,
          readyAt: Date.now(),
        });
        resolve();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to finalize encode";
        updateMeta(dir, { status: "error", error: message });
        reject(err instanceof Error ? err : new Error(message));
      }
    });
  });
}

export interface StartOfflineJobInput {
  cacheDir: string;
  filePath: string;
  fileId: number;
  type: "movie" | "episode";
  mediaId: number | null;
  title: string;
  subtitle: string | null;
  posterPath: string | null;
  durationMs: number;
  sourceHeight: number | null;
  audioStreamIndex?: number | null;
  dynamicRange?: VideoDynamicRange | null;
}

export async function startOfflineJob(
  input: StartOfflineJobInput,
): Promise<OfflineJobMeta> {
  const id = offlineRecordId(input.type, input.fileId);
  const dir = jobDir(input.cacheDir, id);
  const existing = getOfflineJob(input.cacheDir, id);

  if (existing?.status === "ready") {
    return existing;
  }
  if (existing?.status === "encoding" || existing?.status === "queued") {
    return existing;
  }

  const probe =
    input.durationMs > 0 && input.sourceHeight
      ? null
      : await probeFile(input.filePath);
  const durationMs = input.durationMs > 0 ? input.durationMs : probe?.durationMs ?? 0;
  const sourceHeight = input.sourceHeight ?? probe?.height ?? null;
  const audioStreamIndex = input.audioStreamIndex ?? probe?.audioStreamIndex ?? null;
  const dynamicRange = input.dynamicRange ?? probe?.dynamicRange ?? null;

  if (!durationMs) {
    throw new Error("Could not read video duration");
  }

  const hevcAvailable = await checkHevcEncoderAvailable();
  const plan = planOfflineEncode({
    durationMs,
    sourceHeight,
    hevcAvailable,
  });

  const meta: OfflineJobMeta = {
    id,
    fileId: input.fileId,
    type: input.type,
    mediaId: input.mediaId,
    title: input.title,
    subtitle: input.subtitle,
    posterPath: input.posterPath,
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
  };
  writeMeta(dir, meta);

  void (async () => {
    await enqueueEncode();
    const latest = readMeta(dir);
    if (!latest || latest.status === "error") return;
    try {
      await runEncode(
        input.cacheDir,
        id,
        input.filePath,
        plan,
        durationMs,
        audioStreamIndex,
        dynamicRange,
        sourceHeight,
      );
    } catch (err) {
      console.warn(
        `Offline encode failed for ${id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  })();

  return getOfflineJob(input.cacheDir, id) ?? meta;
}

export async function previewOfflinePlan(input: {
  durationMs: number;
  sourceHeight?: number | null;
}): Promise<OfflineEncodePlan> {
  const hevcAvailable = await checkHevcEncoderAvailable();
  return planOfflineEncode({
    durationMs: input.durationMs,
    sourceHeight: input.sourceHeight,
    hevcAvailable,
  });
}
