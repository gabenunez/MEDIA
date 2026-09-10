"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import {
  findNextEpisode,
  formatEpisodeLabel,
  NEXT_EPISODE_COUNTDOWN_SECONDS,
  remainingInNextEpisodeWindow,
  resolveInitialStreamQuality,
  resolvePlaybackStream,
  type NextEpisodeInfo,
  type PlaybackMediaDetail,
} from "@/lib/playback-utils";
import { preloadNextEpisodeArtwork } from "@/lib/prefetch-artwork";
import {
  readStoredItemPlaybackQuality,
  readStoredPlaybackQuality,
} from "@/lib/quality-selection-storage";

export interface NextEpisodeCountdownState extends NextEpisodeInfo {
  secondsLeft: number;
}

function displaySecondsLeft(remaining: number): number {
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining));
}

export function useNextEpisodeCountdown(options: {
  type: "movie" | "episode";
  fileId: number;
  mediaId: string | null;
  media: PlaybackMediaDetail | null;
  onNavigate: (href: string) => void;
  onFinished?: () => void;
}) {
  const { type, fileId, mediaId, media, onNavigate, onFinished } = options;
  const [countdown, setCountdown] = useState<NextEpisodeCountdownState | null>(null);
  const onFinishedRef = useRef(onFinished);
  const dismissedRef = useRef(false);
  const navigatingRef = useRef(false);
  const mediaRef = useRef(media);
  const countdownRef = useRef(countdown);
  onFinishedRef.current = onFinished;
  mediaRef.current = media;
  countdownRef.current = countdown;

  const clearCountdown = useCallback(() => {
    setCountdown(null);
  }, []);

  const playNextEpisodeNow = useCallback(
    (next: NextEpisodeInfo) => {
      if (navigatingRef.current) return;
      if (!mediaId) {
        onFinishedRef.current?.();
        return;
      }

      navigatingRef.current = true;
      clearCountdown();
      onNavigate(routes.watch("episode", next.episode.id, parseInt(mediaId, 10)));
    },
    [clearCountdown, mediaId, onNavigate],
  );

  const warmNextEpisodeStream = useCallback((next: NextEpisodeInfo) => {
    void api
      .getStreamInfo(next.episode.id, "episode")
      .then((info) => {
        const itemQuality = readStoredItemPlaybackQuality(
          "episode",
          next.episode.id,
        );
        const initial = resolveInitialStreamQuality(info, {
          preferredQuality: itemQuality ?? readStoredPlaybackQuality(),
          allowFpsQualityAuto: false,
        });
        const playback = resolvePlaybackStream(initial.quality, info);
        const relativeUrl = api.streamUrl(
          next.episode.id,
          "episode",
          initial.quality,
          playback.usingHls ? 0 : undefined,
          0,
          playback.hlsQuality,
        );

        if (playback.usingHls || !playback.audioCompatNotice) {
          void fetch(relativeUrl, { credentials: "include" }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const resolveNext = useCallback((): NextEpisodeInfo | null => {
    if (type !== "episode" || !mediaId) return null;
    const detail = mediaRef.current;
    if (!detail) return null;
    return findNextEpisode(detail, fileId);
  }, [type, mediaId, fileId]);

  const showOrUpdateCountdown = useCallback(
    (next: NextEpisodeInfo, remaining: number) => {
      const secondsLeft = displaySecondsLeft(remaining);
      const detail = mediaRef.current;
      setCountdown((current) => {
        if (
          current &&
          current.episode.id === next.episode.id &&
          current.secondsLeft === secondsLeft
        ) {
          return current;
        }
        if (!current || current.episode.id !== next.episode.id) {
          preloadNextEpisodeArtwork(next, detail);
          warmNextEpisodeStream(next);
        }
        return { ...next, secondsLeft };
      });
    },
    [warmNextEpisodeStream],
  );

  /** Drive the card from the playhead — appears in the last N seconds. */
  const syncPlaybackProgress = useCallback(
    (absoluteSeconds: number, durationSeconds: number) => {
      if (navigatingRef.current || dismissedRef.current) return;
      if (type !== "episode" || !mediaId) return;

      const remaining = remainingInNextEpisodeWindow(
        absoluteSeconds,
        durationSeconds,
        NEXT_EPISODE_COUNTDOWN_SECONDS,
      );

      if (remaining === null) {
        // Seeked back out of the window — hide, but allow it again later.
        if (countdownRef.current) clearCountdown();
        return;
      }

      const next = resolveNext();
      if (!next) return;

      // End of file is handled by notifyPlaybackEnded to avoid double navigate.
      if (remaining <= 0.05) return;

      showOrUpdateCountdown(next, remaining);
    },
    [
      type,
      mediaId,
      resolveNext,
      showOrUpdateCountdown,
      clearCountdown,
    ],
  );

  /**
   * Episode ended. Play next unless the user cancelled the prompt, or leave
   * watch when there is no next episode.
   */
  const notifyPlaybackEnded = useCallback(() => {
    if (navigatingRef.current) return;

    if (type !== "episode" || !mediaId) {
      onFinishedRef.current?.();
      return;
    }

    if (dismissedRef.current) {
      onFinishedRef.current?.();
      return;
    }

    const next = resolveNext() ?? countdownRef.current;
    if (!next) {
      onFinishedRef.current?.();
      return;
    }

    playNextEpisodeNow(next);
  }, [type, mediaId, resolveNext, playNextEpisodeNow]);

  const cancelCountdown = useCallback(() => {
    dismissedRef.current = true;
    clearCountdown();
  }, [clearCountdown]);

  useEffect(() => {
    dismissedRef.current = false;
    navigatingRef.current = false;
    clearCountdown();
  }, [fileId, clearCountdown]);

  useEffect(() => {
    if (type !== "episode" || !media) return;
    const next = findNextEpisode(media, fileId);
    if (!next) return;
    preloadNextEpisodeArtwork(next, media);
  }, [type, media, fileId]);

  return {
    countdown,
    countdownLabel: countdown
      ? formatEpisodeLabel(countdown.episode, countdown.seasonNumber)
      : null,
    syncPlaybackProgress,
    notifyPlaybackEnded,
    /** @deprecated Prefer syncPlaybackProgress + notifyPlaybackEnded */
    startNextEpisodeCountdown: notifyPlaybackEnded,
    cancelCountdown,
    playNextEpisodeNow: () => {
      const next = countdownRef.current ?? resolveNext();
      if (next) playNextEpisodeNow(next);
    },
  };
}
