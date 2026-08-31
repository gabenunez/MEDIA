import type { StreamQuality } from "@/lib/api";
import type { StreamInfo } from "@/lib/api";
import { nativeTvPlayerAvailable } from "@/lib/android-bridge";
import {
  containerPrefersHlsRemux,
  isBrowserDirectPlayAudioSupported,
  isBrowserDirectPlayVideoSupported,
  is4KSource,
  isHlsVideoCopySupported,
  normalizeCodecName,
  pickTranscodeQualityForPlayback,
  resolveNativeTvPlaybackMode,
  resolveOriginalPlaybackMode,
} from "@media-app/shared";
import { shouldPreferEqualTranscodeForSourceFps } from "@/lib/playback-fps";

export const PROGRESS_SAVE_MS = 10_000;

/**
 * Max forward jump accepted into the "stable" playback position per sample.
 * A bigger jump is more likely a transient position spike — an HLS
 * buffer-hole nudge, a native-player self-heal, a live-playlist segment
 * renumbering — than genuine playback progress; real seeks write the stable
 * ref directly and never go through this path. Excess is folded in
 * gradually so a spike can't get latched in as ground truth for the next
 * restart/recovery, but a sustained real jump still catches up within a
 * couple of samples instead of being rejected forever.
 */
const MAX_STABLE_FORWARD_JUMP_SECONDS = 3;

/** Fold a freshly observed absolute position into the tracked "stable" one. */
export function nextStableAbsoluteSeconds(
  currentStable: number,
  observedAbsolute: number,
): number {
  if (observedAbsolute < currentStable - 1) return currentStable;
  return Math.min(observedAbsolute, currentStable + MAX_STABLE_FORWARD_JUMP_SECONDS);
}

export function getPlaybackAbsoluteSeconds({
  usingHls,
  hlsStartOffset,
  relativeSeconds,
}: {
  usingHls: boolean;
  hlsStartOffset: number;
  relativeSeconds: number;
}): number {
  return Math.max(0, usingHls ? hlsStartOffset + relativeSeconds : relativeSeconds);
}

/** True when an absolute timeline position sits inside buffered media. */
export function isAbsoluteTimeInBufferedRanges(
  absoluteSeconds: number,
  ranges: Array<{ start: number; end: number }>,
  toleranceSeconds = 0.5,
): boolean {
  if (!ranges.length) return false;
  return ranges.some(
    (range) =>
      absoluteSeconds >= range.start - toleranceSeconds &&
      absoluteSeconds <= range.end + toleranceSeconds,
  );
}

export type HlsSeekAction =
  | { kind: "relative"; relativeSeconds: number }
  | { kind: "restart"; absoluteSeconds: number };

/**
 * Decide whether an absolute seek can stay in the current HLS session or must
 * restart with a new `start=` offset. Native players should pass full buffered
 * ranges; web players use MSE seekable length.
 */
export function resolveHlsSeekAction(options: {
  targetAbsoluteSeconds: number;
  hlsStartOffset: number;
  /** Full buffered ranges on the absolute timeline (not scrubber-forward only). */
  bufferedRangesAbsolute?: Array<{ start: number; end: number }>;
  seekableEndRelative?: number;
  videoReadyState?: number;
  useBufferedRanges?: boolean;
}): HlsSeekAction {
  const target = Math.max(0, options.targetAbsoluteSeconds);
  const offset = Math.max(0, options.hlsStartOffset);

  if (target < offset) {
    return { kind: "restart", absoluteSeconds: target };
  }

  const relativeTarget = target - offset;

  if (options.useBufferedRanges) {
    if (
      isAbsoluteTimeInBufferedRanges(
        target,
        options.bufferedRangesAbsolute ?? [],
      )
    ) {
      return { kind: "relative", relativeSeconds: relativeTarget };
    }
    return { kind: "restart", absoluteSeconds: target };
  }

  const seekableEnd = options.seekableEndRelative ?? 0;
  const readyState = options.videoReadyState ?? 0;
  if (relativeTarget <= seekableEnd + 0.25 && readyState >= 1) {
    return { kind: "relative", relativeSeconds: relativeTarget };
  }

  return { kind: "restart", absoluteSeconds: target };
}

/** Pin an absolute start for a specific stream-generation restart. */
export function registerStreamRestartTarget(
  targets: Map<number, number>,
  generation: number,
  absoluteSeconds: number,
): void {
  targets.set(generation, Math.max(0, absoluteSeconds));
}

/** Read and remove the restart target for one stream generation. */
export function consumeStreamRestartTarget(
  targets: Map<number, number>,
  generation: number,
): number | null {
  const value = targets.get(generation) ?? null;
  if (value !== null) {
    targets.delete(generation);
  }
  return value;
}

/**
 * Resolve a safe restart position. During rebuffer/recovery the player may
 * briefly report the buffer edge instead of the real playhead — only reject
 * jumps ahead of the last stable position, never snap back forward when the
 * live clock is behind (backward seek or player reset).
 */
export function getPlaybackRestartSeconds({
  usingHls,
  hlsStartOffset,
  relativeSeconds,
  stableAbsoluteSeconds,
}: {
  usingHls: boolean;
  hlsStartOffset: number;
  relativeSeconds: number;
  stableAbsoluteSeconds: number;
}): number {
  const live = getPlaybackAbsoluteSeconds({ usingHls, hlsStartOffset, relativeSeconds });
  if (stableAbsoluteSeconds <= 0) return live;
  if (live > stableAbsoluteSeconds + 3) {
    return stableAbsoluteSeconds;
  }
  return live;
}

/**
 * Pick where to start or restart playback on the absolute timeline.
 * The first open may use saved resume progress; later restarts must follow
 * the live playhead and never fall back to stale initialResumeSeconds.
 * An explicit streamStartSeconds is consumed once per restart (user seek).
 */
