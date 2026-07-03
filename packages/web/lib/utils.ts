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
const RESUME_MAX_PERCENT = 0.95;

export function canResumePlayback(
  positionMs?: number | null,
  durationMs?: number | null,
): boolean {
  if (!positionMs || positionMs <= 0 || !durationMs || durationMs <= 0) {
    return false;
  }
  const percent = positionMs / durationMs;
  return percent > RESUME_MIN_PERCENT && percent < RESUME_MAX_PERCENT;
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
