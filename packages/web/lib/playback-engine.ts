import type Hls from "hls.js";
import {
  createPlaybackHls,
  getContiguousBufferedAhead,
  getVideoBufferedEnd,
  playlistM3u8HasEndList,
  RECOVERY_FORGIVE_PROGRESS_SECONDS,
  resolveRecoveryBudget,
  shouldRefreshGrowingPlaylist as decideShouldRefreshGrowingPlaylist,
  startDirectPlaybackWithResume,
} from "@/lib/playback-utils";

let hlsModulePromise: Promise<typeof import("hls.js").default> | null = null;

export async function loadHls() {
  if (!hlsModulePromise) {
    hlsModulePromise = import("hls.js").then((mod) => mod.default);
  }
  return hlsModulePromise;
}

export interface WebPlaybackOptions {
  HlsConstructor?: typeof import("hls.js").default;
  video: HTMLVideoElement;
  url: string;
  usingHls: boolean;
  startAt: number;
  tv?: boolean;
  onFatalError: () => void;
  onBufferUpdate: () => void;
  onSeekComplete?: (seconds: number) => void;
  onSourceReady?: () => void;
}

export interface WebPlaybackHandle {
  cleanup: () => void;
  hls: Hls | null;
}

export function destroyHlsInstance(hls: Hls | null): void {
  if (!hls) return;
  hls.stopLoad();
  hls.detachMedia();
  hls.destroy();
}

/** Resume after a premature `ended` at a growing transcode playlist boundary. */
export function recoverHlsPlaybackAtPlaylistEnd(
  video: HTMLVideoElement,
  hls: Hls | null,
): void {
  const resumeAt = Math.max(0, video.currentTime - 0.25);
  if (hls) {
    try {
      hls.startLoad(resumeAt);
    } catch {
      // ignore — next poll will retry
    }
  }
  // Browsers keep ended=true until the playhead moves after a seek.
  video.pause();
  video.currentTime = resumeAt;
  void video.play().catch(() => {});
}

/** Nudge HLS loading after returning to a foreground tab or pausing near the buffer edge. */
export function catchUpHlsPlayback(
  video: HTMLVideoElement,
  hls: Hls | null,
): void {
  if (!hls) {
    return;
  }

  if (video.ended) {
    recoverHlsPlaybackAtPlaylistEnd(video, hls);
    return;
  }

  const bufferedAhead = getContiguousBufferedAhead(video);
  if (bufferedAhead >= 45 && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return;
  }

  try {
    hls.startLoad(video.currentTime);
  } catch {
    // ignore — next poll will retry
  }
}

/**
 * Reload the growing playlist so new segments are discovered.
 *
 * Re-assigning `hls.loadLevel`/`nextLevel`/`currentLevel` to the level it's
 * already on is a guaranteed no-op in hls.js — the level-controller's setter
 * bails out early whenever the target level index is unchanged, which is
 * always true here since this app never runs multi-variant ABR (every
 * session is a single level). `startLoad` is the one public entry point that
 * actually re-arms the level-controller's playlist reload regardless of
 * whether its internal timer has already elapsed.
 */
function refreshHlsPlaylist(video: HTMLVideoElement, hls: Hls): void {
  try {
    hls.startLoad(video.currentTime);
  } catch {
    // ignore — next poll will retry
  }
}

function isNearBufferEdge(video: HTMLVideoElement): boolean {
  const bufferedEnd = getVideoBufferedEnd(video);
  if (bufferedEnd <= 0) return false;
  return video.currentTime >= bufferedEnd - 1.25;
}

function needsMoreMediaData(video: HTMLVideoElement): boolean {
  return (
    !video.ended &&
    !video.paused &&
    video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
  );
}