export function resolvePlaybackStartSeconds({
  streamStartSeconds,
  initialResumeSeconds,
  streamGeneration,
  usingHls,
  hlsStartOffset,
  relativeSeconds,
  stableAbsoluteSeconds,
}: {
  streamStartSeconds: number | null;
  initialResumeSeconds: number | null;
  streamGeneration: number;
  usingHls: boolean;
  hlsStartOffset: number;
  relativeSeconds: number;
  stableAbsoluteSeconds: number;
}): number {
  if (streamStartSeconds !== null) {
    return streamStartSeconds;
  }
  if (streamGeneration > 0) {
    return getPlaybackRestartSeconds({
      usingHls,
      hlsStartOffset,
      relativeSeconds,
      stableAbsoluteSeconds,
    });
  }
  return initialResumeSeconds ?? 0;
}

/**
 * Minimum seconds of *sustained* playback progress after a recovery before
 * that recovery is "forgiven" and the budget is credited back. A stream can
 * hit several transient network/media blips across a multi-hour session; a
 * monotonic counter would permanently disarm recovery after a handful of
 * them even though every one succeeded. Requiring real forward progress
 * before crediting the budget keeps a genuinely broken stream (blip → blip →
 * blip with no playback in between) from looping forever.
 */
export const RECOVERY_FORGIVE_PROGRESS_SECONDS = 30;

/**
 * Decide whether an HLS recovery attempt is allowed, given how much healthy
 * playback has elapsed since the last recovery. Returns the next recovery
 * state to store.
 *
 * `spentBudget` is the number of unforgiven recovery attempts. When the
 * playhead has advanced at least `RECOVERY_FORGIVE_PROGRESS_SECONDS` past the
 * position captured at the last recovery, the stream has demonstrably
 * healed, so the accumulated budget is credited back before this attempt is
 * counted.
 */
export function resolveRecoveryBudget({
  spentBudget,
  maxBudget,
  currentPositionSeconds,
  positionAtLastRecoverySeconds,
  forgiveAfterSeconds = RECOVERY_FORGIVE_PROGRESS_SECONDS,
}: {
  spentBudget: number;
  maxBudget: number;
  currentPositionSeconds: number;
  positionAtLastRecoverySeconds: number;
  forgiveAfterSeconds?: number;
}): { allowed: boolean; nextSpentBudget: number } {
  const progressedSinceLastRecovery =
    currentPositionSeconds - positionAtLastRecoverySeconds;
  const healed =
    Number.isFinite(progressedSinceLastRecovery) &&
    progressedSinceLastRecovery >= forgiveAfterSeconds;

  const effectiveSpent = healed ? 0 : spentBudget;

  if (effectiveSpent >= maxBudget) {
    return { allowed: false, nextSpentBudget: effectiveSpent };
  }

  return { allowed: true, nextSpentBudget: effectiveSpent + 1 };
}

export type PlaybackHlsQuality = StreamQuality | "remux";

import { isTvClient } from "@/lib/tv-mode-detect";

export { isTvClient };

function browserSupportsHevcPlayback(): boolean {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video");
  const codecs = [
    'video/mp4; codecs="hvc1.1.6.L120.90"',
    'video/mp4; codecs="hev1.1.6.L120.90"',
    'video/mp4; codecs="hvc1"',
  ];
  return codecs.some((codec) => video.canPlayType(codec) !== "");
}

function browserSupportsDirectPlayVideo(videoCodec?: string | null): boolean {
  if (!isBrowserDirectPlayVideoSupported(videoCodec)) return false;
  if (typeof document === "undefined") return true;

  const normalized = normalizeCodecName(videoCodec);
  if (normalized === "hevc" || normalized === "h265") {
    return browserSupportsHevcPlayback();
  }

  if (normalized === "h264" || normalized === "avc1") {
    const video = document.createElement("video");
    return video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== "";
  }

  return false;
}

function effectiveOriginalPlaybackMode(
  streamInfo: StreamInfo,
  options?: { forceRemux?: boolean },
): ReturnType<typeof resolveOriginalPlaybackMode> {
  const mode = resolveOriginalPlaybackMode({
    audioCodec: streamInfo.audioCodec,
    videoCodec: streamInfo.videoCodec,
    transcodingEnabled: streamInfo.transcodingEnabled,
    fileName: streamInfo.fileName,
  });

  // Native ExoPlayer decodes HEVC, AC3, DTS, etc. — direct play at source resolution.
  if (nativeTvPlayerAvailable()) {
    const nativeMode = resolveNativeTvPlaybackMode({
      audioCodec: streamInfo.audioCodec,
      videoCodec: streamInfo.videoCodec,
      transcodingEnabled: streamInfo.transcodingEnabled,
      dolbyVision: streamInfo.dynamicRange?.dolbyVision ?? false,
    });

    if (
      options?.forceRemux &&
      nativeMode === "direct" &&
      streamInfo.transcodingEnabled &&
      isHlsVideoCopySupported(streamInfo.videoCodec) &&
      // Never remux Dolby Vision — it strips the DV layer.
      !streamInfo.dynamicRange?.dolbyVision
    ) {
      return "remux";
    }

    // Prefer progressive direct play on native TV. Defaulting SD/HD MKV to HLS
    // remux (v0.1.182) fixed micro-stutter for some titles but caused reliable
    // mid-play buffer underruns once ExoPlayer burned through its ~2 min
    // forward buffer and the remux session fell behind or restarted. Remux
    // remains the stall/error fallback via forceRemux — not the default.
    return nativeMode;
  }

  if (mode === "direct" && !browserSupportsDirectPlayVideo(streamInfo.videoCodec)) {
    if (!streamInfo.transcodingEnabled) return "unsupported";
    if (isHlsVideoCopySupported(streamInfo.videoCodec)) return "remux";
    return "transcode";
  }

  if (mode !== "remux") return mode;

  const videoCodec = normalizeCodecName(streamInfo.videoCodec);
  if (
    (videoCodec === "hevc" || videoCodec === "h265") &&
    !browserSupportsHevcPlayback()
  ) {
    // Android TV hardware decodes HEVC in HLS remux even when canPlayType is empty.
    if (isTvClient()) {
      return "remux";
    }
    // Browser can't decode HEVC: re-encode at source resolution (e.g. 4K→2160p).
    return streamInfo.transcodingEnabled ? "transcode" : "unsupported";
  }

  // Keep remux for original (video copy + AAC). TrueHD/DTS/etc. can't direct-play
  // in browsers, but remux preserves full HEVC/HDR video quality and resolution.
  return mode;
}

