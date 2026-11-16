/**
 * Signal shaping for the media-page theme waveform: an oscilloscope-style
 * trace (smooth hills, sharp crests) with vertical marks at the main peaks.
 */

/**
 * Samples of time-domain audio shown across the canvas (~23 ms at 44.1 kHz):
 * about three cycles of a voice or bass line, like the reference trace.
 */
export const WAVEFORM_WINDOW = 1024;

/**
 * Turn analyser time-domain bytes (128 = silence) into `points` values in
 * roughly -1..1. Starts at a rising zero crossing so the trace holds still
 * from frame to frame like a triggered oscilloscope, and lightly averages
 * neighbouring samples so the line reads as hills instead of noise.
 */
export function traceFromTimeDomain(
  samples: ArrayLike<number>,
  points: number,
  window = WAVEFORM_WINDOW,
  smoothRadius = 1,
): Float32Array {
  const out = new Float32Array(Math.max(0, points));
  const length = samples.length;
  if (points <= 0 || length < 2) return out;

  const span = Math.min(window, length);
  const at = (index: number) => {
    let sum = 0;
    let count = 0;
    for (let k = index - smoothRadius; k <= index + smoothRadius; k++) {
      if (k < 0 || k >= length) continue;
      sum += (samples[k] - 128) / 128;
      count += 1;
    }
    return count ? sum / count : 0;
  };

  let start = 0;
  for (let i = 1; i < length - span; i++) {
    if (at(i - 1) < 0 && at(i) >= 0) {
      start = i;
      break;
    }
  }

  for (let p = 0; p < points; p++) {
    const from = start + Math.floor((p / points) * span);
    const to = Math.max(from + 1, start + Math.floor(((p + 1) / points) * span));
    let sum = 0;
    for (let i = from; i < to; i++) sum += at(i);
    out[p] = sum / (to - from);
  }
  return out;
}

/**
 * Highest crests above `minValue`, at least `minGap` points apart, returned
 * left to right. A crest must stand `minProminence` above the lowest point on
 * both sides within `minGap`, so shoulders on a slope are not marked.
 */
export function findWaveformPeaks(
  values: ArrayLike<number>,
  {
    minGap,
    minValue = 0.2,
    maxCount = 6,
    minProminence = 0.15,
  }: { minGap: number; minValue?: number; maxCount?: number; minProminence?: number },
): number[] {
  const lowest = (from: number, to: number) => {
    let low = Infinity;
    for (let k = Math.max(0, from); k <= Math.min(values.length - 1, to); k++) {
      low = Math.min(low, values[k]);
    }
    return low;
  };

  const candidates: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i];
    if (v < minValue || v < values[i - 1] || v <= values[i + 1]) continue;
    const left = v - lowest(i - minGap, i - 1);
    const right = v - lowest(i + 1, i + minGap);
    if (left >= minProminence && right >= minProminence) candidates.push(i);
  }
  candidates.sort((a, b) => values[b] - values[a]);

  const picked: number[] = [];
  for (const index of candidates) {
    if (picked.length >= maxCount) break;
    if (picked.every((p) => Math.abs(p - index) >= minGap)) picked.push(index);
  }
  return picked.sort((a, b) => a - b);
}

/** Stand-in trace while no analyser is attached: a slow, voice-like wave. */
export function syntheticTrace(points: number, timeMs: number): Float32Array {
  const out = new Float32Array(Math.max(0, points));
  const t = timeMs / 1000;
  for (let p = 0; p < points; p++) {
    const x = p / Math.max(1, points - 1);
    const phase = 2 * Math.PI * 3 * x - t * 1.6;
    // Narrow pulses for peaked crests, a broad half-height pulse for the smaller
    // hill between them, on a rounded trough — like a voiced speech waveform.
    const crest = Math.exp(3 * (Math.sin(phase) - 1));
    const hill = Math.exp(4 * (Math.sin(phase + Math.PI) - 1));
    out[p] = 1.3 * crest + 0.35 * hill - 0.6;
  }
  return out;
}