export function startWebPlayback(options: WebPlaybackOptions): WebPlaybackHandle {
  const {
    HlsConstructor,
    video,
    url,
    usingHls,
    startAt,
    tv,
    onFatalError,
    onBufferUpdate,
    onSeekComplete,
    onSourceReady,
  } = options;

  let hls: Hls | null = null;
  let stopDirectPlayback: (() => void) | null = null;
  // Unforgiven fatal-recovery attempts. Unlike a monotonic counter, this is
  // credited back once the stream demonstrates sustained healthy playback
  // (see resolveRecoveryBudget), so a multi-hour session isn't permanently
  // disarmed by a handful of transient, fully-recovered blips.
  let hlsRecoveryBudgetSpent = 0;
  let positionAtLastRecovery = 0;
  const maxHlsRecoveryAttempts = 4;
  // Last-ditch media pipeline reset (detach + reattach + reload) tried once
  // before surfacing a fatal error to the UI.
  let didAttemptPipelineReset = false;
  // Consecutive stall-watchdog passes that refreshed the playlist without the
  // playhead advancing. After too many, the pipeline is wedged and we
  // escalate beyond plain playlist refresh.
  let consecutiveStallRecoveries = 0;
  let lastStallProbePosition = 0;
  const maxStallRecoveriesBeforeEscalation = 6;
  let manifestPollTimer: ReturnType<typeof setInterval> | null = null;
  let stallWatchdog: ReturnType<typeof setInterval> | null = null;
  let waitingRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPlaybackAdvanceMs = Date.now();
  let lastPlaybackPosition = 0;
  // Whether `#EXT-X-ENDLIST` has appeared in the loaded manifest. Once true,
  // this must never be reverted to false — LevelUpdated callbacks can still
  // fire with an older/stale manifest string during hls.js reload races.
  let playlistHasEndList = false;
  // ENDLIST, when present, may appear in a manifest that gets replaced by a
  // poll from a still-growing session. Track the first time we observe
  // #EXT-X-ENDLIST so we never revert on a stale poll.
  const onManifestSawEndList = (m3u8: string) => {
    if (!playlistHasEndList && playlistM3u8HasEndList(m3u8)) {
      playlistHasEndList = true;
    }
  };

  const clearTimers = () => {
    if (manifestPollTimer) {
      clearInterval(manifestPollTimer);
      manifestPollTimer = null;
    }
    if (stallWatchdog) {
      clearInterval(stallWatchdog);
      stallWatchdog = null;
    }
    if (waitingRecoveryTimer) {
      clearTimeout(waitingRecoveryTimer);
      waitingRecoveryTimer = null;
    }
  };

  const onVideoError = () => {
    onFatalError();
  };

  const trackPlaybackAdvance = () => {
    if (video.currentTime > lastPlaybackPosition + 0.05) {
      lastPlaybackPosition = video.currentTime;
      lastPlaybackAdvanceMs = Date.now();
      // A pipeline reset that led to sustained healthy playback is re-armed
      // so a later, unrelated wedge can be recovered the same way instead of
      // going straight to fatal.
      if (
        didAttemptPipelineReset &&
        video.currentTime - positionAtLastRecovery >=
          RECOVERY_FORGIVE_PROGRESS_SECONDS
      ) {
        didAttemptPipelineReset = false;
      }
    }
  };

  const shouldRefreshGrowingPlaylist = () => {
    if (!hls) return false;
    // Premature `ended` at a growing playlist boundary must not stop manifest
    // polling — recovery depends on discovering new segments.
    if (video.ended && playlistHasEndList) return false;
    return decideShouldRefreshGrowingPlaylist({
      playlistHasEndList,
      playlistDurationSeconds: video.duration,
      currentTimeSeconds: video.currentTime,
      bufferedAheadSeconds: getContiguousBufferedAhead(video),
      waitingForData:
        !video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
      isNearBufferEdge: isNearBufferEdge(video),
    });
  };

  const maybeRefreshPlaylist = () => {
    if (!shouldRefreshGrowingPlaylist()) return;
    refreshHlsPlaylist(video, hls!);
  };

  const scheduleWaitingRecovery = () => {
    if (!hls) return;
    if (video.ended && playlistHasEndList) return;
    if (waitingRecoveryTimer) clearTimeout(waitingRecoveryTimer);
    if (isNearBufferEdge(video) || !playlistHasEndList) {
      maybeRefreshPlaylist();
    }
    waitingRecoveryTimer = setTimeout(() => {
      waitingRecoveryTimer = null;
      if (video.ended && playlistHasEndList) return;
      if (!needsMoreMediaData(video) && playlistHasEndList) return;
      maybeRefreshPlaylist();
    }, 300);
  };

  const onWaiting = () => {
    scheduleWaitingRecovery();
  };

  const onTimeUpdate = () => {
    trackPlaybackAdvance();
    onBufferUpdate();
  };

  const startManifestPolling = () => {
    if (manifestPollTimer) return;
    manifestPollTimer = setInterval(() => {
      if (!hls) return;
      if (video.ended && playlistHasEndList) return;
      const pausedNearEdge = video.paused && isNearBufferEdge(video);
      if (video.paused && !pausedNearEdge && playlistHasEndList) return;
      maybeRefreshPlaylist();
    }, 2000);
  };

  if (usingHls) {
    if (!HlsConstructor) {
      onFatalError();
      return { hls: null, cleanup: () => {} };
    }
    if (HlsConstructor.isSupported()) {
      hls = createPlaybackHls(HlsConstructor, { tv });
      hls.loadSource(url);
      hls.attachMedia(video);
      video.addEventListener("error", onVideoError);
      video.addEventListener("waiting", onWaiting);
      video.addEventListener("timeupdate", onTimeUpdate);

      hls.on(HlsConstructor.Events.MANIFEST_PARSED, () => {
        // startLoad(0) after MANIFEST_PARSED ensures the first frag fetch
        // fires synchronously on schedule — required when the player raced
        // ahead of the transcode and the playlist contains only 1 frag so far.
        hls?.startLoad(0);
        lastPlaybackPosition = 0;
        lastPlaybackAdvanceMs = Date.now();
        startManifestPolling();
        onSourceReady?.();
        // Don't call play() here — the element may not yet have its source
        // buffer attached (FRAG not parsed). Let the first FRAG_PARSED or
        // BUFFER_APPENDED trigger playback, with this as fallback.
        video.play().catch(() => {});
      });

      hls.on(HlsConstructor.Events.FRAG_PARSED, () => {
        if (video.paused && !video.ended) {
          video.play().catch(() => {});
        }
      });

      hls.on(HlsConstructor.Events.LEVEL_UPDATED, (_, data) => {
        onManifestSawEndList(data.details.m3u8);
        onBufferUpdate();
      });

      hls.on(HlsConstructor.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          if (data.details === HlsConstructor.ErrorDetails.BUFFER_STALLED_ERROR) {
            maybeRefreshPlaylist();
            return;
          }
          if (
            hls &&
            (data.details === HlsConstructor.ErrorDetails.FRAG_LOAD_ERROR ||
              data.details === HlsConstructor.ErrorDetails.FRAG_LOAD_TIMEOUT ||
              data.details === HlsConstructor.ErrorDetails.LEVEL_LOAD_ERROR ||
              data.details === HlsConstructor.ErrorDetails.LEVEL_PARSING_ERROR)
          ) {
            maybeRefreshPlaylist();
          }
          return;
        }

        if (hls) {
          const isRecoverableType =
            data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR ||
            data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR;

          if (isRecoverableType) {
            const { allowed, nextSpentBudget } = resolveRecoveryBudget({
              spentBudget: hlsRecoveryBudgetSpent,
              maxBudget: maxHlsRecoveryAttempts,
              currentPositionSeconds: video.currentTime,
              positionAtLastRecoverySeconds: positionAtLastRecovery,
            });

            if (allowed) {
              hlsRecoveryBudgetSpent = nextSpentBudget;
              positionAtLastRecovery = video.currentTime;

              if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
                // Network failure during a growing transcode — refresh
                // manifest rather than bailing straight to fatal; segments
                // may just not exist yet.
                hls.startLoad();
                maybeRefreshPlaylist();
                return;
              }
              // MEDIA_ERROR
              hls.recoverMediaError();
              return;
            }
          }

          // A non-recoverable error type (OTHER_ERROR / MUX_ERROR), or a
          // network/media error that keeps recurring without healthy playback
          // in between: try one full media-pipeline reset (detach + reattach +
          // reload from the current position) before surfacing a fatal error
          // to the UI. This clears a wedged SourceBuffer that
          // recoverMediaError alone can't.
          if (!didAttemptPipelineReset) {
            didAttemptPipelineReset = true;
            positionAtLastRecovery = video.currentTime;
            const resumeAt = Math.max(0, video.currentTime - 0.25);
            try {
              hls.detachMedia();
              hls.attachMedia(video);
              hls.startLoad(resumeAt);
              maybeRefreshPlaylist();
              return;
            } catch {
              // fall through to fatal
            }
          }
        }

        onFatalError();
      });

      hls.on(HlsConstructor.Events.FRAG_BUFFERED, onBufferUpdate);
      hls.on(HlsConstructor.Events.BUFFER_APPENDED, onBufferUpdate);

      stallWatchdog = setInterval(() => {
        if (!hls) return;
        if (video.paused) return;
        if (video.ended && playlistHasEndList) return;

        const positionBefore = video.currentTime;
        trackPlaybackAdvance();

        if (!isNearBufferEdge(video) && playlistHasEndList) return;
        if (Date.now() - lastPlaybackAdvanceMs < 2000) return;
        if (!needsMoreMediaData(video) && playlistHasEndList) return;

        // Refresh made progress since the previous stalled pass — reset the
        // escalation counter and let normal playback resume.
        if (positionBefore > lastStallProbePosition + 0.05) {
          consecutiveStallRecoveries = 0;
        }
        lastStallProbePosition = positionBefore;

        maybeRefreshPlaylist();
        if (video.ended && !playlistHasEndList) {
          recoverHlsPlaybackAtPlaylistEnd(video, hls);
        }

        consecutiveStallRecoveries += 1;
        // Refreshing the playlist repeatedly hasn't unstuck the playhead —
        // the media pipeline is wedged (bad segment append, SourceBuffer
        // gap hls.js can't nudge past). Escalate to a full detach/reattach
        // reload once, then to a fatal error (which triggers quality
        // fallback) so playback never silently hangs forever.
        if (consecutiveStallRecoveries >= maxStallRecoveriesBeforeEscalation) {
          consecutiveStallRecoveries = 0;
          if (!didAttemptPipelineReset) {
            didAttemptPipelineReset = true;
            positionAtLastRecovery = video.currentTime;
            const resumeAt = Math.max(0, video.currentTime - 0.25);
            try {
              hls.detachMedia();
              hls.attachMedia(video);
              hls.startLoad(resumeAt);
            } catch {
              onFatalError();
            }
          } else {
            onFatalError();
          }
        }

        lastPlaybackAdvanceMs = Date.now();
      }, 1500);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("error", onVideoError);
      onSourceReady?.();
      video.play().catch(() => {});
    } else {
      onFatalError();
    }
  } else {
    video.src = url;
    video.addEventListener("error", onVideoError);
    onSourceReady?.();
    stopDirectPlayback = startDirectPlaybackWithResume(video, startAt, {
      onSeekComplete,
    });
  }

  return {
    hls,
    cleanup: () => {
      clearTimers();
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("timeupdate", onTimeUpdate);
      stopDirectPlayback?.();
      destroyHlsInstance(hls);
    },
  };
}
