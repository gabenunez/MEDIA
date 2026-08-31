/** Source frame rates at or above this often struggle on TV direct play. */
export const HIGH_SOURCE_FPS_THRESHOLD = 50;

/** Measured playback below this suggests direct/remux should step to transcode. */
export const LOW_PLAYBACK_FPS_THRESHOLD = 20;

export function parseFfprobeFrameRate(value?: string | null): number | null {
  if (!value?.trim() || value === "0/0" || value === "N/A") return null;

  const parts = value.trim().split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) {
      return null;
    }
    const fps = num / den;
    return fps > 0 && fps < 1000 ? fps : null;
  }

  const single = Number(value);
  return Number.isFinite(single) && single > 0 && single < 1000 ? single : null;
}

export function resolveVideoFrameRate(stream?: {
  avg_frame_rate?: string | null;
  r_frame_rate?: string | null;
}): number | null {
  return (
    parseFfprobeFrameRate(stream?.avg_frame_rate) ??
    parseFfprobeFrameRate(stream?.r_frame_rate)
  );
}

export function isHighSourceFrameRate(fps?: number | null): boolean {
  return fps != null && fps >= HIGH_SOURCE_FPS_THRESHOLD;
}
