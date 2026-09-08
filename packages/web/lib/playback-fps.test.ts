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
  resolveFirstPlayFpsQuality,
  shouldEscalateLowPlaybackFps,
  shouldPreferEqualTranscodeForSourceFps,
  formatLowFpsQualitySwitchNotice,
} from "./playback-fps.js";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const escalateArgs = {
  measuredFps: 0.5,
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
  it("does not prophylactically transcode high source fps", () => {
    expect(
      shouldPreferEqualTranscodeForSourceFps({
        fps: 59.94,
        nativeTv: true,
        transcodingEnabled: true,
        directPlayMode: true,
      }),
    ).toBe(false);
    expect(
      shouldPreferEqualTranscodeForSourceFps({
        fps: 24,
        nativeTv: true,
        transcodingEnabled: true,
        directPlayMode: true,
      }),
    ).toBe(false);
  });

  it("measures realtime ratio from position samples", () => {
    let state = { samples: [] as Array<{ atMs: number; positionSeconds: number }> };
    state = recordPlaybackFpsSample(state, 0, 0);
    state = recordPlaybackFpsSample(state, 2000, 1);
    state = recordPlaybackFpsSample(state, 4000, 2);
    state = recordPlaybackFpsSample(state, 6000, 3);

    expect(measurePlaybackFps(state, 6000)).toBeCloseTo(0.5, 2);
    expect(playbackFpsSampleSpanMs(state, 6000)).toBe(6000);
  });

  it("does not escalate healthy realtime playback (~1.0)", () => {
    expect(
      shouldEscalateLowPlaybackFps({
        ...escalateArgs,
        measuredFps: 1.0,
        elapsedMs: LOW_PLAYBACK_FPS_MIN_ELAPSED_MS,
      }),
    ).toBe(false);
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

  it("escalates original direct play when realtime ratio stays low for 5 seconds", () => {
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
        measuredFps: 0.5,
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
      "Playback is falling behind. Switching to 1080p for smoother playback.",
    );
  });

  it("never picks a first-play transcode for high source fps", () => {
    const highFpsArgs = {
      fps: 59.94,
      nativeTv: true,
      transcodingEnabled: true,
      directPlayMode: true,
      availableQualities: ["original", "480p", "720p", "1080p"] as Array<
        "original" | "480p" | "720p" | "1080p"
      >,
      sourceHeight: 1080,
      sourceWidth: 1920,
    };
    expect(
      resolveFirstPlayFpsQuality({
        ...highFpsArgs,
        allowFpsQualityAuto: true,
      }),
    ).toBeNull();
    expect(
      resolveFirstPlayFpsQuality({
        ...highFpsArgs,
        allowFpsQualityAuto: false,
      }),
    ).toBeNull();
  });

  it("watch view waits for the sample span before switching to transcode", () => {
    const watchView = readFileSync(
      path.join(webRoot, "components/tv/views/watch-view.tsx"),
      "utf8",
    );
    expect(watchView).toContain("playbackFpsSampleSpanMs");
    expect(watchView).toContain("elapsedMs");
    expect(watchView).toContain("shouldEscalateLowPlaybackFps");
    expect(watchView).toContain("resolveWatchSessionQuality");
    expect(watchView).toContain("fpsQualityLockedRef");
    expect(watchView).toContain("Session-only");
  });

  it("desktop watch client applies the same session-only stutter fallback", () => {
    const desktopWatch = readFileSync(
      path.join(webRoot, "app/watch/client.tsx"),
      "utf8",
    );
    expect(desktopWatch).toContain("resolveWatchSessionQuality");
    expect(desktopWatch).toContain("shouldEscalateLowPlaybackFps");
    expect(desktopWatch).toContain("fpsQualityLockedRef");
    expect(desktopWatch).toContain("Session-only");
  });
});