export function resolvePlaybackStream(
  quality: StreamQuality,
  streamInfo: StreamInfo | null,
  options?: { forceRemux?: boolean },
): {
  usingHls: boolean;
  hlsQuality?: PlaybackHlsQuality;
  audioCompatNotice: string | null;
} {
  if (quality !== "original") {
    // "4K" transcode tier on a 4K source re-encodes for no benefit and often fails on TV.
    // Use source direct/remux instead when native ExoPlayer is available.
    if (
      quality === "2160p" &&
      nativeTvPlayerAvailable() &&
      streamInfo &&
      is4KSource(streamInfo.height, streamInfo.width)
    ) {
      const mode = effectiveOriginalPlaybackMode(streamInfo, options);
      if (mode === "direct") {
        return { usingHls: false, audioCompatNotice: null };
      }
      if (mode === "remux") {
        return {
          usingHls: true,
          hlsQuality: "remux",
          audioCompatNotice: null,
        };
      }
    }

    return { usingHls: true, hlsQuality: quality, audioCompatNotice: null };
  }

  const mode = streamInfo
    ? effectiveOriginalPlaybackMode(streamInfo, options)
    : "direct";

  if (
    streamInfo &&
    shouldPreferEqualTranscodeForSourceFps({
      fps: streamInfo.fps,
      nativeTv: nativeTvPlayerAvailable(),
      transcodingEnabled: streamInfo.transcodingEnabled,
      directPlayMode: mode === "direct",
    })
  ) {
    return {
      usingHls: true,
      hlsQuality: pickTranscodeQualityForPlayback(
        streamInfo.availableQualities,
        streamInfo.height,
        streamInfo.width,
      ),
      audioCompatNotice: null,
    };
  }

  if (mode === "direct" || !streamInfo) {
    return { usingHls: false, audioCompatNotice: null };
  }

  const codec = streamInfo.audioCodec?.toUpperCase() ?? "this format";
  const videoCodec = streamInfo.videoCodec?.toUpperCase() ?? "this format";
  const videoSupported = isBrowserDirectPlayVideoSupported(streamInfo.videoCodec);
  const audioSupported = isBrowserDirectPlayAudioSupported(streamInfo.audioCodec);
  const containerNeedsRemux =
    containerPrefersHlsRemux(streamInfo.fileName) &&
    isHlsVideoCopySupported(streamInfo.videoCodec);

  if (mode === "remux") {
    return {
      usingHls: true,
      hlsQuality: "remux",
      audioCompatNotice: null,
    };
  }

  if (mode === "transcode") {
    return {
      usingHls: true,
      hlsQuality: pickTranscodeQualityForPlayback(
        streamInfo.availableQualities,
        streamInfo.height,
        streamInfo.width,
      ),
      audioCompatNotice: null,
    };
  }

  return {
    usingHls: false,
    audioCompatNotice: !videoSupported
      ? `${videoCodec} video can't play in the browser. Enable transcoding on the server or choose a lower quality.`
      : !audioSupported
        ? `${codec} audio can't play in the browser. Enable transcoding on the server or choose a lower quality.`
        : containerNeedsRemux
          ? "This video container can't play directly in the browser. Enable transcoding on the server so it can be remuxed."
          : "This video can't play directly in the browser. Enable transcoding on the server or choose a lower quality.",
  };
}

/** Pick the quality setting to use when opening the player for this file. */
export function resolveInitialStreamQuality(streamInfo: StreamInfo): {
  quality: StreamQuality;
  error: string | null;
} {
  const playback = resolvePlaybackStream("original", streamInfo);

  if (playback.audioCompatNotice && !streamInfo.transcodingEnabled) {
    return { quality: "original", error: playback.audioCompatNotice };
  }

  return { quality: "original", error: null };
}

export interface TvEpisodeSummary {
  id: number;
  title?: string | null;
  episodeNumber: number;
  stillPath?: string | null;
  overview?: string | null;
  durationMs?: number | null;
}

export interface TvSeasonSummary {
  seasonNumber: number;
  episodes: TvEpisodeSummary[];
}

export interface PlaybackMediaDetail {
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  seasons?: TvSeasonSummary[];
}

