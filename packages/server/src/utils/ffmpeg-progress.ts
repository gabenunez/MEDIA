export function parseFfmpegOutTimeSeconds(value: string): number | null {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Ratio 0–1 from one ffmpeg `-progress` key/value line. */
export function progressFromFfmpegLine(
  line: string,
  durationMs: number,
): number | null {
  const trimmed = line.trim();
  if (trimmed === "progress=end") return 1;

  const durationSec = durationMs / 1000;
  if (!(durationSec > 0)) return null;

  if (trimmed.startsWith("out_time=")) {
    const seconds = parseFfmpegOutTimeSeconds(trimmed.slice("out_time=".length));
    if (seconds == null) return null;
    return Math.min(1, Math.max(0, seconds / durationSec));
  }

  return null;
}
