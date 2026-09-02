import type { SubtitleStyles } from "@/lib/subtitle-styles";
import { withBasePath } from "@/lib/base-path";
import {
  resolveNativeSubtitleApplyMode,
  resolveNativeSubtitleTransport,
  shouldRebuildNativePlaybackForSubtitleChange,
} from "@/lib/native-subtitle-hot-swap";

export interface NativePlaybackRequest {
  url: string;
  title: string;
  posterUrl?: string;
  fileId: number;
  itemType: "movie" | "episode";
  startSeconds: number;
  durationMs: number;
  isHls: boolean;
  subtitleUrl?: string;
  /** Server-reported HDR metadata — native player passes HDR through to the panel. */
  isHdr?: boolean;
  /** Source carries a Dolby Vision layer — keep DV output engaged natively. */
  dolbyVision?: boolean;
  /** Keep the current native player running until this request can take over. */
  handoff?: boolean;
}

export interface NativePlaybackState {
  currentTime: number;
  duration: number;
  /** Highest buffered position in seconds (player timeline). */
  buffered: number;
  bufferedRanges?: Array<{ start: number; end: number }>;
  isPlaying: boolean;
  isBuffering: boolean;
  /**
   * Sticky: true after ExoPlayer has reached READY at least once this session.
   * Combined with isBuffering this means mid-playback rebuffer (not cold start).
   */
  ready: boolean;
  /** Bumps when ExoPlayer actually presents this session (after a quality handoff swap). */
  playbackEpoch?: number;
}

export type NativeVideoDisplayMode = "fit" | "fill" | "stretch";

type AndroidBridge = NonNullable<Window["MediaAndroid"]>;

interface NativePlayerBridge {
  onState?: (state: NativePlaybackState) => void;
  onError?: () => void;
  onEnded?: () => void;
}

function getAndroidBridge(): AndroidBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.MediaAndroid ?? window.ReelAndroid;
}

export function nativeTvPlayerAvailable(): boolean {
  return typeof getAndroidBridge()?.play === "function";
}

export function androidTvShellSupportsLogout(): boolean {
  return typeof getAndroidBridge()?.logout === "function";
}

export function toAbsoluteMediaUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const prefixed = withBasePath(path.startsWith("/") ? path : `/${path}`);
  if (typeof window === "undefined") return prefixed;
  return new URL(prefixed, window.location.origin).toString();
}

export function prepareNativeVideoOverlay(): void {
  getAndroidBridge()?.prepareNativeVideo?.();
}

export function startNativePlayback(request: NativePlaybackRequest): void {
  getAndroidBridge()?.play?.(JSON.stringify(request));
}

export function pauseNativePlayback(): void {
  getAndroidBridge()?.pause?.();
}

export function resumeNativePlayback(): void {
  getAndroidBridge()?.resume?.();
}

export function seekNativePlayback(positionMs: number): void {
  getAndroidBridge()?.seekTo?.(positionMs);
}

export function stopNativePlayback(): void {
  getAndroidBridge()?.stop?.();
}

/** Swap subtitle track without tearing down native playback. Returns false if unsupported. */
export function updateNativeSubtitles(subtitleUrl?: string): boolean {
  const bridge = getAndroidBridge();
  if (typeof bridge?.setSubtitles !== "function") return false;
  return bridge.setSubtitles(subtitleUrl ?? "") === true;
}

/** Apply already-fetched VTT to the native overlay. Instant when the cache is warm. */
export function updateNativeSubtitleVtt(vtt: string): boolean {
  const bridge = getAndroidBridge();
  if (typeof bridge?.setSubtitleVtt !== "function") return false;
  try {
    return bridge.setSubtitleVtt(vtt) === true;
  } catch {
    return false;
  }
}

/** Caption change for the current native session — overlay only, never rebuilds video. */
export function applyNativeSubtitleTrack(options: {
  subtitleUrl?: string;
  vtt?: string | null;
}): boolean {
  const bridge = getAndroidBridge();
  if (!bridge) return false;
  const mode = resolveNativeSubtitleApplyMode(bridge);
  if (shouldRebuildNativePlaybackForSubtitleChange(mode)) return false;

  const transport = resolveNativeSubtitleTransport(options);
  if (transport === "off") {
    return updateNativeSubtitles(undefined);
  }
  if (transport === "vtt" && options.vtt && updateNativeSubtitleVtt(options.vtt)) {
    return true;
  }
  if (options.subtitleUrl) {
    return updateNativeSubtitles(options.subtitleUrl);
  }
  return false;
}

