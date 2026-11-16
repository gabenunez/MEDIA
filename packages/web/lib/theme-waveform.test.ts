import { describe, expect, it } from "vitest";
import {
  WAVEFORM_WINDOW,
  findWaveformPeaks,
  syntheticTrace,
  traceFromTimeDomain,
} from "./theme-waveform";

/** Analyser-style bytes for a sine wave: 128 is silence, ±127 full scale. */
function sineBytes(length: number, period: number, phase = 0, level = 0.8): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.round(128 + 127 * level * Math.sin((2 * Math.PI * i) / period + phase));
  }
  return out;
}

describe("traceFromTimeDomain", () => {
  it("returns a flat line for silence", () => {
    const trace = traceFromTimeDomain(new Uint8Array(2048).fill(128), 64);
    expect(trace).toHaveLength(64);
    expect(Math.max(...trace.map(Math.abs))).toBe(0);
  });

  it("starts at a rising zero crossing so the trace holds still across frames", () => {
    const a = traceFromTimeDomain(sineBytes(2048, 170, 0), 100);
    const b = traceFromTimeDomain(sineBytes(2048, 170, 2.1), 100);
    expect(a[0]).toBeGreaterThanOrEqual(-0.05);
    expect(a[2]).toBeGreaterThan(a[0]);
    for (let i = 0; i < 100; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.08);
  });

  it("spans the drawn window and keeps the wave's amplitude", () => {
    // ~3 cycles across the 512-sample window, like the reference trace.
    const trace = traceFromTimeDomain(sineBytes(2048, WAVEFORM_WINDOW / 3), 120);
    expect(Math.max(...trace)).toBeGreaterThan(0.7);
    expect(Math.min(...trace)).toBeLessThan(-0.7);
    expect(findWaveformPeaks(trace, { minGap: 20 })).toHaveLength(3);
  });

  it("handles empty input and short buffers", () => {
    expect(traceFromTimeDomain(new Uint8Array(0), 10)).toHaveLength(10);
    expect(traceFromTimeDomain(sineBytes(64, 16), 0)).toHaveLength(0);
    expect(traceFromTimeDomain(sineBytes(64, 16), 32)).toHaveLength(32);
  });
});

describe("findWaveformPeaks", () => {
  it("keeps the tallest crest within each gap, left to right", () => {
    const values = [0, 0.3, 0, 0.9, 0, 0.4, 0, 0, 0, 0.6, 0];
    expect(findWaveformPeaks(values, { minGap: 3 })).toEqual([3, 9]);
  });

  it("ignores crests below the threshold and caps the count", () => {
    const values = [0, 0.1, 0, 0.5, 0, 0.6, 0, 0.7, 0];
    expect(findWaveformPeaks(values, { minGap: 1, minValue: 0.2 })).toEqual([3, 5, 7]);
    expect(findWaveformPeaks(values, { minGap: 1, maxCount: 2 })).toEqual([5, 7]);
  });
});

describe("syntheticTrace", () => {
  it("draws about three crests that drift over time", () => {
    const now = syntheticTrace(150, 0);
    const later = syntheticTrace(150, 500);
    expect(findWaveformPeaks(now, { minGap: 25, minValue: 0.3 })).toHaveLength(3);
    expect(Math.max(...now.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(now.some((v, i) => Math.abs(v - later[i]) > 0.05)).toBe(true);
  });
});
