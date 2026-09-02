/** TV watch-player policy — remote, seek, scrub, and back stack. */

import {
  resolveHlsSeekAction,
  resolveNativeHlsSeekAction,
  shouldCommitScrubPreview,
} from "@/lib/playback-utils";

export const WATCH_SKIP_BACK_SECONDS = 10;
export const WATCH_SKIP_FORWARD_SECONDS = 30;
export const WATCH_SCRUB_NUDGE_SECONDS = 10;

export function watchSkipDeltaSeconds(intent: "skip-back" | "skip-forward"): number {
  return intent === "skip-back" ? -WATCH_SKIP_BACK_SECONDS : WATCH_SKIP_FORWARD_SECONDS;
}

export const WATCH_SKIP_FEEDBACK_MS = 1000;

export type WatchSkipFeedback = {
  direction: "back" | "forward";
  seconds: number;
};

/** D-pad left/right — the only remote keys that flash skip feedback. */
export function isWatchRemoteSkipArrowKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight";
}

/** Stack repeated L/R skips into one fading badge (10, 20, … / 30, 60, …). */
export function accumulateWatchSkipFeedback(
  current: WatchSkipFeedback | null,
  intent: "skip-back" | "skip-forward",
): WatchSkipFeedback {
  const direction = intent === "skip-back" ? "back" : "forward";
  const step = Math.abs(watchSkipDeltaSeconds(intent));
  if (current?.direction === direction) {
    return { direction, seconds: current.seconds + step };
  }
  return { direction, seconds: step };
}

export function isWatchBackKey(key: string): boolean {
  return key === "Escape" || key === "Backspace" || key === "GoBack";
}

export function isWatchConfirmKey(key: string): boolean {
  return key === "Enter" || key === "NumpadEnter" || key === "Select";
}

export type WatchBackAction =
  | "exit-after-countdown"
  | "close-search"
  | "appearance-to-menu"
  | "close-panel"
  | "hide-chrome"
  | "exit-watch";

/** One Back press peels one layer; exit only when nothing is open. */
export function resolveWatchBackAction(state: {
  countdown: boolean;
  subtitleSearchOpen: boolean;
  subtitleAppearanceOpen: boolean;
  panelOpen: boolean;
  controlsVisible: boolean;
}): WatchBackAction {
  if (state.countdown) return "exit-after-countdown";
  if (state.subtitleSearchOpen) return "close-search";
  if (state.subtitleAppearanceOpen) return "appearance-to-menu";
  if (state.panelOpen) return "close-panel";
  if (state.controlsVisible) return "hide-chrome";
  return "exit-watch";
}

export type WatchScrubKeyIntent = "commit" | "nudge-back" | "nudge-forward" | null;

export function watchScrubKeyIntent(key: string): WatchScrubKeyIntent {
  if (isWatchConfirmKey(key)) return "commit";
  if (key === "ArrowLeft" || key === "MediaRewind") return "nudge-back";
  if (key === "ArrowRight" || key === "MediaFastForward") return "nudge-forward";
  return null;
}

export function watchScrubNudgeStepPercent(
  totalDurationSeconds: number,
  stepSeconds = WATCH_SCRUB_NUDGE_SECONDS,
): number {
  if (!(totalDurationSeconds > 0)) return 2;
  return (stepSeconds / totalDurationSeconds) * 100;
}

export function nudgeScrubPreviewPercent(options: {
  currentPreview: number | null;
  displayedProgress: number;
  direction: "back" | "forward";
  totalDurationSeconds: number;
}): number {
  const step = watchScrubNudgeStepPercent(options.totalDurationSeconds);
  const base = options.currentPreview ?? options.displayedProgress;
  if (options.direction === "back") return Math.max(0, base - step);
  return Math.min(100, base + step);
}

export type ScrubCommitDecision = "commit" | "discard" | "noop";

/**
 * OK/click only. Blur, Back, and chrome hide discard the preview instead of
 * seeking. Always require a real timeline move — a no-op seek on native
 * stamps lastUserSeek and suppresses stall recovery for 12s.
 */
export function resolveScrubCommitDecision(options: {
  previewPercent: number | null;
  livePercent: number;
  totalDurationSeconds: number;
}): ScrubCommitDecision {
  if (options.previewPercent === null || !(options.totalDurationSeconds > 0)) {
    return "noop";
  }
  if (
    !shouldCommitScrubPreview({
      previewPercent: options.previewPercent,
      livePercent: options.livePercent,
      totalDurationSeconds: options.totalDurationSeconds,
    })
  ) {
    return "discard";
  }
  return "commit";
}

export type WatchChromeVerticalIntent =
  | "focus-play"
  | "focus-scrub"
  | "reveal-and-focus-play"
  | "consume";

