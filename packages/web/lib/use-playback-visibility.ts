"use client";

import { useEffect, useRef } from "react";
import type Hls from "hls.js";
import { destroyHlsInstance } from "@/lib/playback-engine";

interface PlaybackVisibilityOptions {
  enabled: boolean;
  onSaveProgress: () => void;
  onVisible?: () => void;
}

/** Save watch progress when the tab is hidden; do not pause playback. */
export function usePlaybackVisibility(options: PlaybackVisibilityOptions): void {
  const { enabled, onSaveProgress, onVisible } = options;
  const onSaveProgressRef = useRef(onSaveProgress);
  onSaveProgressRef.current = onSaveProgress;
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        onSaveProgressRef.current();
        return;
      }
      onVisibleRef.current?.();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled]);
}

export function teardownWebPlayback(
  video: HTMLVideoElement | null,
  hls: Hls | null,
  onVideoError?: () => void,
): void {
  if (video && onVideoError) {
    video.removeEventListener("error", onVideoError);
  }
  destroyHlsInstance(hls);
}