/** End of the seekable range containing the current playhead (or before it in a gap). */
/** Seek direct-play video to a resume point, then start playback (avoids a flash at 0:00). */
export function startDirectPlaybackWithResume(
  video: HTMLVideoElement,
  startSeconds: number,
  options?: { onSeekComplete?: (seconds: number) => void },
): () => void {
  let onLoadedData: (() => void) | null = null;
  let onSeeked: (() => void) | null = null;

  const cleanup = () => {
    if (onLoadedData) {
      video.removeEventListener("loadeddata", onLoadedData);
      onLoadedData = null;
    }
    if (onSeeked) {
      video.removeEventListener("seeked", onSeeked);
      onSeeked = null;
    }
  };

  const play = () => {
    void video.play().catch(() => {});
  };

  const seekAndPlay = () => {
    if (startSeconds <= 0 || !video.duration || !Number.isFinite(video.duration)) {
      play();
      return;
    }

    const target = Math.min(startSeconds, video.duration);

    onSeeked = () => {
      options?.onSeekComplete?.(target);
      cleanup();
      play();
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = target;

    if (Math.abs(video.currentTime - target) < 0.25) {
      options?.onSeekComplete?.(target);
      cleanup();
      play();
    }
  };

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    seekAndPlay();
  } else {
    onLoadedData = () => {
      cleanup();
      seekAndPlay();
    };
    video.addEventListener("loadeddata", onLoadedData);
  }

  return cleanup;
}

export function getVideoSeekableEnd(video: HTMLVideoElement): number {
  const ranges = video.seekable;
  if (!ranges.length) return 0;

  const t = video.currentTime;
  for (let i = 0; i < ranges.length; i++) {
    const start = ranges.start(i);
    const end = ranges.end(i);
    if (t >= start && t <= end) return end;
    if (t < start) return i > 0 ? ranges.end(i - 1) : 0;
  }

  return ranges.end(ranges.length - 1);
}

/** All contiguous buffered ranges on the media timeline (video element time). */
export function getVideoBufferedRanges(
  video: HTMLVideoElement,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const buffered = video.buffered;
  for (let i = 0; i < buffered.length; i++) {
    ranges.push({ start: buffered.start(i), end: buffered.end(i) });
  }
  return ranges;
}

/**
 * Scrubber buffer display: one contiguous bar from the playhead forward.
 * Hides disconnected islands from live-edge prefetch that are not playable yet.
 */
export function getScrubberBufferedRanges(
  ranges: Array<{ start: number; end: number }>,
  playheadSeconds: number,
  maxGapSeconds = 4,
): Array<{ start: number; end: number }> {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let anchorIdx = sorted.findIndex(
    (range) =>
      playheadSeconds >= range.start - 0.05 && playheadSeconds <= range.end + maxGapSeconds,
  );
  if (anchorIdx < 0) {
    anchorIdx = sorted.findIndex(
      (range) =>
        range.start >= playheadSeconds && range.start - playheadSeconds <= maxGapSeconds,
    );
  }
  if (anchorIdx < 0) return [];

  const merged = [
    {
      start: Math.max(sorted[anchorIdx].start, playheadSeconds),
      end: sorted[anchorIdx].end,
    },
  ];
  for (let i = anchorIdx + 1; i < sorted.length; i++) {
    const previous = merged[merged.length - 1];
    const next = sorted[i];
    if (next.start - previous.end > maxGapSeconds) break;
    previous.end = Math.max(previous.end, next.end);
  }

  return merged.filter((range) => range.end > playheadSeconds + 0.05);
}

/**
 * Minimum forward progress (seconds) past the last spurious-`ended` boundary
 * that counts as "recovery is working", clearing the spurious-recovery budget.
 */
export const SPURIOUS_RECOVERY_PROGRESS_SECONDS = 8;

/**
 * Spurious-`ended` events closer together than this are coalesced into a
 * single logical recovery attempt, so transient encoder lag at one boundary
 * can't burn the whole budget in a fraction of a second.
 */
export const SPURIOUS_RECOVERY_COALESCE_MS = 5000;

/** Max distinct spurious-recovery attempts before a full stream restart. */
export const MAX_SPURIOUS_RECOVERY_ATTEMPTS = 5;

export interface SpuriousRecoveryState {
  /** Count of distinct (non-coalesced) recovery attempts since last reset. */
  attempts: number;
  /** Epoch ms of the last spurious `ended`, or 0 if none. */
  lastEndedAtMs: number;
  /** Relative playhead seconds captured at the last spurious `ended`. */
  anchorSeconds: number;
}

export interface SpuriousRecoveryDecision {
  /** "recover" = replay in place & keep polling; "restart" = full stream restart. */
  action: "recover" | "restart";
  next: SpuriousRecoveryState;
}

/**
 * Decide how to respond to a spurious `ended` at a growing-transcode boundary.
 *
 * A growing transcode will always eventually produce the next segment, so the
 * default response is to replay in place and let the manifest poll discover
 * it. A full stream restart is only warranted when in-place recovery keeps
 * firing WITHOUT the playhead ever advancing — otherwise transient encoder
 * lag would trigger a jarring restart every ~6s (one segment).
 */
export function resolveSpuriousRecovery({
  state,
  nowMs,
  relativeSeconds,
  progressThresholdSeconds = SPURIOUS_RECOVERY_PROGRESS_SECONDS,
  coalesceWindowMs = SPURIOUS_RECOVERY_COALESCE_MS,
  maxAttempts = MAX_SPURIOUS_RECOVERY_ATTEMPTS,
}: {
  state: SpuriousRecoveryState;
  nowMs: number;
  relativeSeconds: number;
  progressThresholdSeconds?: number;
  coalesceWindowMs?: number;
  maxAttempts?: number;
}): SpuriousRecoveryDecision {
  // Sustained forward progress since the last boundary means recovery works —
  // treat the budget as freshly reset (rate limiter, not lifetime cap).
  const progressed = relativeSeconds - state.anchorSeconds;
  let attempts = progressed >= progressThresholdSeconds ? 0 : state.attempts;

  // Coalesce rapid repeats at the same wall so a single stuck boundary can't
  // exhaust the budget in one burst.
  const isRapidRepeat =
    state.lastEndedAtMs > 0 && nowMs - state.lastEndedAtMs < coalesceWindowMs;
  if (!isRapidRepeat) {
    attempts += 1;
  }

  if (isRapidRepeat || attempts <= maxAttempts) {
    return {
      action: "recover",
      next: { attempts, lastEndedAtMs: nowMs, anchorSeconds: relativeSeconds },
    };
  }

  return {
    action: "restart",
    next: { attempts: 0, lastEndedAtMs: 0, anchorSeconds: relativeSeconds },
  };
}