export function watchChromeVerticalArrowIntent(state: {
  key: string;
  controlsVisible: boolean;
  focusOnScrub: boolean;
  focusOnTransport: boolean;
}): WatchChromeVerticalIntent | null {
  if (state.key === "ArrowDown") {
    if (state.controlsVisible && state.focusOnScrub) return "focus-play";
    return "reveal-and-focus-play";
  }
  if (state.key === "ArrowUp") {
    if (!state.controlsVisible) return "reveal-and-focus-play";
    if (state.focusOnTransport && !state.focusOnScrub) {
      return "focus-scrub";
    }
    // Scrub is the top focusable chrome — consume so WebView native nav
    // cannot jump to leftover catalog tiles.
    if (state.focusOnScrub) return "consume";
    return "reveal-and-focus-play";
  }
  return null;
}

/** Spatial nav should move between visible transport buttons, not skip. */
export function spatialNavShouldHandleWatchArrow(state: {
  watchPlayerActive: boolean;
  focusOnScrub: boolean;
  inWatchMenu: boolean;
  inWatchControls: boolean;
  key: string;
}): boolean {
  if (!state.watchPlayerActive) return true;
  // Transport/scrub D-pad is owned by watch-view. Catalog geometry here
  // steals Left into the hidden side nav.
  if (state.inWatchMenu) return true;
  return false;
}

export function moveWatchTransportFocus(
  items: readonly HTMLElement[],
  current: HTMLElement | null,
  direction: "left" | "right",
): HTMLElement | null {
  if (items.length === 0) return null;
  let index = current ? items.indexOf(current) : -1;
  if (index < 0 && current) {
    index = items.findIndex((item) => item.contains(current));
  }
  if (index < 0) {
    return direction === "right" ? items[0]! : items[items.length - 1]!;
  }
  const next = direction === "left" ? index - 1 : index + 1;
  if (next < 0 || next >= items.length) return items[index]!;
  return items[next]!;
}

export function clampAbsoluteSeekSeconds(
  seconds: number,
  durationSeconds: number,
): number {
  if (!(durationSeconds > 0)) return 0;
  return Math.max(0, Math.min(seconds, durationSeconds));
}

export type TvSeekPlan =
  | { kind: "noop-no-duration" }
  | { kind: "native-direct"; absoluteSeconds: number }
  | { kind: "native-hls-relative"; absoluteSeconds: number; relativeSeconds: number }
  | { kind: "native-hls-restart"; absoluteSeconds: number }
  | { kind: "web-direct"; absoluteSeconds: number }
  | { kind: "web-hls-relative"; absoluteSeconds: number; relativeSeconds: number }
  | { kind: "web-hls-restart"; absoluteSeconds: number }
  | { kind: "web-missing-video"; absoluteSeconds: number };

/** One seek decision for native/web × direct/HLS. */
export function resolveTvSeekPlan(options: {
  targetAbsoluteSeconds: number;
  totalDurationSeconds: number;
  usesNativePlayer: boolean;
  usingHls: boolean;
  hlsStartOffset: number;
  seekableEndRelative?: number;
  videoReadyState?: number;
  hasWebVideo?: boolean;
}): TvSeekPlan {
  if (!(options.totalDurationSeconds > 0)) {
    return { kind: "noop-no-duration" };
  }

  const absoluteSeconds = clampAbsoluteSeekSeconds(
    options.targetAbsoluteSeconds,
    options.totalDurationSeconds,
  );

  if (options.usesNativePlayer) {
    if (!options.usingHls) {
      return { kind: "native-direct", absoluteSeconds };
    }
    const action = resolveNativeHlsSeekAction({
      targetAbsoluteSeconds: absoluteSeconds,
      hlsStartOffset: options.hlsStartOffset,
    });
    if (action.kind === "restart") {
      return { kind: "native-hls-restart", absoluteSeconds: action.absoluteSeconds };
    }
    return {
      kind: "native-hls-relative",
      absoluteSeconds,
      relativeSeconds: action.relativeSeconds,
    };
  }

  if (options.hasWebVideo === false) {
    return { kind: "web-missing-video", absoluteSeconds };
  }

  if (!options.usingHls) {
    return { kind: "web-direct", absoluteSeconds };
  }

  const action = resolveHlsSeekAction({
    targetAbsoluteSeconds: absoluteSeconds,
    hlsStartOffset: options.hlsStartOffset,
    seekableEndRelative: options.seekableEndRelative,
    videoReadyState: options.videoReadyState,
  });
  if (action.kind === "restart") {
    return { kind: "web-hls-restart", absoluteSeconds: action.absoluteSeconds };
  }
  return {
    kind: "web-hls-relative",
    absoluteSeconds,
    relativeSeconds: action.relativeSeconds,
  };
}

export function watchMediaKeyIntent(
  key: string,
): "play" | "pause" | "toggle" | null {
  if (key === "MediaPlay") return "play";
  if (key === "MediaPause") return "pause";
  if (key === "MediaPlayPause") return "toggle";
  return null;
}
