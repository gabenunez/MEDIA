"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SubtitleTrack } from "@/lib/watch-helpers";
import {
  readStoredSubtitleSelection,
  writeStoredSubtitleSelection,
} from "@/lib/subtitle-selection-storage";
import {
  attachCachedWebSubtitle,
  clearSubtitleVttCache,
  clearWebSubtitleTracksFromVideo,
  evictSubtitleVttCache,
  installWebSubtitleVideoListeners,
  prefetchSubtitleTracks,
  prefetchSubtitleVtt,
  refreshWebSubtitleCues,
  subscribeWebPlaybackSourceReady,
  syncWebSubtitleTrack,
} from "@/lib/web-subtitle-attach";
import { SUBTITLE_STYLES_CHANGED_EVENT } from "@/lib/subtitle-styles";

function hasShowingSubtitleTrack(video: HTMLVideoElement): boolean {
  return Array.from(video.textTracks).some(
    (track) => track.kind === "subtitles" && track.mode === "showing",
  );
}

export function useSubtitleTracks(
  fileId: number,
  type: "movie" | "episode",
  videoRef: React.RefObject<HTMLVideoElement | null>,
  streamGeneration: number,
  timelineOffsetSeconds = 0,
  options?: { attachToVideo?: boolean },
) {
  const attachToVideo = options?.attachToVideo ?? true;
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);
  const [opensubtitlesConfigured, setOpensubtitlesConfigured] = useState(false);
  const subtitlesRef = useRef(subtitles);
  const activeSubtitleRef = useRef(activeSubtitle);
  const timelineOffsetRef = useRef(timelineOffsetSeconds);
  const syncRef = useRef<(() => void) | null>(null);
  const syncGenerationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  subtitlesRef.current = subtitles;
  activeSubtitleRef.current = activeSubtitle;
  timelineOffsetRef.current = timelineOffsetSeconds;

  const refreshSubtitles = useCallback(
    async (ensureTrack?: SubtitleTrack) => {
      if (!fileId || Number.isNaN(fileId)) return;
      try {
        const data = await api.listSubtitles(
          fileId,
          type === "movie" ? "movie" : "episode",
        );
        const tracks =
          ensureTrack && !data.tracks.some((track) => track.id === ensureTrack.id)
            ? [...data.tracks, ensureTrack]
            : data.tracks;
        setSubtitles(tracks);
        setActiveSubtitle((current) => {
          const stored = readStoredSubtitleSelection(fileId, type);
          const keepId = current ?? stored ?? ensureTrack?.id ?? null;
          if (keepId && tracks.some((track) => track.id === keepId)) {
            return keepId;
          }
          return null;
        });
        setOpensubtitlesConfigured(data.opensubtitlesConfigured);
        prefetchSubtitleTracks(tracks.map((track) => track.id));
        const storedId = readStoredSubtitleSelection(fileId, type);
        if (storedId && tracks.some((track) => track.id === storedId)) {
          void prefetchSubtitleVtt(storedId);
        }
      } catch (err) {
        console.warn("Failed to load subtitles", err);
      }
    },
    [fileId, type],
  );

  const prefetchMenuTracks = useCallback(() => {
    prefetchSubtitleTracks(subtitlesRef.current.map((track) => track.id));
    const activeId = activeSubtitleRef.current;
    if (activeId != null) {
      void prefetchSubtitleVtt(activeId);
    }
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const selectSubtitle = useCallback(
    (subtitleId: number | null) => {
      writeStoredSubtitleSelection(fileId, type, subtitleId);

      if (attachToVideo) {
        if (subtitleId != null) {
          void prefetchSubtitleVtt(subtitleId);
          const video = videoRef.current;
          const activeTrack = subtitlesRef.current.find((track) => track.id === subtitleId);
          if (video) {
            revokeObjectUrl();
            objectUrlRef.current = attachCachedWebSubtitle(
              video,
              subtitleId,
              activeTrack?.language ?? "Subtitles",
              timelineOffsetRef.current,
            );
          }
        } else {
          const video = videoRef.current;
          if (video) clearWebSubtitleTracksFromVideo(video);
          revokeObjectUrl();
        }
        queueMicrotask(() => syncRef.current?.());
      } else if (subtitleId != null) {
        void prefetchSubtitleVtt(subtitleId);
      }

      setActiveSubtitle(subtitleId);
    },
    [attachToVideo, fileId, type, revokeObjectUrl, videoRef],
  );

  useEffect(() => {
    clearSubtitleVttCache();
    setSubtitles([]);
    revokeObjectUrl();
    setActiveSubtitle(readStoredSubtitleSelection(fileId, type));
  }, [fileId, type, revokeObjectUrl]);

  useEffect(() => {
    refreshSubtitles();
  }, [refreshSubtitles]);

  useEffect(() => {
    if (!attachToVideo) return;
    const video = videoRef.current;
    if (!video) return;

    const onStylesChanged = () => {
      refreshWebSubtitleCues(video);
    };

    window.addEventListener(SUBTITLE_STYLES_CHANGED_EVENT, onStylesChanged);
    return () => {
      window.removeEventListener(SUBTITLE_STYLES_CHANGED_EVENT, onStylesChanged);
    };
  }, [attachToVideo, videoRef, streamGeneration]);

  useEffect(() => {
    if (!attachToVideo) return;
    const video = videoRef.current;
    if (!video) return;

    const controller = new AbortController();

    const sync = () => {
      const generation = ++syncGenerationRef.current;
      const subtitleId = activeSubtitleRef.current;
      const activeTrack = subtitlesRef.current.find((track) => track.id === subtitleId);
      revokeObjectUrl();
      void syncWebSubtitleTrack(
        video,
        subtitleId,
        activeTrack?.language ?? "Subtitles",
        controller.signal,
        timelineOffsetRef.current,
      ).then((nextUrl) => {
        if (controller.signal.aborted || generation !== syncGenerationRef.current) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrlRef.current = nextUrl;
        if (subtitleId != null) {
          refreshWebSubtitleCues(video);
        }
      });
    };

    const resumeSubtitles = () => {
      if (activeSubtitleRef.current == null) return;
      if (hasShowingSubtitleTrack(video)) {
        refreshWebSubtitleCues(video);
        return;
      }
      sync();
    };

    syncRef.current = sync;
    sync();

    const removeVideoListeners = installWebSubtitleVideoListeners(video, sync);
    const removePlaybackListener = subscribeWebPlaybackSourceReady(sync);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        resumeSubtitles();
      }
    };
    const onPageShow = () => {
      resumeSubtitles();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      syncRef.current = null;
      controller.abort();
      removeVideoListeners();
      removePlaybackListener();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [activeSubtitle, attachToVideo, streamGeneration, timelineOffsetSeconds, videoRef, revokeObjectUrl]);

  useEffect(() => {
    if (!attachToVideo) return;
    return () => {
      const video = videoRef.current;
      if (video) clearWebSubtitleTracksFromVideo(video);
      revokeObjectUrl();
    };
  }, [attachToVideo, videoRef, fileId, type, revokeObjectUrl]);

  const removeSubtitleTrack = useCallback(
    async (subtitleId: number) => {
      await api.deleteSubtitle(subtitleId);
      evictSubtitleVttCache(subtitleId);
      if (activeSubtitleRef.current === subtitleId) {
        selectSubtitle(null);
      }
      await refreshSubtitles();
    },
    [refreshSubtitles, selectSubtitle],
  );

  return {
    subtitles,
    activeSubtitle,
    setActiveSubtitle: selectSubtitle,
    selectSubtitle,
    prefetchMenuTracks,
    refreshSubtitles,
    removeSubtitleTrack,
    opensubtitlesConfigured,
  };
};
