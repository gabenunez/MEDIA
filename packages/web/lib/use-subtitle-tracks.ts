"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SubtitleTrack } from "@/lib/watch-helpers";
import {
  readStoredSubtitleSelection,
  writeStoredSubtitleSelection,
} from "@/lib/subtitle-selection-storage";
import {
  attachPreparedWebSubtitle,
  clearSubtitleVttCache,
  clearWebSubtitleTracksFromVideo,
  evictSubtitleVttCache,
  installWebSubtitleVideoListeners,
  prefetchSubtitleTracks,
  prefetchSubtitleVtt,
  prepareWebSubtitleVtt,
  refreshWebSubtitleCues,
  subscribeWebPlaybackSourceReady,
  type SubtitleDisplayMode,
} from "@/lib/web-subtitle-attach";
import { SUBTITLE_STYLES_CHANGED_EVENT } from "@/lib/subtitle-styles";

function hasActiveSubtitleTrack(video: HTMLVideoElement): boolean {
  return Array.from(video.textTracks).some(
    (track) => track.kind === "subtitles" && track.mode !== "disabled",
  );
}

export function useSubtitleTracks(
  fileId: number,
  type: "movie" | "episode",
  videoRef: React.RefObject<HTMLVideoElement | null>,
  streamGeneration: number,
  timelineOffsetSeconds = 0,
  options?: { attachToVideo?: boolean; displayMode?: SubtitleDisplayMode },
) {
  const attachToVideo = options?.attachToVideo ?? true;
  const displayMode = options?.displayMode ?? "native";
  const usesDomOverlay = displayMode === "dom-overlay";
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);
  const [activeVtt, setActiveVtt] = useState<string | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [subtitleListError, setSubtitleListError] = useState<string | null>(null);
  const [opensubtitlesConfigured, setOpensubtitlesConfigured] = useState(false);
  const subtitlesRef = useRef(subtitles);
  const activeSubtitleRef = useRef(activeSubtitle);
  const timelineOffsetRef = useRef(timelineOffsetSeconds);
  const displayModeRef = useRef(displayMode);
  const syncGenerationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  subtitlesRef.current = subtitles;
  activeSubtitleRef.current = activeSubtitle;
  timelineOffsetRef.current = timelineOffsetSeconds;
  displayModeRef.current = displayMode;

  const refreshSubtitles = useCallback(
    async (ensureTrack?: SubtitleTrack) => {
      if (!fileId || Number.isNaN(fileId)) return;
      try {
        setSubtitleListError(null);
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
        setSubtitleListError(
          err instanceof Error ? err.message : "Couldn't load subtitle tracks.",
        );
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

  const clearSubtitleError = useCallback(() => {
    setSubtitleError(null);
  }, []);

  const failSubtitleLoad = useCallback(
    (message: string) => {
      setSubtitleError(message);
      setActiveVtt(null);
      setActiveSubtitle(null);
      writeStoredSubtitleSelection(fileId, type, null);
      const video = videoRef.current;
      if (video) clearWebSubtitleTracksFromVideo(video);
      revokeObjectUrl();
    },
    [fileId, type, revokeObjectUrl, videoRef],
  );

  const syncSubtitles = useCallback(async () => {
    if (!attachToVideo) return;

    const generation = ++syncGenerationRef.current;
    const subtitleId = activeSubtitleRef.current;
    const video = videoRef.current;
    const activeTrack = subtitlesRef.current.find((track) => track.id === subtitleId);
    const label = activeTrack?.language ?? "Subtitles";
    const shouldApply = () => generation === syncGenerationRef.current;

    if (subtitleId == null) {
      if (!shouldApply()) return;
      setActiveVtt(null);
      setSubtitleError(null);
      if (video) clearWebSubtitleTracksFromVideo(video);
      revokeObjectUrl();
      return;
    }

    const prepared = await prepareWebSubtitleVtt(subtitleId, timelineOffsetRef.current);
    if (!shouldApply()) return;
    if (!prepared.ok) {
      failSubtitleLoad(prepared.error);
      return;
    }

    setSubtitleError(null);

    if (usesDomOverlay) {
      setActiveVtt(prepared.vtt);
      return;
    }

    if (!video) return;
    revokeObjectUrl();
    objectUrlRef.current = attachPreparedWebSubtitle(
      video,
      prepared.vtt,
      label,
      displayModeRef.current,
    );
    refreshWebSubtitleCues(video);
  }, [attachToVideo, failSubtitleLoad, revokeObjectUrl, usesDomOverlay, videoRef]);

  const selectSubtitle = useCallback(
    (subtitleId: number | null) => {
      writeStoredSubtitleSelection(fileId, type, subtitleId);
      setSubtitleError(null);
      setActiveSubtitle(subtitleId);

      if (subtitleId == null) {
        setActiveVtt(null);
        if (attachToVideo) {
          const video = videoRef.current;
          if (video) clearWebSubtitleTracksFromVideo(video);
          revokeObjectUrl();
        }
        return;
      }

      void prefetchSubtitleVtt(subtitleId);
    },
    [attachToVideo, fileId, type, revokeObjectUrl, videoRef],
  );

  useEffect(() => {
    clearSubtitleVttCache();
    setSubtitles([]);
    setActiveVtt(null);
    setSubtitleError(null);
    setSubtitleListError(null);
    revokeObjectUrl();
    setActiveSubtitle(readStoredSubtitleSelection(fileId, type));
  }, [fileId, type, revokeObjectUrl]);

  useEffect(() => {
    refreshSubtitles();
  }, [refreshSubtitles]);

  useEffect(() => {
    void syncSubtitles();
  }, [activeSubtitle, timelineOffsetSeconds, streamGeneration, syncSubtitles]);

  useEffect(() => {
    if (!attachToVideo) return;
    const video = videoRef.current;
    if (!video) return;

    const onStylesChanged = () => {
      if (!usesDomOverlay) {
        refreshWebSubtitleCues(video);
      }
    };

    window.addEventListener(SUBTITLE_STYLES_CHANGED_EVENT, onStylesChanged);
    return () => {
      window.removeEventListener(SUBTITLE_STYLES_CHANGED_EVENT, onStylesChanged);
    };
  }, [attachToVideo, usesDomOverlay, videoRef, streamGeneration]);

  useEffect(() => {
    if (!attachToVideo) return;
    const video = videoRef.current;
    if (!video) return;

    const reload = () => {
      void syncSubtitles();
    };

    const resumeSubtitles = () => {
      if (activeSubtitleRef.current == null) return;
      if (usesDomOverlay) {
        void syncSubtitles();
        return;
      }
      if (hasActiveSubtitleTrack(video)) {
        refreshWebSubtitleCues(video);
        return;
      }
      void syncSubtitles();
    };

    const removeVideoListeners = installWebSubtitleVideoListeners(
      video,
      reload,
      displayModeRef.current,
    );
    const removePlaybackListener = subscribeWebPlaybackSourceReady(reload);

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
      removeVideoListeners();
      removePlaybackListener();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [attachToVideo, displayMode, streamGeneration, syncSubtitles, usesDomOverlay, videoRef]);

  useEffect(() => {
    if (!attachToVideo) return;
    return () => {
      const video = videoRef.current;
      if (video) clearWebSubtitleTracksFromVideo(video);
      revokeObjectUrl();
      setActiveVtt(null);
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
    activeVtt,
    subtitleError,
    subtitleListError,
    clearSubtitleError,
    setActiveSubtitle: selectSubtitle,
    selectSubtitle,
    prefetchMenuTracks,
    refreshSubtitles,
    removeSubtitleTrack,
    opensubtitlesConfigured,
  };
};