/** True when `ended` fired at a growing HLS transcode boundary, not the real file end. */
export function isSpuriousHlsEnded({
  usingHls,
  relativeSeconds,
  hlsStartOffset,
  sourceDurationSeconds,
  playlistRelativeSeconds,
}: {
  usingHls: boolean;
  relativeSeconds: number;
  hlsStartOffset: number;
  sourceDurationSeconds: number;
  playlistRelativeSeconds?: number;
}): boolean {
  if (!usingHls) return false;

  // When we have a finite playlist duration (from video.duration), prefer it
  // over sourceDuration which can be huge. For HLS sessions that started at a
  // non-zero offset, playlist duration is relative to the session start. The
  // absolute file position is offset+relative. We compare absolute vs the
  // absolute source duration when sourceDuration is available, but inflate the
  // reported playlist edge by at least 8 s so a transient video.duration blip
  // on the new transcode edge doesn't become "real end".
  //
  // When sourceDuration is unknown (0), fall back to the playlist length as
  // lower-bound and treat "ended" before it as spurious.
  const playlistEdge = playlistRelativeSeconds ?? 0;
  const effectiveSourceDuration =
    sourceDurationSeconds > 0
      ? Math.max(sourceDurationSeconds, hlsStartOffset + playlistEdge + 8)
      : hlsStartOffset + playlistEdge + 8;

  if (effectiveSourceDuration <= 0) return false;

  const absoluteSeconds = hlsStartOffset + relativeSeconds;
  // For sessions started mid-file, "ended" after only a few seconds is almost
  // certainly a growing-playlist boundary. Require getting within 8 s of the
  // *known* source end before trusting ended as real.
  return absoluteSeconds < effectiveSourceDuration - 8;
}

/** True when an HLS media playlist includes `#EXT-X-ENDLIST`. */
export function playlistM3u8HasEndList(m3u8: string): boolean {
  return m3u8.includes("#EXT-X-ENDLIST");
}

/** End of the buffered range containing the current playhead (or before it in a gap). */
export function getVideoBufferedEnd(video: HTMLVideoElement): number {
  const ranges = video.buffered;
  if (!ranges.length) return 0;

  const t = video.currentTime;
  for (let i = 0; i < ranges.length; i++) {
    const start = ranges.start(i);
    const end = ranges.end(i);
    if (t >= start && t <= end) return end;
    if (t < start) return i > 0 ? ranges.end(i - 1) : 0;
  }

  return ranges.end(ranges.length - 1);
}

/**
 * Seconds of media buffered contiguously ahead of the playhead.
 * Ignores disconnected prefetch islands that hls.js may load past the
 * current consumption point — using raw buffered.end() for those islands
 * makes growing-transcode refresh think the buffer is healthy and stop
 * polling for new segments.
 */
export function getContiguousBufferedAhead(
  video: HTMLVideoElement,
  maxGapSeconds = 4,
): number {
  const end = getVideoBufferedEnd(video);
  if (end <= 0) return 0;
  const ahead = end - video.currentTime;
  if (ahead <= 0) return 0;

  // If the playhead sits in a gap before `end`, the contiguous runway is
  // shorter than the naive buffered-end delta.
  const ranges = getVideoBufferedRanges(video);
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const t = video.currentTime;
  let anchorIdx = sorted.findIndex(
    (range) => t >= range.start - 0.05 && t <= range.end + maxGapSeconds,
  );
  if (anchorIdx < 0) {
    anchorIdx = sorted.findIndex(
      (range) => range.start >= t && range.start - t <= maxGapSeconds,
    );
  }
  if (anchorIdx < 0) return 0;

  let contiguousEnd = sorted[anchorIdx].end;
  for (let i = anchorIdx + 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start - contiguousEnd > maxGapSeconds) break;
    contiguousEnd = Math.max(contiguousEnd, next.end);
  }

  return Math.max(0, contiguousEnd - t);
}

/**
 * Stall-watchdog decision for growing HLS (no ENDLIST until encode finishes).
 *
 * Waiting at the live encode edge with no buffer ahead is healthy — do NOT
 * pipeline-reset or fatal. Only escalate when the decoder is wedged with
 * buffered data, or the playlist is truly finished (ENDLIST) and still stuck.
 */
export type StallWatchdogAction =
  | "none"
  | "wait-grow"
  | "nudge"
  | "pipeline-reset"
  | "fatal";

export const STALL_ADVANCE_TIMEOUT_MS = 4000;
export const STALL_WAIT_GROW_BUFFER_SECONDS = 1;
/** ~60s of wait-grow ticks (watchdog interval 2s) before treating encode as dead. */
export const STALL_MAX_WAIT_GROW_TICKS = 30;
export const STALL_MAX_NUDGES_BEFORE_RESET = 3;
export const STALL_MAX_NUDGES_BEFORE_FATAL = 6;

/** Clustered mid-play underruns that recover (not a hard 45s stall). */
export const REBUFFER_ESCALATION_COUNT = 3;
export const REBUFFER_ESCALATION_WINDOW_MS = 180_000;

/**
 * Web-side backup if the native stall watchdog never fires (older APK, hung
 * bridge). Continuous mid-playback buffering past this → escalate.
 */
export const NATIVE_MID_BUFFER_WATCHDOG_MS = 20_000;

