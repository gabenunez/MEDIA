"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import {
  findNextEpisode,
  formatEpisodeLabel,
  NEXT_EPISODE_COUNTDOWN_SECONDS,
  resolveInitialStreamQuality,
  resolvePlaybackStream,
  type NextEpisodeInfo,
  type PlaybackMediaDetail,
} from "@/lib/playback-utils";

export interface NextEpisodeCountdownState extends NextEpisodeInfo {
  secondsLeft: number;
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
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const playNextEpisodeNow = useCallback(
    (next: NextEpisodeInfo) => {
      if (!mediaId) {
        onFinishedRef.current?.();
        return;
      }

      clearCountdown();
      onNavigate(routes.watch("episode", next.episode.id, parseInt(mediaId, 10)));
    },
    [clearCountdown, mediaId, onNavigate],
  );

  const startNextEpisodeCountdown = useCallback(() => {
    if (type !== "episode" || !mediaId || !media) {
      onFinishedRef.current?.();
      return;
    }

    const next = findNextEpisode(media, fileId);
    if (!next) {
      onFinishedRef.current?.();
      return;
    }

    setCountdown({
      ...next,
      secondsLeft: NEXT_EPISODE_COUNTDOWN_SECONDS,
    });

    void api
      .getStreamInfo(next.episode.id, "episode")
      .then((info) => {
        const initial = resolveInitialStreamQuality(info);
        const playback = resolvePlaybackStream(initial.quality, info);
        if (!playback.usingHls) return;

        void fetch(
          api.streamUrl(
            next.episode.id,
            "episode",
            initial.quality,
            0,
            0,
            playback.hlsQuality,
          ),
          { credentials: "include" },
        ).catch(() => {});
      })
      .catch(() => {});
  }, [type, mediaId, media, fileId]);

  useEffect(() => {
    if (!countdown) return;

    countdownTimerRef.current = setInterval(() => {
      setCountdown((current) => {
        if (!current) return null;
        if (current.secondsLeft <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          playNextEpisodeNow(current);
          return null;
        }
        return { ...current, secondsLeft: current.secondsLeft - 1 };
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [countdown?.episode.id, playNextEpisodeNow]);

  return {
    countdown,
    countdownLabel: countdown
      ? formatEpisodeLabel(countdown.episode, countdown.seasonNumber)
      : null,
    startNextEpisodeCountdown,
    cancelCountdown: clearCountdown,
    playNextEpisodeNow: () => {
      if (countdown) playNextEpisodeNow(countdown);
    },
  };
}
