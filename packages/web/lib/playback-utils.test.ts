import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamInfo } from "./api.js";
import {
  getPlaybackRestartSeconds,
  getScrubberBufferedRanges,
  isSpuriousHlsEnded,
  resolveInitialStreamQuality,
  resolvePlaybackStartSeconds,
  resolvePlaybackStream,
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
});

describe("resolvePlaybackStream with native TV player", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("prefers direct play for MKV on native ExoPlayer", async () => {
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
