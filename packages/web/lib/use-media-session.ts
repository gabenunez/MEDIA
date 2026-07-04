"use client";

import { useEffect } from "react";
import { APP_NAME } from "@media-app/shared";

interface MediaSessionOptions {
  title: string;
  posterUrl: string | null;
  isPlaying: boolean;
  enabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
}

export function useMediaSession(options: MediaSessionOptions): void {
  const {
    title,
    posterUrl,
    isPlaying,
    enabled = true,
    onPlay,
    onPause,
    onSeekBackward,
    onSeekForward,
  } = options;

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || APP_NAME,
      artwork: posterUrl ? [{ src: posterUrl, sizes: "512x512", type: "image/jpeg" }] : [],
    });

    navigator.mediaSession.setActionHandler("play", onPlay);
    navigator.mediaSession.setActionHandler("pause", onPause);
    navigator.mediaSession.setActionHandler("seekbackward", () => onSeekBackward());
    navigator.mediaSession.setActionHandler("seekforward", () => onSeekForward());

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [enabled, title, posterUrl, onPlay, onPause, onSeekBackward, onSeekForward]);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [enabled, isPlaying]);
}