export function setNativeVideoDisplayMode(mode: NativeVideoDisplayMode): void {
  getAndroidBridge()?.setVideoDisplayMode?.(mode);
}

/** Re-sync play/pause UI after the WebView resumes from background. */
export function syncNativePlaybackState(): void {
  getAndroidBridge()?.syncPlaybackState?.();
}

let lastNativeWebOverlayAlpha: number | null = null;

/** Hide the WebView layer during native playback so it does not dim ExoPlayer below. */
export function setNativeWebOverlayAlpha(alpha: number, force = false): void {
  const clamped = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  if (!force && lastNativeWebOverlayAlpha === clamped) return;
  lastNativeWebOverlayAlpha = clamped;
  getAndroidBridge()?.setWebOverlayAlpha?.(clamped);
}

/**
 * Put the WebView in front of ExoPlayer so HTML chrome can paint.
 *
 * Older APKs skip setWebOverlayAlpha(1) when the last value was already 1,
 * leaving the player view in front after the previous title hid chrome.
 * Pulse 0→1 on those builds so z-order is re-applied.
 */
export function raiseNativeWebOverlay(): void {
  const bridge = getAndroidBridge();
  if (typeof bridge?.raiseWebOverlay === "function") {
    lastNativeWebOverlayAlpha = 1;
    bridge.raiseWebOverlay();
    return;
  }
  if (lastNativeWebOverlayAlpha === 1) {
    setNativeWebOverlayAlpha(0, true);
  }
  setNativeWebOverlayAlpha(1, true);
}

/** Native TV startup splash — dismiss once web UI is painted. */
export function notifyAndroidTvBootReady(): void {
  getAndroidBridge()?.notifyTvBootReady?.();
}

/** Apply user subtitle appearance settings to ExoPlayer's SubtitleView. */
export function setNativeSubtitleStyles(styles: SubtitleStyles): void {
  const bridge = getAndroidBridge();
  if (typeof bridge?.setSubtitleStyles !== "function") return;
  bridge.setSubtitleStyles(JSON.stringify(styles));
}

export function nativeSubtitleStylesAvailable(): boolean {
  return typeof getAndroidBridge()?.setSubtitleStyles === "function";
}

export function registerNativePlayerHandlers(handlers: {
  onState?: (state: NativePlaybackState) => void;
  onError?: () => void;
  onEnded?: () => void;
}): () => void {
  const bridge: NativePlayerBridge = {
    onState: (state: NativePlaybackState) => handlers.onState?.(state),
    onError: () => handlers.onError?.(),
    onEnded: () => handlers.onEnded?.(),
  };

  window.__mediaNativePlayer = bridge;
  window.__reelNativePlayer = bridge;

  return () => {
    delete window.__mediaNativePlayer;
    delete window.__reelNativePlayer;
  };
}

/** TV shell calls this before default WebView/history back navigation. */
export function registerWatchBackHandler(handler: (() => boolean) | undefined): () => void {
  if (typeof window === "undefined") return () => {};
  window.__mediaWatchHandleBack = handler;
  return () => {
    delete window.__mediaWatchHandleBack;
  };
}

export function notifyAndroidLogout() {
  if (typeof window === "undefined") return;
  getAndroidBridge()?.logout();
}

declare global {
  interface Window {
    MediaAndroid?: {
      logout: () => void;
      prepareNativeVideo?: () => void;
      play: (payload: string) => void;
      pause: () => void;
      resume: () => void;
      seekTo: (positionMs: number) => void;
      stop: () => void;
      setSubtitles?: (subtitleUrl: string) => boolean;
      setSubtitleVtt?: (vtt: string) => boolean;
      setSubtitleStyles?: (json: string) => boolean;
      setVideoDisplayMode?: (mode: NativeVideoDisplayMode) => void;
      syncPlaybackState?: () => void;
      setWebOverlayAlpha?: (alpha: number) => void;
      raiseWebOverlay?: () => void;
      notifyTvBootReady?: () => void;
    };
    /** Legacy Android TV shell before MEDIA! rebrand. */
    ReelAndroid?: Window["MediaAndroid"];
    /** Legacy callback target for older TV APKs. */
    __reelNativePlayer?: NativePlayerBridge;
    __mediaNativePlayer?: NativePlayerBridge;
    /** Watch view back handler for Android TV remote. Return true when consumed. */
    __mediaWatchHandleBack?: () => boolean;
  }
}

export {};
