import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamInfo } from "./api.js";
import {
  getPlaybackRestartSeconds,
  getContiguousBufferedAhead,
  getScrubberBufferedRanges,
  GROWING_EDGE_PLAYBACK_RATE,
  isSpuriousHlsEnded,
  nextStableAbsoluteSeconds,
  playlistM3u8HasEndList,
  REBUFFER_ESCALATION_WINDOW_MS,
  RECOVERY_FORGIVE_PROGRESS_SECONDS,
  recordMidPlaybackRebuffer,
  resolveGrowingEdgePlaybackRate,
  shouldFailThroughContinuousMidBuffer,
  resolveSeekStallWatchdogAction,
  NATIVE_SEEK_STALL_SUPPRESS_MS,
  resolveRecoveryBudget,
  resolveSpuriousRecovery,
  resolveStallWatchdogAction,
  type SpuriousRecoveryState,
  resolveInitialStreamQuality,
  resolvePlaybackStartSeconds,
  resolvePlaybackStream,
  nextEpisodePreviewPath,
  isAbsoluteTimeInBufferedRanges,
  resolveHlsSeekAction,
  registerStreamRestartTarget,
  consumeStreamRestartTarget,
  resolveSkipTargetAbsoluteSeconds,
} from "./playback-utils.js";

vi.mock("./android-bridge.js", () => ({
  nativeTvPlayerAvailable: () => false,
}));

vi.mock("./tv-mode-detect.js", () => ({
  isTvClient: () => false,
}));

function makeStreamInfo(overrides: Partial<StreamInfo> = {}): StreamInfo {
  return {
    id: 1,
    type: "movie",
    mimeType: "video/x-matroska",
    fileSize: 5_000_000_000,
    fileName: "movie.mkv",
    filePath: "/media/movie.mkv",
    isSymlink: false,
    height: 800,
    width: 1920,
    durationMs: 7_200_000,
    videoCodec: "hevc",
    audioCodec: "ac3",
    availableQualities: ["original", "480p", "720p", "1080p"],
    transcodingEnabled: true,
    directPlayAudioSupported: false,
    ...overrides,
  };
}

describe("resolveInitialStreamQuality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always starts at original when transcoding is enabled", () => {
    expect(resolveInitialStreamQuality(makeStreamInfo())).toEqual({
      quality: "original",
      error: null,
    });
  });

  it("keeps original but surfaces an error when transcoding is disabled", () => {
    const result = resolveInitialStreamQuality(
      makeStreamInfo({ transcodingEnabled: false }),
    );
    expect(result.quality).toBe("original");
    expect(result.error).toMatch(/transcoding/i);
  });

  it("does not auto-downgrade browser-incompatible codecs", () => {
    const result = resolveInitialStreamQuality(
      makeStreamInfo({
        videoCodec: "hevc",
        audioCodec: "ac3",
        transcodingEnabled: true,
      }),
    );
    expect(result).toEqual({ quality: "original", error: null });
  });
});

describe("resolvePlaybackStream", () => {
  it("uses HLS remux for browser-safe codecs in MKV containers", () => {
    expect(
      resolvePlaybackStream(
        "original",
        makeStreamInfo({
          fileName: "movie.mkv",
          mimeType: "video/x-matroska",
          videoCodec: "h264",
          audioCodec: "aac",
          transcodingEnabled: true,
        }),
      ),
    ).toEqual({
      usingHls: true,
      hlsQuality: "remux",
      audioCompatNotice: null,
    });
  });

  it("surfaces a container compatibility message when remuxing is disabled", () => {
    const result = resolvePlaybackStream(
      "original",
      makeStreamInfo({
        fileName: "movie.mkv",
        mimeType: "video/x-matroska",
        videoCodec: "h264",
        audioCodec: "aac",
        transcodingEnabled: false,
      }),
    );

    expect(result.usingHls).toBe(false);
    expect(result.audioCompatNotice).toMatch(/container/i);
  });

  it("uses full-resolution 2160p HLS when browser cannot remux HEVC original", () => {
    const result = resolvePlaybackStream(
      "original",
      makeStreamInfo({
        fileName: "Ready Player One (2018) 2160p.mkv",
        mimeType: "video/x-matroska",
        videoCodec: "hevc",
        audioCodec: "truehd",
        height: 1604,
        width: 3840,
        availableQualities: ["original", "480p", "720p", "1080p", "2160p"],
        transcodingEnabled: true,
        dynamicRange: {
          dolbyVision: false,
          dolbyVisionProfile: null,
          hdr10: true,
          hlg: false,
        },
      }),
    );

    // No HEVC in jsdom → remux rejected → source-matched 2160p transcode.
    expect(result).toEqual({
      usingHls: true,
      hlsQuality: "2160p",
      audioCompatNotice: null,
    });
  });
});

