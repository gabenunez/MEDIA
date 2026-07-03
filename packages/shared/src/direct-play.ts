import type { StreamQuality, TranscodeQuality } from "./stream-quality.js";

const BROWSER_DIRECT_PLAY_AUDIO_CODECS = new Set([
  "aac",
  "mp3",
  "mp4a",
  "opus",
  "vorbis",
  "flac",
]);

export function normalizeCodecName(codec?: string | null): string | null {
  if (!codec?.trim()) return null;
  return codec.toLowerCase().split(".")[0]?.split("_")[0] ?? null;
}

/** Whether the browser can decode this audio track in a direct file stream. */
export function isBrowserDirectPlayAudioSupported(audioCodec?: string | null): boolean {
  const normalized = normalizeCodecName(audioCodec);
  if (!normalized) return true;
  return BROWSER_DIRECT_PLAY_AUDIO_CODECS.has(normalized);
}

export function pickTranscodeQualityForPlayback(
  available: StreamQuality[],
): TranscodeQuality {
  for (const quality of ["720p", "1080p", "480p"] as const) {
    if (available.includes(quality)) return quality;
  }

  const fallback = available.find((quality) => quality !== "original");
  return (fallback as TranscodeQuality | undefined) ?? "720p";
}
