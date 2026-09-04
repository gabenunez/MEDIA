import { describe, expect, it } from "vitest";
import {
  IPHONE_OFFLINE_MAX_BYTES,
  ffmpegBitrateKbps,
  offlineRecordId,
  planOfflineEncode,
} from "./offline-quality.js";

describe("planOfflineEncode", () => {
  it("keeps a 2-hour HEVC movie under the iPhone 500 MB cap", () => {
    const plan = planOfflineEncode({
      durationMs: 2 * 3600 * 1000,
      sourceHeight: 1080,
      hevcAvailable: true,
    });
    expect(plan.maxBytes).toBe(IPHONE_OFFLINE_MAX_BYTES);
    expect(IPHONE_OFFLINE_MAX_BYTES).toBeLessThanOrEqual(500 * 1024 * 1024);
    expect(plan.estimatedBytes).toBeLessThanOrEqual(IPHONE_OFFLINE_MAX_BYTES);
    expect(plan.codec).toBe("hevc");
    expect(plan.height).toBeGreaterThanOrEqual(480);
    expect(plan.videoBitrate + plan.audioBitrate).toBeLessThanOrEqual(
      (IPHONE_OFFLINE_MAX_BYTES * 8) / (2 * 3600),
    );
  });

  it("drops a 3.5-hour H.264 encode to 360p so it still fits", () => {
    const plan = planOfflineEncode({
      durationMs: 3.5 * 3600 * 1000,
      sourceHeight: 1080,
      hevcAvailable: false,
    });
    expect(plan.codec).toBe("h264");
    expect(plan.height).toBe(360);
    expect(plan.estimatedBytes).toBeLessThanOrEqual(IPHONE_OFFLINE_MAX_BYTES);
  });

  it("uses 720p HEVC for a short episode when the budget allows", () => {
    const plan = planOfflineEncode({
      durationMs: 22 * 60 * 1000,
      sourceHeight: 1080,
      hevcAvailable: true,
    });
    expect(plan.height).toBe(720);
    expect(plan.estimatedBytes).toBeLessThan(IPHONE_OFFLINE_MAX_BYTES / 2);
  });

  it("never upscales above the source height", () => {
    const plan = planOfflineEncode({
      durationMs: 22 * 60 * 1000,
      sourceHeight: 480,
      hevcAvailable: true,
    });
    expect(plan.height).toBe(480);
  });

  it("falls back to H.264 when HEVC is unavailable", () => {
    const plan = planOfflineEncode({
      durationMs: 45 * 60 * 1000,
      sourceHeight: 720,
      hevcAvailable: false,
    });
    expect(plan.codec).toBe("h264");
    expect(plan.height).toBeGreaterThanOrEqual(480);
    expect(plan.estimatedBytes).toBeLessThanOrEqual(IPHONE_OFFLINE_MAX_BYTES);
  });
});

describe("offlineRecordId", () => {
  it("is stable per type and file", () => {
    expect(offlineRecordId("movie", 42)).toBe("movie-42");
    expect(offlineRecordId("episode", 9)).toBe("episode-9");
  });
});

describe("ffmpegBitrateKbps", () => {
  it("rounds bits-per-second to an ffmpeg k suffix", () => {
    expect(ffmpegBitrateKbps(64000)).toBe("64k");
    expect(ffmpegBitrateKbps(499_000)).toBe("499k");
  });
});