describe("resolvePlaybackStream with browser HEVC", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("./android-bridge.js", () => ({
      nativeTvPlayerAvailable: () => false,
    }));
    vi.doMock("./tv-mode-detect.js", () => ({
      isTvClient: () => false,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("remuxes HEVC original (full quality) when the browser can decode HEVC", async () => {
    const canPlayType = vi.fn((type: string) =>
      type.includes("hvc1") || type.includes("hev1") ? "probably" : "",
    );
    vi.stubGlobal("document", {
      createElement: () => ({ canPlayType }),
    });

    const { resolvePlaybackStream: resolveWithHevc } = await import(
      "./playback-utils.js"
    );
    const result = resolveWithHevc(
      "original",
      makeStreamInfo({
        fileName: "Ready Player One (2018) 2160p.mkv",
        mimeType: "video/x-matroska",
        videoCodec: "hevc",
        audioCodec: "truehd",
        height: 1604,
        width: 3840,
        availableQualities: ["original", "480p", "720p", "1080p", "2160p"],
        transcodingEnabled: true,
        dynamicRange: {
          dolbyVision: false,
          dolbyVisionProfile: null,
          hdr10: true,
          hlg: false,
        },
      }),
    );

    expect(result).toEqual({
      usingHls: true,
      hlsQuality: "remux",
      audioCompatNotice: null,
    });
  });
});

describe("resolvePlaybackStream with native TV player", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("prefers direct play for SD/HD MKV on native ExoPlayer", async () => {
    vi.doMock("./android-bridge.js", () => ({
      nativeTvPlayerAvailable: () => true,
    }));
    const { resolvePlaybackStream: resolveNative } = await import("./playback-utils.js");
    // Do not default these to HLS remux — that caused mid-play underruns on TV.
    expect(
      resolveNative(
        "original",
        makeStreamInfo({
          fileName: "The Ant Bully (2006) 720p.mkv",
          mimeType: "video/x-matroska",
          videoCodec: "h264",
          audioCodec: "ac3",
          height: 720,
          width: 1280,
          transcodingEnabled: true,
        }),
      ),
    ).toEqual({
      usingHls: false,
      audioCompatNotice: null,
    });
  });

  it("routes high frame-rate originals to a source-matched transcode on native TV", async () => {
    vi.doMock("./android-bridge.js", () => ({
      nativeTvPlayerAvailable: () => true,
    }));
    const { resolvePlaybackStream: resolveNative } = await import("./playback-utils.js");
    expect(
      resolveNative(
        "original",
        makeStreamInfo({
          fileName: "sports.mkv",
          mimeType: "video/x-matroska",
          videoCodec: "h264",
          audioCodec: "ac3",
          height: 1080,
          width: 1920,
          fps: 59.94,
          transcodingEnabled: true,
        }),
      ),
    ).toEqual({
      usingHls: true,
      hlsQuality: "1080p",
      audioCompatNotice: null,
    });
  });

  it("remuxes SD/HD MKV on native ExoPlayer only when forceRemux is set", async () => {
    vi.doMock("./android-bridge.js", () => ({
      nativeTvPlayerAvailable: () => true,
    }));
    const { resolvePlaybackStream: resolveNative } = await import("./playback-utils.js");
    expect(
      resolveNative(
        "original",
        makeStreamInfo({
          fileName: "The Ant Bully (2006) 720p.mkv",
          mimeType: "video/x-matroska",
          videoCodec: "h264",
          audioCodec: "ac3",
          height: 720,
          width: 1280,
          transcodingEnabled: true,
        }),
        { forceRemux: true },
      ),
    ).toEqual({
      usingHls: true,
      hlsQuality: "remux",
      audioCompatNotice: null,
    });
  });

  it("keeps 4K MKV on direct play for native ExoPlayer", async () => {
    vi.doMock("./android-bridge.js", () => ({
      nativeTvPlayerAvailable: () => true,
    }));
    const { resolvePlaybackStream: resolveNative } = await import("./playback-utils.js");
    expect(
      resolveNative(
        "original",
        makeStreamInfo({
          fileName: "movie.mkv",
          mimeType: "video/x-matroska",
          videoCodec: "hevc",
          audioCodec: "ac3",
          height: 2160,
          width: 3840,
          availableQualities: ["original", "480p", "720p", "1080p", "2160p"],
          transcodingEnabled: true,
        }),
      ),
    ).toEqual({
      usingHls: false,
      audioCompatNotice: null,
    });
  });

  it("keeps Dolby Vision MKV on direct play even when SD/HD", async () => {
    vi.doMock("./android-bridge.js", () => ({
      nativeTvPlayerAvailable: () => true,
    }));
    const { resolvePlaybackStream: resolveNative } = await import("./playback-utils.js");
    expect(
      resolveNative(
        "original",
        makeStreamInfo({
          fileName: "movie.mkv",
          mimeType: "video/x-matroska",
          videoCodec: "hevc",
          audioCodec: "eac3",
          height: 1080,
          width: 1920,
          dynamicRange: {
            dolbyVision: true,
            dolbyVisionProfile: 5,
            hdr10: false,
            hlg: false,
          },
          transcodingEnabled: true,
        }),
      ),
    ).toEqual({
      usingHls: false,
      audioCompatNotice: null,
    });
  });
});

describe("isSpuriousHlsEnded", () => {
  it("detects premature ended events during ongoing transcodes", () => {
    expect(
      isSpuriousHlsEnded({
        usingHls: true,
        relativeSeconds: 24,
        hlsStartOffset: 1200,
        sourceDurationSeconds: 7200,
      }),
    ).toBe(true);
  });

  it("allows ended near the real file end", () => {
    expect(
      isSpuriousHlsEnded({
        usingHls: true,
        relativeSeconds: 5998,
        hlsStartOffset: 1200,
        sourceDurationSeconds: 7200,
      }),
    ).toBe(false);
  });

  it("uses playlist duration when source duration is missing", () => {
    expect(
      isSpuriousHlsEnded({
        usingHls: true,
        relativeSeconds: 24,
        hlsStartOffset: 0,
        sourceDurationSeconds: 0,
        playlistRelativeSeconds: 30,
      }),
    ).toBe(true);
  });
});

describe("getScrubberBufferedRanges", () => {
  it("returns one contiguous bar from the playhead and hides disconnected islands", () => {
    expect(
      getScrubberBufferedRanges(
        [
          { start: 0, end: 24 },
          { start: 48, end: 54 },
          { start: 72, end: 78 },
        ],
        20,
      ),
    ).toEqual([{ start: 20, end: 24 }]);
  });

  it("merges small gaps ahead of the playhead", () => {
    expect(
      getScrubberBufferedRanges(
        [
          { start: 0, end: 30 },
          { start: 33, end: 60 },
        ],
        25,
      ),
    ).toEqual([{ start: 25, end: 60 }]);
  });

  it("reports a growing buffer consistently while the playhead is fixed (paused)", () => {
    // Simulates polling video.buffered while paused at 20s as hls.js keeps
    // appending ahead — the reported bar end must track the growing buffer.
    const playhead = 20;
    const ends = [24, 30, 42, 60];
    const reported = ends.map(
      (end) => getScrubberBufferedRanges([{ start: 0, end }], playhead)[0].end,
    );
    expect(reported).toEqual([24, 30, 42, 60]);
    // Monotonically non-decreasing — never regresses.
    for (let i = 1; i < reported.length; i++) {
      expect(reported[i]).toBeGreaterThanOrEqual(reported[i - 1]);
    }
  });

  it("returns an empty bar when nothing is buffered ahead", () => {
    expect(getScrubberBufferedRanges([], 20)).toEqual([]);
    expect(getScrubberBufferedRanges([{ start: 0, end: 20 }], 20)).toEqual([]);
  });
});

describe("resolvePlaybackStartSeconds", () => {
  it("uses saved resume on the first open", () => {
    expect(
      resolvePlaybackStartSeconds({
        streamStartSeconds: null,
        initialResumeSeconds: 1200,
        streamGeneration: 0,
        usingHls: true,
        hlsStartOffset: 0,
        relativeSeconds: 0,
        stableAbsoluteSeconds: 0,
      }),
    ).toBe(1200);
  });

  it("uses the live playhead on stream restarts instead of stale resume", () => {
    expect(
      resolvePlaybackStartSeconds({
        streamStartSeconds: null,
        initialResumeSeconds: 1200,
        streamGeneration: 2,
        usingHls: true,
        hlsStartOffset: 1200,
        relativeSeconds: 180,
        stableAbsoluteSeconds: 1380,
      }),
    ).toBe(1380);
  });

  it("prefers an explicit restart position when provided", () => {
    expect(
      resolvePlaybackStartSeconds({
        streamStartSeconds: 420,
        initialResumeSeconds: 1200,
        streamGeneration: 3,
        usingHls: true,
        hlsStartOffset: 1200,
        relativeSeconds: 180,
        stableAbsoluteSeconds: 1380,
      }),
    ).toBe(420);
  });

  it("uses an explicit restart position on the first quality change", () => {
    expect(
      resolvePlaybackStartSeconds({
        streamStartSeconds: 2100,
        initialResumeSeconds: 1200,
        streamGeneration: 0,
        usingHls: true,
        hlsStartOffset: 0,
        relativeSeconds: 2100,
        stableAbsoluteSeconds: 2100,
      }),
    ).toBe(2100);
  });
});

describe("getPlaybackRestartSeconds", () => {
  it("rejects buffer-edge jumps ahead of the stable playhead", () => {
    expect(
      getPlaybackRestartSeconds({
        usingHls: true,
        hlsStartOffset: 1200,
        relativeSeconds: 420,
        stableAbsoluteSeconds: 1260,
      }),
    ).toBe(1260);
  });

  it("follows the live clock when it is behind the stable playhead", () => {
    expect(
      getPlaybackRestartSeconds({
        usingHls: true,
        hlsStartOffset: 1200,
        relativeSeconds: 60,
        stableAbsoluteSeconds: 1400,
      }),
    ).toBe(1260);
  });
});

describe("isAbsoluteTimeInBufferedRanges", () => {
  const fullBuffer = [{ start: 1200, end: 1350 }];

  it("accepts positions inside the full buffered window", () => {
    expect(isAbsoluteTimeInBufferedRanges(1250, fullBuffer)).toBe(true);
  });

  it("accepts backward seeks behind the scrubber-forward playhead", () => {
    // Scrubber UI may only show 1300–1350 ahead of the playhead, but the
    // player still holds 1200–1350 — backward skip must use that full range.
    expect(isAbsoluteTimeInBufferedRanges(1210, fullBuffer)).toBe(true);
  });

  it("rejects positions outside buffered media", () => {
    expect(isAbsoluteTimeInBufferedRanges(1400, fullBuffer)).toBe(false);
  });
});

describe("resolveHlsSeekAction", () => {
  const fullBuffer = [{ start: 1200, end: 1350 }];

  it("seeks relatively inside the native buffered window", () => {
    expect(
      resolveHlsSeekAction({
        targetAbsoluteSeconds: 1210,
        hlsStartOffset: 1200,
        bufferedRangesAbsolute: fullBuffer,
        useBufferedRanges: true,
      }),
    ).toEqual({ kind: "relative", relativeSeconds: 10 });
  });

  it("restarts when the native target is outside buffered media", () => {
    expect(
      resolveHlsSeekAction({
        targetAbsoluteSeconds: 1500,
        hlsStartOffset: 1200,
        bufferedRangesAbsolute: fullBuffer,
        useBufferedRanges: true,
      }),
    ).toEqual({ kind: "restart", absoluteSeconds: 1500 });
  });

  it("seeks in-session when native buffer telemetry is not ready yet", () => {
    expect(
      resolveHlsSeekAction({
        targetAbsoluteSeconds: 1250,
        hlsStartOffset: 1200,
        bufferedRangesAbsolute: [],
        useBufferedRanges: true,
      }),
    ).toEqual({ kind: "relative", relativeSeconds: 50 });
  });

  it("restarts when seeking before the current HLS session offset", () => {
    expect(
      resolveHlsSeekAction({
        targetAbsoluteSeconds: 1100,
        hlsStartOffset: 1200,
        bufferedRangesAbsolute: fullBuffer,
        useBufferedRanges: true,
      }),
    ).toEqual({ kind: "restart", absoluteSeconds: 1100 });
  });

  it("uses MSE seekable length on web HLS", () => {
    expect(
      resolveHlsSeekAction({
        targetAbsoluteSeconds: 1220,
        hlsStartOffset: 1200,
        seekableEndRelative: 30,
        videoReadyState: 2,
      }),
    ).toEqual({ kind: "relative", relativeSeconds: 20 });
  });

  it("restarts web HLS when the target is past seekable data", () => {
    expect(
      resolveHlsSeekAction({
        targetAbsoluteSeconds: 1300,
        hlsStartOffset: 1200,
        seekableEndRelative: 30,
        videoReadyState: 2,
      }),
    ).toEqual({ kind: "restart", absoluteSeconds: 1300 });
  });
});

describe("resolveSkipTargetAbsoluteSeconds", () => {
  it("uses the live native playhead from refs, not stale React state", () => {
    expect(
      resolveSkipTargetAbsoluteSeconds({
        optimisticAbsoluteSeconds: null,
        usingHls: true,
        hlsStartOffset: 1200,
        liveRelativeSeconds: 180,
        deltaSeconds: 30,
      }),
    ).toBe(1410);
  });

  it("chains rapid skips from the optimistic target", () => {
    expect(
      resolveSkipTargetAbsoluteSeconds({
        optimisticAbsoluteSeconds: 1410,
        usingHls: true,
        hlsStartOffset: 1200,
        liveRelativeSeconds: 90,
        deltaSeconds: 30,
      }),
    ).toBe(1440);
  });
});

describe("stream restart targets by generation", () => {
  it("keeps one restart target per stream generation", () => {
    const targets = new Map<number, number>();
    registerStreamRestartTarget(targets, 2, 500);
    registerStreamRestartTarget(targets, 3, 600);

    expect(consumeStreamRestartTarget(targets, 2)).toBe(500);
    expect(consumeStreamRestartTarget(targets, 3)).toBe(600);
    expect(consumeStreamRestartTarget(targets, 3)).toBeNull();
  });

  it("does not let an older generation consume a newer seek target", () => {
    const targets = new Map<number, number>();
    registerStreamRestartTarget(targets, 4, 900);

    expect(consumeStreamRestartTarget(targets, 3)).toBeNull();
    expect(consumeStreamRestartTarget(targets, 4)).toBe(900);
  });
});

describe("nextStableAbsoluteSeconds", () => {
  it("tracks normal small forward progress exactly", () => {
    expect(nextStableAbsoluteSeconds(100, 100.25)).toBe(100.25);
  });

  it("tolerates a small backward correction", () => {
    expect(nextStableAbsoluteSeconds(100, 99.2)).toBe(99.2);
  });

  it("ignores a small backward blip below the tolerance", () => {
    expect(nextStableAbsoluteSeconds(100, 98)).toBe(100);
  });

  it("clamps a sudden large forward spike instead of adopting it outright", () => {
    // A one-tick jump of +20s looks like an HLS buffer-hole nudge or a
    // segment renumbering artifact, not real playback progress.
    expect(nextStableAbsoluteSeconds(100, 120)).toBe(103);
  });

  it("catches up to a sustained real jump within a few samples", () => {
    let stable = 100;
    for (let i = 0; i < 7; i++) {
      stable = nextStableAbsoluteSeconds(stable, 120);
    }
    expect(stable).toBe(120);
  });
});

describe("playlistM3u8HasEndList", () => {
  it("detects ENDLIST in a media playlist", () => {
    expect(
      playlistM3u8HasEndList(
        "#EXTM3U\n#EXTINF:6.0,\nsegment_000.ts\n#EXT-X-ENDLIST\n",
      ),
    ).toBe(true);
  });

  it("returns false for a growing playlist without ENDLIST", () => {
    expect(
      playlistM3u8HasEndList("#EXTM3U\n#EXTINF:6.0,\nsegment_000.ts\n"),
    ).toBe(false);
  });
});

describe("getContiguousBufferedAhead", () => {
  it("ignores disconnected prefetch islands ahead of the playhead", () => {
    const video = {
      currentTime: 20,
      buffered: {
        length: 2,
        start: (i: number) => (i === 0 ? 0 : 48),
        end: (i: number) => (i === 0 ? 24 : 54),
      },
    } as HTMLVideoElement;

    expect(getContiguousBufferedAhead(video)).toBeCloseTo(4, 1);
  });
});

describe("playhead stability (no auto skip/rewind)", () => {
  it("getPlaybackRestartSeconds never jumps ahead of stable by more than 3s", () => {
    expect(
      getPlaybackRestartSeconds({
        usingHls: true,
        hlsStartOffset: 100,
        relativeSeconds: 50, // would be absolute 150
        stableAbsoluteSeconds: 120,
      }),
    ).toBe(120);
  });

  it("getPlaybackRestartSeconds follows a normal live playhead", () => {
    expect(
      getPlaybackRestartSeconds({
        usingHls: true,
        hlsStartOffset: 100,
        relativeSeconds: 22,
        stableAbsoluteSeconds: 120,
      }),
    ).toBe(122);
  });
});

describe("recordMidPlaybackRebuffer", () => {
  it("escalates after a cluster of mid-play rebuffers", () => {
    let timestamps: number[] = [];
    const t0 = 1_000_000;

    for (let i = 0; i < 2; i++) {
      const result = recordMidPlaybackRebuffer(timestamps, t0 + i * 10_000);
      timestamps = result.timestampsMs;
      expect(result.shouldEscalate).toBe(false);
    }

    const third = recordMidPlaybackRebuffer(timestamps, t0 + 20_000);
    expect(third.shouldEscalate).toBe(true);
    expect(third.timestampsMs).toHaveLength(3);
  });

  it("forgets rebuffers outside the escalation window", () => {
    const first = recordMidPlaybackRebuffer([], 0);
    const second = recordMidPlaybackRebuffer(first.timestampsMs, 10_000);
    const later = recordMidPlaybackRebuffer(
      second.timestampsMs,
      REBUFFER_ESCALATION_WINDOW_MS + 11_000,
    );
    expect(later.shouldEscalate).toBe(false);
    expect(later.timestampsMs).toEqual([REBUFFER_ESCALATION_WINDOW_MS + 11_000]);
  });
});

describe("shouldFailThroughContinuousMidBuffer", () => {
  it("escalates only after continuous mid-buffering past the timeout", () => {
    expect(
      shouldFailThroughContinuousMidBuffer({
        bufferingMidPlayback: true,
        bufferingStartedAtMs: 1000,
        nowMs: 10_000,
        timeoutMs: 20_000,
      }),
    ).toBe(false);
    expect(
      shouldFailThroughContinuousMidBuffer({
        bufferingMidPlayback: true,
        bufferingStartedAtMs: 1000,
        nowMs: 22_000,
        timeoutMs: 20_000,
      }),
    ).toBe(true);
  });

  it("does not escalate when buffering has cleared", () => {
    expect(
      shouldFailThroughContinuousMidBuffer({
        bufferingMidPlayback: false,
        bufferingStartedAtMs: 1000,
        nowMs: 50_000,
      }),
    ).toBe(false);
  });

  it("does not escalate while a recent user seek is still refilling", () => {
    expect(
      shouldFailThroughContinuousMidBuffer({
        bufferingMidPlayback: true,
        bufferingStartedAtMs: 1000,
        lastUserSeekAtMs: 15_000,
        nowMs: 25_000,
        timeoutMs: 20_000,
      }),
    ).toBe(false);
  });
});

describe("resolveSeekStallWatchdogAction", () => {
  it("suppresses soft recovery while a recent scrub/skip is refilling", () => {
    // Regression: post-seek lag on Android TV — soft seek+prepare at ~8s was
    // canceling the new progressive Range / HLS segment fetch after skip.
    expect(
      resolveSeekStallWatchdogAction({
        msSinceUserSeek: 5_000,
        msSinceProgress: 5_000,
        hasReachedReady: true,
      }),
    ).toBe("suppress");

    expect(
      resolveSeekStallWatchdogAction({
        msSinceUserSeek: NATIVE_SEEK_STALL_SUPPRESS_MS - 1,
        msSinceProgress: 15_000,
        hasReachedReady: true,
      }),
    ).toBe("suppress");
  });

  it("allows soft recovery only after the seek suppress window", () => {
    expect(
      resolveSeekStallWatchdogAction({
        msSinceUserSeek: NATIVE_SEEK_STALL_SUPPRESS_MS,
        msSinceProgress: 9_000,
        hasReachedReady: true,
      }),
    ).toBe("allow-soft-recovery");
  });

  it("allows fail-through for a true mid-play hang with no recent seek", () => {
    expect(
      resolveSeekStallWatchdogAction({
        msSinceUserSeek: null,
        msSinceProgress: 16_000,
        hasReachedReady: true,
      }),
    ).toBe("allow-fail-through");
  });

  it("does not soft-recover during cold start before first READY", () => {
    expect(
      resolveSeekStallWatchdogAction({
        msSinceUserSeek: null,
        msSinceProgress: 9_000,
        hasReachedReady: false,
        failThroughMs: 35_000,
      }),
    ).toBe("suppress");
  });
});

describe("resolveGrowingEdgePlaybackRate", () => {
  it("slows near a growing encode edge and restores after refill", () => {
    expect(
      resolveGrowingEdgePlaybackRate({
        playlistHasEndList: false,
        bufferAheadSeconds: 2,
        currentRate: 1,
      }),
    ).toBe(GROWING_EDGE_PLAYBACK_RATE);

    expect(
      resolveGrowingEdgePlaybackRate({
        playlistHasEndList: false,
        bufferAheadSeconds: 25,
        currentRate: GROWING_EDGE_PLAYBACK_RATE,
      }),
    ).toBe(1);
  });

  it("keeps hysteresis between low and resume thresholds", () => {
    expect(
      resolveGrowingEdgePlaybackRate({
        playlistHasEndList: false,
        bufferAheadSeconds: 10,
        currentRate: GROWING_EDGE_PLAYBACK_RATE,
      }),
    ).toBe(GROWING_EDGE_PLAYBACK_RATE);
  });

  it("never slows a finished (ENDLIST) playlist", () => {
    expect(
      resolveGrowingEdgePlaybackRate({
        playlistHasEndList: true,
        bufferAheadSeconds: 0,
        currentRate: 1,
      }),
    ).toBe(1);
  });
});

describe("resolveStallWatchdogAction", () => {
  const base = {
    msSinceAdvance: 5000,
    bufferAheadSeconds: 0,
    stuckWithData: false,
    playlistHasEndList: false,
    consecutiveStallNudges: 0,
    waitGrowTicks: 0,
    didAttemptPipelineReset: false,
  };

  it("treats encode-edge rebuffer as wait-grow (no pipeline reset)", () => {
    expect(resolveStallWatchdogAction(base)).toEqual({
      action: "wait-grow",
      nextStallNudges: 0,
      nextWaitGrowTicks: 1,
    });
  });

  it("does not escalate wait-grow into pipeline-reset across many ticks", () => {
    let waitGrowTicks = 0;
    let consecutiveStallNudges = 0;
    for (let i = 0; i < 10; i++) {
      const decision = resolveStallWatchdogAction({
        ...base,
        waitGrowTicks,
        consecutiveStallNudges,
      });
      expect(decision.action).toBe("wait-grow");
      waitGrowTicks = decision.nextWaitGrowTicks;
      consecutiveStallNudges = decision.nextStallNudges;
    }
    expect(consecutiveStallNudges).toBe(0);
  });

  it("nudges when the decoder is stuck with buffered data", () => {
    expect(
      resolveStallWatchdogAction({
        ...base,
        bufferAheadSeconds: 8,
        stuckWithData: true,
      }),
    ).toEqual({
      action: "nudge",
      nextStallNudges: 1,
      nextWaitGrowTicks: 0,
    });
  });

  it("pipeline-resets after repeated stuck-with-data nudges", () => {
    expect(
      resolveStallWatchdogAction({
        ...base,
        bufferAheadSeconds: 8,
        stuckWithData: true,
        consecutiveStallNudges: 2,
      }),
    ).toEqual({
      action: "pipeline-reset",
      nextStallNudges: 3,
      nextWaitGrowTicks: 0,
    });
  });

  it("fatals only after prolonged wait-grow (dead encoder)", () => {
    expect(
      resolveStallWatchdogAction({
        ...base,
        waitGrowTicks: 29,
      }),
    ).toEqual({
      action: "fatal",
      nextStallNudges: 0,
      nextWaitGrowTicks: 0,
    });
  });

  it("returns none while playback is advancing", () => {
    expect(
      resolveStallWatchdogAction({
        ...base,
        msSinceAdvance: 500,
        bufferAheadSeconds: 0,
      }),
    ).toEqual({
      action: "none",
      nextStallNudges: 0,
      nextWaitGrowTicks: 0,
    });
  });
});

describe("resolveRecoveryBudget", () => {
  const base = {
    spentBudget: 0,
    maxBudget: 4,
    currentPositionSeconds: 0,
    positionAtLastRecoverySeconds: 0,
  };

  it("allows the first recovery and counts it", () => {
    expect(resolveRecoveryBudget(base)).toEqual({
      allowed: true,
      nextSpentBudget: 1,
    });
  });

  it("blocks recovery once the budget is exhausted without healthy playback", () => {
    expect(
      resolveRecoveryBudget({
        ...base,
        spentBudget: 4,
        currentPositionSeconds: 120,
        positionAtLastRecoverySeconds: 119,
      }),
    ).toEqual({ allowed: false, nextSpentBudget: 4 });
  });

  it("forgives the budget after sustained playback and re-allows recovery", () => {
    const progressed =
      100 + RECOVERY_FORGIVE_PROGRESS_SECONDS;
    expect(
      resolveRecoveryBudget({
        ...base,
        spentBudget: 4,
        currentPositionSeconds: progressed,
        positionAtLastRecoverySeconds: 100,
      }),
    ).toEqual({ allowed: true, nextSpentBudget: 1 });
  });

  it("does not forgive when progress is below the threshold", () => {
    expect(
      resolveRecoveryBudget({
        ...base,
        spentBudget: 3,
        currentPositionSeconds: 100 + RECOVERY_FORGIVE_PROGRESS_SECONDS - 1,
        positionAtLastRecoverySeconds: 100,
      }),
    ).toEqual({ allowed: true, nextSpentBudget: 4 });
  });

  it("treats a backward jump (seek/reset) as not healed", () => {
    expect(
      resolveRecoveryBudget({
        ...base,
        spentBudget: 4,
        currentPositionSeconds: 10,
        positionAtLastRecoverySeconds: 500,
      }),
    ).toEqual({ allowed: false, nextSpentBudget: 4 });
  });
});

describe("resolveSpuriousRecovery", () => {
  const fresh: SpuriousRecoveryState = {
    attempts: 0,
    lastEndedAtMs: 0,
    anchorSeconds: 0,
  };

  it("recovers in place on the first spurious ended", () => {
    const result = resolveSpuriousRecovery({
      state: fresh,
      nowMs: 1_000,
      relativeSeconds: 6,
    });
    expect(result.action).toBe("recover");
    expect(result.next.attempts).toBe(1);
    expect(result.next.anchorSeconds).toBe(6);
  });

  it("coalesces rapid repeats without spending the budget", () => {
    // Five rapid repeats (250ms apart) at the same wall stay at 1 attempt.
    let state: SpuriousRecoveryState = fresh;
    let now = 1_000;
    for (let i = 0; i < 5; i++) {
      const result = resolveSpuriousRecovery({
        state,
        nowMs: now,
        relativeSeconds: 6,
      });
      expect(result.action).toBe("recover");
      state = result.next;
      now += 250;
    }
    expect(state.attempts).toBe(1);
  });

  it("restarts only after repeated recoveries with no forward progress", () => {
    let state: SpuriousRecoveryState = fresh;
    let now = 1_000;
    let action = "recover";
    // Space attempts > coalesce window apart, no progress (same position).
    for (let i = 0; i < 10 && action === "recover"; i++) {
      const result = resolveSpuriousRecovery({
        state,
        nowMs: now,
        relativeSeconds: 6,
      });
      action = result.action;
      state = result.next;
      now += 6_000;
    }
    expect(action).toBe("restart");
  });

  it("resets the budget after sustained forward progress (rate limiter)", () => {
    let state: SpuriousRecoveryState = {
      attempts: 4,
      lastEndedAtMs: 1_000,
      anchorSeconds: 6,
    };
    // Next spurious ended happens 20s later at a much later position.
    const result = resolveSpuriousRecovery({
      state,
      nowMs: 30_000,
      relativeSeconds: 6 + RECOVERY_FORGIVE_PROGRESS_SECONDS + 100,
    });
    expect(result.action).toBe("recover");
    // Progress cleared the accumulated attempts before counting this one.
    expect(result.next.attempts).toBe(1);
  });
});

describe("nextEpisodePreviewPath", () => {
  const episode = {
    id: 12,
    episodeNumber: 4,
    title: "Dinner Party",
    stillPath: "/stills/dinner.jpg",
  };

  it("prefers the next episode still", () => {
    expect(
      nextEpisodePreviewPath(
        { episode, seasonNumber: 2 },
        { title: "The Office", posterPath: "/poster.jpg", backdropPath: "/back.jpg" },
      ),
    ).toBe("/stills/dinner.jpg");
  });

  it("falls back to series backdrop, then poster", () => {
    expect(
      nextEpisodePreviewPath(
        { episode: { ...episode, stillPath: null }, seasonNumber: 2 },
        { title: "The Office", posterPath: "/poster.jpg", backdropPath: "/back.jpg" },
      ),
    ).toBe("/back.jpg");
    expect(
      nextEpisodePreviewPath(
        { episode: { ...episode, stillPath: null }, seasonNumber: 2 },
        { title: "The Office", posterPath: "/poster.jpg" },
      ),
    ).toBe("/poster.jpg");
  });
});
