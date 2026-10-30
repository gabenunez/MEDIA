import { isWatchCompleted } from "@media-app/shared";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms?: number | null): string {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const RESUME_MIN_PERCENT = 0.02;

export function canResumePlayback(
  positionMs?: number | null,
  durationMs?: number | null,
): boolean {
  if (!positionMs || positionMs <= 0 || !durationMs || durationMs <= 0) {
    return false;
  }
  if (isWatchCompleted(positionMs, durationMs)) return false;
  return positionMs / durationMs > RESUME_MIN_PERCENT;
}

export function formatWatchLength(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

/** Time left when an episode can resume, otherwise the runtime. */
export function episodeStatusLabel(
  positionMs: number | null | undefined,
  durationMs: number | null | undefined,
  canResume: boolean,
): string {
  if (canResume && positionMs && durationMs && durationMs > positionMs) {
    return `${formatWatchLength(durationMs - positionMs)} left`;
  }
  if (durationMs && durationMs > 0) return formatWatchLength(durationMs);
  return "Play";
}

export function getPlaybackButtonLabel(
  positionMs?: number | null,
  durationMs?: number | null,
): string {
  if (canResumePlayback(positionMs, durationMs)) {
    return `Resume at ${formatDuration(positionMs)}`;
  }
  return "Play";
}

export const START_FROM_BEGINNING_LABEL = "Start from beginning";

export function resolveWatchInitialResumeSeconds({
  fromStart,
  castStartSeconds,
  positionMs,
  durationMs,
}: {
  fromStart: boolean;
  castStartSeconds: number;
  positionMs: number;
  durationMs: number;
}): number {
  if (fromStart) return 0;
  if (!Number.isNaN(castStartSeconds) && castStartSeconds > 0) {
    return castStartSeconds;
  }
  if (canResumePlayback(positionMs, durationMs)) {
    return positionMs / 1000;
  }
  return 0;
}

export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatBitrate(bps?: number | null): string {
  if (bps == null || bps <= 0) return "Unknown";
  if (bps < 1_000_000) return `${Math.round(bps / 1000)} kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

export function formatResolution(
  width?: number | null,
  height?: number | null,
): string {
  if (!width && !height) return "Unknown";
  if (width && height) return `${width}×${height}`;
  if (height) return `${height}p`;
  return `${width}w`;
}
