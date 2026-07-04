export interface NativePlaybackRequest {
  url: string;
  title: string;
  fileId: number;
  itemType: "movie" | "episode";
  startSeconds: number;
  durationMs: number;
  isHls: boolean;
  subtitleUrl?: string;
}

export interface NativePlaybackState {
  currentTime: number;
  duration: number;
  buffered: number;
  isPlaying: boolean;
  isBuffering: boolean;
  ready: boolean;
}

export function nativeTvPlayerAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.MediaAndroid?.play === "function";
}

export function toAbsoluteMediaUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

export function startNativePlayback(request: NativePlaybackRequest): void {
  window.MediaAndroid?.play?.(JSON.stringify(request));
}

export function pauseNativePlayback(): void {
  window.MediaAndroid?.pause?.();
}

export function resumeNativePlayback(): void {
  window.MediaAndroid?.resume?.();
}

export function seekNativePlayback(positionMs: number): void {
  window.MediaAndroid?.seekTo?.(positionMs);
}

export function stopNativePlayback(): void {
  window.MediaAndroid?.stop?.();
}

export function registerNativePlayerHandlers(handlers: {
  onState?: (state: NativePlaybackState) => void;
  onError?: () => void;
  onEnded?: () => void;
}): () => void {
  window.__mediaNativePlayer = {
    onState: (state: NativePlaybackState) => handlers.onState?.(state),
    onError: () => handlers.onError?.(),
    onEnded: () => handlers.onEnded?.(),
  };

  return () => {
    delete window.__mediaNativePlayer;
  };
}

export function notifyAndroidLogout() {
  if (typeof window === "undefined") return;
  window.MediaAndroid?.logout();
}

declare global {
  interface Window {
    MediaAndroid?: {
      logout: () => void;
      play: (payload: string) => void;
      pause: () => void;
      resume: () => void;
      seekTo: (positionMs: number) => void;
      stop: () => void;
    };
    __mediaNativePlayer?: {
      onState?: (state: NativePlaybackState) => void;
      onError?: () => void;
      onEnded?: () => void;
    };
  }
}

export {};
