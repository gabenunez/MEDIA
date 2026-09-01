import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOW_PLAYBACK_FPS_MIN_ELAPSED_MS,
  measurePlaybackFps,
  playbackFpsSampleSpanMs,
  recordPlaybackFpsSample,
  resolveEqualTranscodeQuality,
  shouldEscalateLowPlaybackFps,
  shouldPreferEqualTranscodeForSourceFps,
  formatLowFpsQualitySwitchNotice,
} from "./playback-fps.js";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const escalateArgs = {
  measuredFps: 12,
  sampleCount: 4,
  quality: "original" as const,
  usingHls: false,
  transcodingEnabled: true,
  alreadyEscalated: false,
  isPlaying: true,
  isBuffering: false,
  playbackHasBegun: true,
};

describe("playback fps escalation", () => {
  it("prefers equal transcode for high source fps on native direct play", () => {
    expect(
      shouldPreferEqualTranscodeForSourceFps({
        fps: 59.94,
        nativeTv: true,
        transcodingEnabled: true,
        directPlayMode: true,
      }),
    ).toBe(true);
    expect(
      shouldPreferEqualTranscodeForSourceFps({
        fps: 24,
        nativeTv: true,
        transcodingEnabled: true,
        directPlayMode: true,
      }),
    ).toBe(false);
  });

  it("measures playback fps from position samples", () => {
    let state = { samples: [] as Array<{ atMs: number; positionSeconds: number }> };
    state = recordPlaybackFpsSample(state, 0, 0);
    state = recordPlaybackFpsSample(state, 2000, 1);
    state = recordPlaybackFpsSample(state, 4000, 2);
    state = recordPlaybackFpsSample(state, 6000, 3);

    expect(measurePlaybackFps(state, 6000)).toBeCloseTo(0.5, 2);
    expect(playbackFpsSampleSpanMs(state, 6000)).toBe(6000);
  });

  it("does not escalate original to transcode before 5 seconds of playback", () => {
    expect(
      shouldEscalateLowPlaybackFps({
        ...escalateArgs,
        elapsedMs: LOW_PLAYBACK_FPS_MIN_ELAPSED_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldEscalateLowPlaybackFps({
        ...escalateArgs,
      }),
    ).toBe(false);
  });

  it("escalates original direct play when measured fps stays low for 5 seconds", () => {
    expect(
      shouldEscalateLowPlaybackFps({
        ...escalateArgs,
        elapsedMs: LOW_PLAYBACK_FPS_MIN_ELAPSED_MS,
      }),
    ).toBe(true);
  });

  it("does not escalate when already on an explicit transcode tier", () => {
    expect(
      shouldEscalateLowPlaybackFps({
        measuredFps: 12,
        elapsedMs: LOW_PLAYBACK_FPS_MIN_ELAPSED_MS,
        sampleCount: 4,
        quality: "1080p",
        usingHls: true,
        hlsQuality: "1080p",
        transcodingEnabled: true,
        alreadyEscalated: false,
        isPlaying: true,
        isBuffering: false,
        playbackHasBegun: true,
      }),
    ).toBe(false);
  });

  it("picks a source-matched transcode tier", () => {
    expect(
      resolveEqualTranscodeQuality(
        ["original", "480p", "720p", "1080p"],
        1080,
        1920,
      ),
    ).toBe("1080p");
  });

  it("formats a user-facing low-fps quality switch notice", () => {
    expect(formatLowFpsQualitySwitchNotice("1080p", 1080, 1920)).toBe(
      "Playback is choppy. Switching to 1080p for smoother playback.",
    );
  });

  it("watch view waits for the sample span before switching to transcode", () => {
    const watchView = readFileSync(
      path.join(webRoot, "components/tv/views/watch-view.tsx"),
      "utf8",
    );
    expect(watchView).toContain("playbackFpsSampleSpanMs");
    expect(watchView).toContain("elapsedMs");
    expect(watchView).toContain("shouldEscalateLowPlaybackFps");
  });
});