/**
 * After a user scrub/skip, ExoPlayer legitimately buffers while refilling the
 * Range/segment window. Soft seek+prepare (or fail-through) during this window
 * cancels that refill and is the main cause of post-seek lag on Android TV.
 */
export const NATIVE_SEEK_STALL_SUPPRESS_MS = 12_000;
/** Coalesce rapid skip taps (-10 / +30) into one seek. */
export const NATIVE_SEEK_COALESCE_MS = 180;

export type NativeSeekStallWatchdogAction =
  | "suppress"
  | "allow-soft-recovery"
  | "allow-fail-through";

/** True when mid-playback buffering has been continuous long enough to escalate. */
export function shouldFailThroughContinuousMidBuffer(options: {
  bufferingMidPlayback: boolean;
  bufferingStartedAtMs: number | null;
  nowMs: number;
  lastUserSeekAtMs?: number | null;
  timeoutMs?: number;
  seekSuppressMs?: number;
}): boolean {
  if (!options.bufferingMidPlayback || options.bufferingStartedAtMs == null) {
    return false;
  }
  const seekSuppressMs = options.seekSuppressMs ?? NATIVE_SEEK_STALL_SUPPRESS_MS;
  if (
    options.lastUserSeekAtMs != null &&
    options.nowMs - options.lastUserSeekAtMs < seekSuppressMs
  ) {
    return false;
  }
  const timeoutMs = options.timeoutMs ?? NATIVE_MID_BUFFER_WATCHDOG_MS;
  return options.nowMs - options.bufferingStartedAtMs >= timeoutMs;
}

/**
 * Decide whether the native stall watchdog may soft-recover or fail through.
 * Recent user seeks always win — interrupting a post-seek refill causes lag.
 */
export function resolveSeekStallWatchdogAction(options: {
  msSinceUserSeek: number | null;
  msSinceProgress: number;
  hasReachedReady: boolean;
  softRecoveryMs?: number;
  failThroughMs?: number;
  seekSuppressMs?: number;
}): NativeSeekStallWatchdogAction {
  const seekSuppressMs = options.seekSuppressMs ?? NATIVE_SEEK_STALL_SUPPRESS_MS;
  if (
    options.msSinceUserSeek != null &&
    options.msSinceUserSeek >= 0 &&
    options.msSinceUserSeek < seekSuppressMs
  ) {
    return "suppress";
  }

  const softMs = options.softRecoveryMs ?? 8_000;
  const failMs = options.failThroughMs ?? 16_000;

  if (!options.hasReachedReady) {
    return options.msSinceProgress >= failMs ? "allow-fail-through" : "suppress";
  }
  if (options.msSinceProgress >= failMs) return "allow-fail-through";
  if (options.msSinceProgress >= softMs) return "allow-soft-recovery";
  return "suppress";
}

/** Latest target wins; dispatch only after taps settle. */
export function resolveCoalescedSeekTarget(options: {
  pendingTargetMs: number | null;
  nextTargetMs: number;
}): number {
  return Math.max(0, options.nextTargetMs);
}

/**
 * Soft playback-rate brake at a growing encode edge. Prefer a tiny slowdown
 * over a hard pause — avoids the old buffer-gate infinite-hold failure mode.
 */
export const GROWING_EDGE_RATE_LOW_BUFFER_SECONDS = 6;
export const GROWING_EDGE_RATE_RESUME_BUFFER_SECONDS = 18;
export const GROWING_EDGE_PLAYBACK_RATE = 0.92;

/**
 * Record a mid-playback rebuffer and decide whether to escalate (e.g. progressive
 * → remux). Ignores cold-start buffering before playback has begun.
 */
export function recordMidPlaybackRebuffer(
  priorTimestampsMs: number[],
  nowMs: number,
  options?: { windowMs?: number; count?: number },
): { timestampsMs: number[]; shouldEscalate: boolean } {
  const windowMs = options?.windowMs ?? REBUFFER_ESCALATION_WINDOW_MS;
  const count = options?.count ?? REBUFFER_ESCALATION_COUNT;
  const timestampsMs = priorTimestampsMs
    .filter((t) => nowMs - t <= windowMs)
    .concat(nowMs);
  return {
    timestampsMs,
    shouldEscalate: timestampsMs.length >= count,
  };
}

/** PlaybackRate to use while waiting on a growing (no-ENDLIST) HLS edge. */
export function resolveGrowingEdgePlaybackRate(options: {
  playlistHasEndList: boolean;
  bufferAheadSeconds: number;
  currentRate: number;
  lowBufferSeconds?: number;
  resumeBufferSeconds?: number;
  slowRate?: number;
}): number {
  if (options.playlistHasEndList) return 1;
  const low = options.lowBufferSeconds ?? GROWING_EDGE_RATE_LOW_BUFFER_SECONDS;
  const resume =
    options.resumeBufferSeconds ?? GROWING_EDGE_RATE_RESUME_BUFFER_SECONDS;
  const slow = options.slowRate ?? GROWING_EDGE_PLAYBACK_RATE;

  if (options.bufferAheadSeconds < low) return slow;
  if (options.bufferAheadSeconds >= resume) return 1;
  // Hysteresis: keep the current rate between low and resume thresholds.
  return options.currentRate === slow ? slow : 1;
}

