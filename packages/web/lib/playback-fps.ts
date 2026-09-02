import type { StreamQuality } from "@/lib/api";
import {
  HIGH_SOURCE_FPS_THRESHOLD,
  isHighSourceFrameRate,
  LOW_PLAYBACK_FPS_THRESHOLD,
  pickTranscodeQualityForPlayback,
  qualityLabel,
} from "@media-app/shared";

export type PlaybackHlsQuality = StreamQuality | "remux";

export const LOW_PLAYBACK_FPS_SAMPLE_WINDOW_MS = 8_000;
export const LOW_PLAYBACK_FPS_MIN_SAMPLES = 4;
/** Original must play this long before we may switch to a transcode. */
export const LOW_PLAYBACK_FPS_MIN_ELAPSED_MS = 5_000;

export interface PlaybackFpsSampleState {
  samples: Array<{ atMs: number; positionSeconds: number }>;
}

export function recordPlaybackFpsSample(
  state: PlaybackFpsSampleState,
  nowMs: number,
  positionSeconds: number,
  windowMs = LOW_PLAYBACK_FPS_SAMPLE_WINDOW_MS,
): PlaybackFpsSampleState {
  const samples = state.samples
    .filter((sample) => nowMs - sample.atMs <= windowMs)
    .concat({ atMs: nowMs, positionSeconds });
  return { samples };
}

export function playbackFpsSampleSpanMs(
  state: PlaybackFpsSampleState,
  nowMs: number,
  windowMs = LOW_PLAYBACK_FPS_SAMPLE_WINDOW_MS,
): number {
  const samples = state.samples.filter((sample) => nowMs - sample.atMs <= windowMs);
  if (samples.length < 2) return 0;
  return samples[samples.length - 1].atMs - samples[0].atMs;
}

export function measurePlaybackFps(
  state: PlaybackFpsSampleState,
  nowMs: number,
  windowMs = LOW_PLAYBACK_FPS_SAMPLE_WINDOW_MS,
): number | null {
  const samples = state.samples.filter((sample) => nowMs - sample.atMs <= windowMs);
  if (samples.length < 2) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMs = last.atMs - first.atMs;
  const advancedSeconds = last.positionSeconds - first.positionSeconds;
  if (elapsedMs < 1000 || advancedSeconds <= 0) return null;

  return (advancedSeconds / elapsedMs) * 1000;
}

export function shouldPreferEqualTranscodeForSourceFps(options: {
  fps?: number | null;
  nativeTv?: boolean;
  transcodingEnabled: boolean;
  directPlayMode: boolean;
}): boolean {
  return (
    options.transcodingEnabled &&
    options.directPlayMode &&
    isHighSourceFrameRate(options.fps)
  );
}

export function shouldEscalateLowPlaybackFps(options: {
  measuredFps: number | null;
  sampleCount: number;
  quality: StreamQuality;
  usingHls: boolean;
  hlsQuality?: PlaybackHlsQuality;
  transcodingEnabled: boolean;
  alreadyEscalated: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  playbackHasBegun: boolean;
  msSinceUserSeek?: number | null;
  seekSuppressMs?: number;
  threshold?: number;
  minSamples?: number;
  elapsedMs?: number;
  minElapsedMs?: number;
}): boolean {
  if (options.alreadyEscalated) return false;
  if (!options.transcodingEnabled) return false;
  if (!options.playbackHasBegun) return false;
  if (!options.isPlaying || options.isBuffering) return false;
  if (options.quality !== "original") return false;
  if (options.usingHls && options.hlsQuality !== "remux") return false;

  const seekSuppressMs = options.seekSuppressMs ?? 12_000;
  if (
    options.msSinceUserSeek != null &&
    options.msSinceUserSeek >= 0 &&
    options.msSinceUserSeek < seekSuppressMs
  ) {
    return false;
  }

  if (options.sampleCount < (options.minSamples ?? LOW_PLAYBACK_FPS_MIN_SAMPLES)) {
    return false;
  }
  if (
    (options.elapsedMs ?? 0) <
    (options.minElapsedMs ?? LOW_PLAYBACK_FPS_MIN_ELAPSED_MS)
  ) {
    return false;
  }
  if (options.measuredFps == null) return false;

  return options.measuredFps < (options.threshold ?? LOW_PLAYBACK_FPS_THRESHOLD);
}

export function resolveEqualTranscodeQuality(
  availableQualities: StreamQuality[],
  sourceHeight?: number | null,
  sourceWidth?: number | null,
): StreamQuality | null {
  const tier = pickTranscodeQualityForPlayback(
    availableQualities,
    sourceHeight,
    sourceWidth,
  );
  return availableQualities.includes(tier) ? tier : null;
}

/** First play only: pick a source-matched transcode when high-fps direct play is risky. */
export function resolveFirstPlayFpsQuality(options: {
  allowFpsQualityAuto: boolean;
  fps?: number | null;
  nativeTv: boolean;
  transcodingEnabled: boolean;
  directPlayMode: boolean;
  availableQualities: StreamQuality[];
  sourceHeight?: number | null;
  sourceWidth?: number | null;
}): StreamQuality | null {
  if (!options.allowFpsQualityAuto) return null;
  if (
    !shouldPreferEqualTranscodeForSourceFps({
      fps: options.fps,
      nativeTv: options.nativeTv,
      transcodingEnabled: options.transcodingEnabled,
      directPlayMode: options.directPlayMode,
    })
  ) {
    return null;
  }
  return resolveEqualTranscodeQuality(
    options.availableQualities,
    options.sourceHeight,
    options.sourceWidth,
  );
}

export function formatLowFpsQualitySwitchNotice(
  quality: StreamQuality,
  sourceHeight?: number | null,
  sourceWidth?: number | null,
): string {
  return `Playback is choppy. Switching to ${qualityLabel(quality, sourceHeight, sourceWidth)} for smoother playback.`;
}

export { HIGH_SOURCE_FPS_THRESHOLD, LOW_PLAYBACK_FPS_THRESHOLD };
