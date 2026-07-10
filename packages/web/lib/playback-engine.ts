import type Hls from "hls.js";
import {
  createPlaybackHls,
  getVideoBufferedEnd,
  playlistM3u8HasEndList,
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

  const bufferedAhead = getVideoBufferedEnd(video) - video.currentTime;
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
  let hlsRecoveryAttempts = 0;
  const maxHlsRecoveryAttempts = 4;
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
    }
  };

  const shouldRefreshGrowingPlaylist = () => {
    if (!hls || video.ended) return false;
    return decideShouldRefreshGrowingPlaylist({
      playlistHasEndList,
      playlistDurationSeconds: video.duration,
      currentTimeSeconds: video.currentTime,
      bufferedAheadSeconds: getVideoBufferedEnd(video) - video.currentTime,
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
    if (!hls || video.ended) return;
    if (waitingRecoveryTimer) clearTimeout(waitingRecoveryTimer);
    waitingRecoveryTimer = setTimeout(() => {
      waitingRecoveryTimer = null;
      if (!needsMoreMediaData(video)) return;
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
      if (!hls || video.ended) return;
      // The stall watchdog below is the only other place that nudges hls.js
      // past a stall, and it bails out entirely while paused — so this is
      // the sole mechanism that keeps a paused-at-the-buffer-edge session
      // discovering new segments (and keeps the server-side transcode
      // session from idling out) until the viewer hits play again.
      const pausedNearEdge = video.paused && isNearBufferEdge(video);
      if (video.paused && !pausedNearEdge) return;
      maybeRefreshPlaylist();
    }, 3000);
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

        if (hls && hlsRecoveryAttempts < maxHlsRecoveryAttempts) {
          hlsRecoveryAttempts += 1;
          if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
            // Network failure during a growing transcode — refresh manifest
            // rather than bailing straight to fatal; segments may just not
            // exist yet.
            hls.startLoad();
            maybeRefreshPlaylist();
            return;
          }
          if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
        }

        onFatalError();
      });

      hls.on(HlsConstructor.Events.FRAG_BUFFERED, onBufferUpdate);
      hls.on(HlsConstructor.Events.BUFFER_APPENDED, onBufferUpdate);

      stallWatchdog = setInterval(() => {
        if (!hls || video.paused || video.ended) return;

        trackPlaybackAdvance();

        if (!isNearBufferEdge(video)) return;
        if (Date.now() - lastPlaybackAdvanceMs < 2000) return;
        if (!needsMoreMediaData(video)) return;

        maybeRefreshPlaylist();
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