export function resolveStallWatchdogAction(options: {
  msSinceAdvance: number;
  bufferAheadSeconds: number;
  stuckWithData: boolean;
  playlistHasEndList: boolean;
  consecutiveStallNudges: number;
  waitGrowTicks: number;
  didAttemptPipelineReset: boolean;
  maxNudgesBeforeReset?: number;
  maxNudgesBeforeFatal?: number;
  maxWaitGrowTicks?: number;
  advanceTimeoutMs?: number;
  waitGrowBufferSeconds?: number;
}): { action: StallWatchdogAction; nextStallNudges: number; nextWaitGrowTicks: number } {
  const advanceTimeoutMs = options.advanceTimeoutMs ?? STALL_ADVANCE_TIMEOUT_MS;
  const waitGrowBufferSeconds =
    options.waitGrowBufferSeconds ?? STALL_WAIT_GROW_BUFFER_SECONDS;
  const maxNudgesBeforeReset =
    options.maxNudgesBeforeReset ?? STALL_MAX_NUDGES_BEFORE_RESET;
  const maxNudgesBeforeFatal =
    options.maxNudgesBeforeFatal ?? STALL_MAX_NUDGES_BEFORE_FATAL;
  const maxWaitGrowTicks = options.maxWaitGrowTicks ?? STALL_MAX_WAIT_GROW_TICKS;

  if (options.msSinceAdvance < advanceTimeoutMs) {
    return { action: "none", nextStallNudges: 0, nextWaitGrowTicks: 0 };
  }

  // Growing encode edge: no ENDLIST, little/no runway, element not sitting on data.
  const waitingOnGrow =
    !options.playlistHasEndList &&
    options.bufferAheadSeconds < waitGrowBufferSeconds &&
    !options.stuckWithData;

  if (waitingOnGrow) {
    const nextWaitGrowTicks = options.waitGrowTicks + 1;
    if (nextWaitGrowTicks >= maxWaitGrowTicks) {
      return {
        action: "fatal",
        nextStallNudges: 0,
        nextWaitGrowTicks: 0,
      };
    }
    return {
      action: "wait-grow",
      nextStallNudges: 0,
      nextWaitGrowTicks,
    };
  }

  const nextStallNudges = options.consecutiveStallNudges + 1;

  if (nextStallNudges >= maxNudgesBeforeFatal) {
    return { action: "fatal", nextStallNudges: 0, nextWaitGrowTicks: 0 };
  }

  if (nextStallNudges >= maxNudgesBeforeReset) {
    if (!options.didAttemptPipelineReset) {
      return {
        action: "pipeline-reset",
        nextStallNudges,
        nextWaitGrowTicks: 0,
      };
    }
    return { action: "fatal", nextStallNudges: 0, nextWaitGrowTicks: 0 };
  }

  return {
    action: "nudge",
    nextStallNudges,
    nextWaitGrowTicks: 0,
  };
}

export function buildPlaybackTitle(
  type: "movie" | "episode",
  media: PlaybackMediaDetail,
  fileId: number,
): string {
  if (type !== "episode") {
    return media.title;
  }

  for (const season of media.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      if (episode.id !== fileId) continue;

      const episodeName =
        episode.title?.trim() || `Episode ${episode.episodeNumber}`;
      return `${media.title}: ${episodeName} (S${season.seasonNumber}E${episode.episodeNumber})`;
    }
  }

  return media.title;
}

export function findEpisode(
  media: PlaybackMediaDetail,
  fileId: number,
): TvEpisodeSummary | null {
  for (const season of media.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      if (episode.id === fileId) {
        return episode;
      }
    }
  }
  return null;
}

export interface NextEpisodeInfo {
  episode: TvEpisodeSummary;
  seasonNumber: number;
}

export const WATCH_COMPLETED_FRACTION = 0.95;
export const NEXT_EPISODE_COUNTDOWN_SECONDS = 10;

/** Next episode in season order (same season, then following seasons). */
export function findNextEpisode(
  media: PlaybackMediaDetail,
  currentEpisodeId: number,
): NextEpisodeInfo | null {
  const seasons = [...(media.seasons ?? [])].sort(
    (a, b) => a.seasonNumber - b.seasonNumber,
  );

  for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex++) {
    const season = seasons[seasonIndex];
    const episodes = [...season.episodes].sort(
      (a, b) => a.episodeNumber - b.episodeNumber,
    );

    for (let episodeIndex = 0; episodeIndex < episodes.length; episodeIndex++) {
      if (episodes[episodeIndex].id !== currentEpisodeId) continue;

      if (episodeIndex + 1 < episodes.length) {
        return {
          episode: episodes[episodeIndex + 1],
          seasonNumber: season.seasonNumber,
        };
      }

      for (let nextSeasonIndex = seasonIndex + 1; nextSeasonIndex < seasons.length; nextSeasonIndex++) {
        const nextSeason = seasons[nextSeasonIndex];
        const nextEpisodes = [...nextSeason.episodes].sort(
          (a, b) => a.episodeNumber - b.episodeNumber,
        );
        if (nextEpisodes.length > 0) {
          return {
            episode: nextEpisodes[0],
            seasonNumber: nextSeason.seasonNumber,
          };
        }
      }

      return null;
    }
  }

  return null;
}

export function formatEpisodeLabel(
  episode: TvEpisodeSummary,
  seasonNumber: number,
): string {
  const name = episode.title?.trim() || `Episode ${episode.episodeNumber}`;
  return `S${seasonNumber}E${episode.episodeNumber} · ${name}`;
}

/** Still → series backdrop → poster. Used for the up-next overlay and prefetch. */
export function nextEpisodePreviewPath(
  next: NextEpisodeInfo,
  media?: PlaybackMediaDetail | null,
): string | null {
  return (
    next.episode.stillPath ??
    media?.backdropPath ??
    media?.posterPath ??
    null
  );
}

export interface MediaSeasonProgress {
  seasonNumber: number;
  episodes: Array<
    TvEpisodeSummary & {
      durationMs?: number | null;
      watchProgress?: {
        positionMs: number;
        durationMs?: number | null;
        updatedAt?: string | number | Date | null;
      } | null;
    }
  >;
}

