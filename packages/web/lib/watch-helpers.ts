import type { StreamQuality } from "@/lib/api";
import { qualityLabel as sharedQualityLabel } from "@media-app/shared";

export interface SubtitleTrack {
  id: number;
  language: string;
  label?: string | null;
  source?: "external" | "embedded" | "opensubtitles";
}

export const QUALITY_FALLBACK_ORDER: StreamQuality[] = [
  "original",
  "2160p",
  "1080p",
  "720p",
  "480p",
];

export function formatSubtitleLabel(sub: SubtitleTrack): string {
  const sourceLabel =
    sub.source === "opensubtitles"
      ? "Online"
      : sub.source === "embedded"
        ? "Embedded"
        : "File";
  const detail = sub.label ? sub.label.slice(0, 48) : sourceLabel;
  return `${sub.language} · ${detail}`;
}

export function qualityLabel(
  quality: StreamQuality,
  sourceHeight?: number | null,
): string {
  return sharedQualityLabel(quality, sourceHeight);
}

export function nextFallbackQuality(
  current: StreamQuality,
  available: StreamQuality[],
): StreamQuality | null {
  const start = QUALITY_FALLBACK_ORDER.indexOf(current);
  if (start === -1) return null;

  for (let i = start + 1; i < QUALITY_FALLBACK_ORDER.length; i++) {
    const candidate = QUALITY_FALLBACK_ORDER[i];
    if (available.includes(candidate)) return candidate;
  }

  return null;
}

/** Skip redundant original→2160p when Original already transcodes at 2160p. */
export function resolveFallbackQuality(
  current: StreamQuality,
  available: StreamQuality[],
  activeHlsQuality?: StreamQuality | "remux" | null,
): StreamQuality | null {
  let next = nextFallbackQuality(current, available);
  if (
    current === "original" &&
    next === "2160p" &&
    activeHlsQuality === "2160p"
  ) {
    next = nextFallbackQuality("2160p", available);
  }
  return next;
}