function watchProgressTimestamp(
  progress: NonNullable<MediaSeasonProgress["episodes"][number]["watchProgress"]>,
): number {
  if (progress.updatedAt == null) return 0;
  const time = new Date(progress.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Season tab and episode to focus on a TV show page based on watch activity. */
export function resolveNextEpisodeTarget(
  seasons: MediaSeasonProgress[],
): { seasonIndex: number; episodeId: number } | null {
  if (!seasons.length) return null;

  let bestSeasonIndex = 0;
  let bestTimestamp = -1;
  let bestSeriesOrder = -1;
  let bestEpisode: MediaSeasonProgress["episodes"][number] | null = null;

  for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex++) {
    const season = seasons[seasonIndex];
    for (const episode of season.episodes) {
      const progress = episode.watchProgress;
      if (!progress || progress.positionMs <= 0) continue;

      const timestamp = watchProgressTimestamp(progress);
      const seriesOrder = season.seasonNumber * 10_000 + episode.episodeNumber;
      if (
        timestamp > bestTimestamp ||
        (timestamp === bestTimestamp && seriesOrder > bestSeriesOrder)
      ) {
        bestTimestamp = timestamp;
        bestSeriesOrder = seriesOrder;
        bestSeasonIndex = seasonIndex;
        bestEpisode = episode;
      }
    }
  }

  if (bestEpisode?.watchProgress) {
    const durationMs =
      bestEpisode.watchProgress.durationMs ?? bestEpisode.durationMs ?? 1;
    const completed =
      bestEpisode.watchProgress.positionMs / durationMs >= WATCH_COMPLETED_FRACTION;

    if (!completed) {
      return { seasonIndex: bestSeasonIndex, episodeId: bestEpisode.id };
    }

    const next = findNextEpisode({ title: "", seasons }, bestEpisode.id);
    if (next) {
      const nextSeasonIndex = seasons.findIndex(
        (season) => season.seasonNumber === next.seasonNumber,
      );
      return {
        seasonIndex: nextSeasonIndex >= 0 ? nextSeasonIndex : bestSeasonIndex,
        episodeId: next.episode.id,
      };
    }

    return { seasonIndex: bestSeasonIndex, episodeId: bestEpisode.id };
  }

  const orderedSeasons = seasons
    .map((season, index) => ({ season, index }))
    .sort((a, b) => a.season.seasonNumber - b.season.seasonNumber);

  for (const { season, index } of orderedSeasons) {
    const episodes = [...season.episodes].sort(
      (a, b) => a.episodeNumber - b.episodeNumber,
    );
    if (episodes[0]) {
      return { seasonIndex: index, episodeId: episodes[0].id };
    }
  }

  return null;
}

/** Season tab to show on a TV show page based on recent watch activity. */
export function resolveActiveSeasonIndex(seasons: MediaSeasonProgress[]): number {
  return resolveNextEpisodeTarget(seasons)?.seasonIndex ?? 0;
}

/** Shared hls.js config — sends session cookies on manifest + segment requests. */
export function createPlaybackHls(
  HlsConstructor: typeof import("hls.js").default,
  options?: { tv?: boolean },
) {
  const tv = options?.tv ?? isTvClient();

  // The server serves a growing HLS playlist (VOD content produced by an
  // on-demand transcode; no #EXT-X-ENDLIST until complete). hls.js treats a
  // no-ENDLIST playlist as "live" and reloads it on its own timer to discover
  // new segments — exactly what we want. We deliberately let hls.js manage
  // buffering and playlist reloads natively; the app must NOT poll
  // startLoad() (that resets the fragment loader and prevents the buffer from
  // ever growing past one segment).
  return new HlsConstructor({
    startPosition: 0,
    backBufferLength: tv ? 120 : 90,
    // Deep forward buffer so playback isn't segment-by-segment at the live edge.
    // TV remux playlists grow live — keep ~2 min ahead, not 3–4 (starves at encode tip).
    maxBufferLength: tv ? 120 : 120,
    maxMaxBufferLength: tv ? 360 : 600,
    // 4K remux segments are large; allow a big MSE buffer (bytes).
    maxBufferSize: tv ? 400 * 1000 * 1000 : 250 * 1000 * 1000,
    maxBufferHole: 0.5,
    highBufferWatchdogPeriod: 2,
    // Never auto-skip holes — that jumps the viewer ahead. Buffer-gate holds
    // instead until the next segment arrives at the same playhead.
    nudgeOnVideoHole: false,
    nudgeOffset: 0,
    nudgeMaxRetry: 0,
    // Keep video.duration finite (the growing playlist length) so the seek
    // bar and premature-`ended` detection work.
    liveDurationInfinity: false,
    enableWorker: true,
    progressive: false,
    // Buffer ahead from the buffer end rather than hugging the live edge —
    // this is VOD-shaped content, we want a deep forward buffer.
    liveSyncMode: "buffered",
    liveSyncDurationCount: 10,
    liveMaxLatencyDurationCount: Number.POSITIVE_INFINITY,
    maxLiveSyncPlaybackRate: 1,
    // Discover new growing-playlist segments quickly.
    manifestLoadingMaxRetry: 8,
    manifestLoadingRetryDelay: 500,
    manifestLoadingMaxRetryTimeout: 64000,
    levelLoadingMaxRetry: 8,
    levelLoadingRetryDelay: 500,
    levelLoadingMaxRetryTimeout: 64000,
    fragLoadingMaxRetry: 12,
    fragLoadingRetryDelay: 500,
    fragLoadingMaxRetryTimeout: 64000,
    appendErrorMaxRetry: 6,
    xhrSetup: (xhr) => {
      xhr.withCredentials = true;
    },
  });
}
