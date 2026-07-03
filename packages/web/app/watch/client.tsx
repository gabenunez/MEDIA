"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Hls from "hls.js";
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  Subtitles,
  Settings2,
} from "lucide-react";
import { api, type StreamQuality } from "@/lib/api";
import { routes } from "@/lib/routes";
import { cn, formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CastButton } from "@/components/cast-button";
import { SubtitleSearchDialog } from "@/components/subtitle-search-dialog";

interface SubtitleTrack {
  id: number;
  language: string;
  label?: string | null;
  source?: "external" | "embedded" | "opensubtitles";
}

function formatSubtitleLabel(sub: SubtitleTrack): string {
  const sourceLabel =
    sub.source === "opensubtitles"
      ? "Online"
      : sub.source === "embedded"
        ? "Embedded"
        : "File";
  const detail = sub.label ? sub.label.slice(0, 48) : sourceLabel;
  return `${sub.language} · ${detail}`;
}

function qualityLabel(quality: StreamQuality, sourceHeight?: number | null): string {
  if (quality === "original") {
    if (sourceHeight && sourceHeight >= 2160) return "Original (4K)";
    if (sourceHeight && sourceHeight >= 1080) return "Original (1080p)";
    if (sourceHeight && sourceHeight >= 720) return "Original (720p)";
    return "Original";
  }
  return quality.toUpperCase();
}

export function WatchClient() {
  const searchParams = useSearchParams();
  const type = (searchParams.get("type") ?? "movie") as "movie" | "episode";
  const fileId = parseInt(searchParams.get("id") ?? "", 10);
  const mediaId = searchParams.get("media");

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimeRef = useRef(0);

  const [quality, setQuality] = useState<StreamQuality>("original");
  const [availableQualities, setAvailableQualities] = useState<StreamQuality[]>([
    "original",
    "480p",
    "720p",
    "1080p",
  ]);
  const [sourceHeight, setSourceHeight] = useState<number | null>(null);
  const [transcodingEnabled, setTranscodingEnabled] = useState(true);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [subtitleSearchOpen, setSubtitleSearchOpen] = useState(false);
  const [opensubtitlesConfigured, setOpensubtitlesConfigured] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [posterPath, setPosterPath] = useState<string | null>(null);

  const revealControls = useCallback((autoHide = true) => {
    setShowControls(true);
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    const video = videoRef.current;
    if (autoHide && video && !video.paused) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setSubtitleMenuOpen(false);
        setQualityMenuOpen(false);
      }, 3000);
    }
  }, []);

  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration || !fileId) return;
    api.saveProgress({
      itemType: type === "movie" ? "movie" : "episode",
      itemId: fileId,
      positionMs: Math.floor(video.currentTime * 1000),
      durationMs: Math.floor(video.duration * 1000),
    }).catch(() => {});
  }, [fileId, type]);

  useEffect(() => {
    if (!fileId || Number.isNaN(fileId)) return;

    api
      .getStreamInfo(fileId, type === "movie" ? "movie" : "episode")
      .then((info) => {
        setAvailableQualities(info.availableQualities);
        setSourceHeight(info.height ?? null);
        setTranscodingEnabled(info.transcodingEnabled);
        setQuality((current) =>
          info.availableQualities.includes(current) ? current : "original",
        );
      })
      .catch(console.error);
  }, [fileId, type]);

  const refreshSubtitles = useCallback(async () => {
    if (!fileId || Number.isNaN(fileId)) return;
    try {
      const data = await api.listSubtitles(
        fileId,
        type === "movie" ? "movie" : "episode",
      );
      setSubtitles(data.tracks);
      setOpensubtitlesConfigured(data.opensubtitlesConfigured);
    } catch (err) {
      console.warn("Failed to load subtitles", err);
    }
  }, [fileId, type]);

  useEffect(() => {
    refreshSubtitles();
  }, [refreshSubtitles]);

  useEffect(() => {
    if (!mediaId || !fileId || Number.isNaN(fileId)) return;

    api.getMedia(parseInt(mediaId, 10)).then((data) => {
      setTitle((data as { title: string }).title);
      setPosterPath((data as { posterPath?: string | null }).posterPath ?? null);
    }).catch(console.error);
  }, [mediaId, fileId, type]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !fileId || Number.isNaN(fileId)) return;

    setError(null);
    setBuffering(quality !== "original");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const resumeAt = resumeTimeRef.current;
    const url = api.streamUrl(fileId, type === "movie" ? "movie" : "episode", quality);
    const usingHls = quality !== "original";

    const applyResume = () => {
      if (resumeAt > 0 && video.duration) {
        video.currentTime = Math.min(resumeAt, video.duration);
        resumeTimeRef.current = 0;
      }
    };

    if (usingHls) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setBuffering(false);
          applyResume();
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setBuffering(false);
            setError("Playback failed. Try a lower quality or Original.");
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.onloadedmetadata = () => {
          setBuffering(false);
          applyResume();
        };
        video.play().catch(() => {});
      } else {
        setBuffering(false);
        setError("HLS not supported in this browser");
      }
    } else {
      video.src = url;
      video.onloadedmetadata = () => {
        setBuffering(false);
        applyResume();
      };
      video.play().catch(() => {});
    }

    progressInterval.current = setInterval(saveProgress, 10000);

    return () => {
      video.onloadedmetadata = null;
      if (hlsRef.current) hlsRef.current.destroy();
      if (progressInterval.current) clearInterval(progressInterval.current);
      saveProgress();
    };
  }, [fileId, type, quality, saveProgress]);

  const changeQuality = useCallback(
    (nextQuality: StreamQuality) => {
      const video = videoRef.current;
      if (video && video.currentTime > 0) {
        resumeTimeRef.current = video.currentTime;
      }
      setQuality(nextQuality);
      setQualityMenuOpen(false);
      revealControls(true);
    },
    [revealControls],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      revealControls(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      revealControls(false);
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onLoadedMetadata = () => setDuration(video.duration || 0);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [revealControls]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const existingTracks = video.querySelectorAll("track");
    existingTracks.forEach((t) => t.remove());

    if (activeSubtitle !== null) {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.src = api.subtitleUrl(activeSubtitle);
      track.default = true;
      track.label = subtitles.find((s) => s.id === activeSubtitle)?.language ?? "Subtitles";
      video.appendChild(track);
      track.track.mode = "showing";
    }
  }, [activeSubtitle, subtitles]);

  const handleCast = useCallback(async () => {
    const video = videoRef.current;
    const prepared = await api.prepareCast({
      fileId,
      type: type === "movie" ? "movie" : "episode",
      subtitleId: activeSubtitle ?? undefined,
      title: title || undefined,
      posterPath,
      startTimeMs: video ? Math.floor(video.currentTime * 1000) : 0,
    });

    if (video) video.pause();

    return {
      contentUrl: prepared.contentUrl,
      contentType: prepared.contentType,
      title: prepared.title,
      posterUrl: prepared.posterUrl,
      subtitleUrl: prepared.subtitleUrl,
      subtitleLanguage: subtitles.find((s) => s.id === activeSubtitle)?.language,
      startTime: prepared.startTime,
    };
  }, [fileId, type, activeSubtitle, title, posterPath, subtitles]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    revealControls(!video.paused);
  }, [revealControls]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      togglePlay();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = (value / 100) * duration;
    revealControls(true);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!fileId || Number.isNaN(fileId)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">Invalid playback URL</p>
          <Button asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-40 bg-background"
      onMouseMove={() => revealControls(true)}
      onTouchStart={() => revealControls(true)}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        controls={false}
        playsInline
        onClick={togglePlay}
      />

      {buffering && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <p className="rounded-md border border-white/10 bg-background/80 px-4 py-2 text-sm text-white">
            {quality === "original"
              ? "Loading..."
              : `Transcoding to ${quality.toUpperCase()}...`}
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <p className="mb-4 text-red-400">{error}</p>
            <Button onClick={() => changeQuality("original")}>Try Original</Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300 pointer-events-none",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto bg-gradient-to-b from-background/95 via-background/45 to-transparent px-3 pb-8 pt-3 sm:px-4">
          <div className="mx-auto flex max-w-7xl items-center gap-3 rounded-md border border-white/10 bg-background/65 px-2 py-2 backdrop-blur">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              asChild
            >
              <Link href={mediaId ? routes.media(parseInt(mediaId, 10)) : "/"}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="font-mono text-[0.62rem] uppercase text-primary">
                Now playing
              </p>
              <h1 className="truncate text-base font-medium text-white sm:text-lg">
                {title}
              </h1>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto bg-gradient-to-t from-background/95 via-background/45 to-transparent px-3 pb-3 pt-10 sm:px-4 sm:pb-4">
          <div className="mx-auto max-w-7xl rounded-md border border-white/10 bg-background/75 p-3 backdrop-blur">
            <div className="mb-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progress}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="range-signal h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
              />
            </div>

            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={togglePlay}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>

                <span className="hidden min-w-[5.5rem] text-sm tabular-nums text-white/80 sm:inline">
                  {formatDuration(currentTime * 1000)} /{" "}
                  {formatDuration(duration * 1000)}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "text-white hover:bg-white/10",
                      activeSubtitle !== null && "text-primary",
                    )}
                    onClick={() => {
                      setSubtitleMenuOpen((open) => !open);
                      setQualityMenuOpen(false);
                    }}
                  >
                    <Subtitles className="h-4 w-4" />
                  </Button>
                  {subtitleMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 min-w-56 rounded-md border border-border bg-card p-1 shadow-xl">
                      <button
                        className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setActiveSubtitle(null);
                          setSubtitleMenuOpen(false);
                        }}
                      >
                        Off
                      </button>
                      {subtitles.map((sub) => (
                        <div
                          key={sub.id}
                          className={cn(
                            "flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted",
                            activeSubtitle === sub.id && "bg-primary/10",
                          )}
                        >
                          <button
                            className={cn(
                              "min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm",
                              activeSubtitle === sub.id && "text-primary",
                            )}
                            onClick={() => {
                              setActiveSubtitle(sub.id);
                              setSubtitleMenuOpen(false);
                            }}
                          >
                            {formatSubtitleLabel(sub)}
                          </button>
                          {sub.source === "opensubtitles" && (
                            <button
                              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-red-400"
                              onClick={async () => {
                                await api.deleteSubtitle(sub.id);
                                if (activeSubtitle === sub.id) {
                                  setActiveSubtitle(null);
                                }
                                await refreshSubtitles();
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <button
                        className="block w-full rounded px-3 py-1.5 text-left text-sm text-primary hover:bg-muted"
                        onClick={() => {
                          setSubtitleMenuOpen(false);
                          setSubtitleSearchOpen(true);
                        }}
                      >
                        Search online...
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10"
                    onClick={() => {
                      setQualityMenuOpen((open) => !open);
                      setSubtitleMenuOpen(false);
                    }}
                    disabled={!transcodingEnabled && quality === "original"}
                  >
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {qualityLabel(quality, sourceHeight)}
                    </span>
                  </Button>
                  {qualityMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 min-w-40 rounded-md border border-border bg-card p-1 shadow-xl">
                      {availableQualities.map((option) => (
                        <button
                          key={option}
                          className={cn(
                            "block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted",
                            quality === option && "bg-primary/10 text-primary",
                            option !== "original" &&
                              !transcodingEnabled &&
                              "cursor-not-allowed opacity-50",
                          )}
                          disabled={option !== "original" && !transcodingEnabled}
                          onClick={() => changeQuality(option)}
                        >
                          {qualityLabel(option, sourceHeight)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <CastButton
                  onCast={handleCast}
                  className="text-white hover:bg-white/10"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className="h-5 w-5" />
                  ) : (
                    <Maximize className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SubtitleSearchDialog
        open={subtitleSearchOpen}
        onClose={() => setSubtitleSearchOpen(false)}
        fileId={fileId}
        type={type === "movie" ? "movie" : "episode"}
        opensubtitlesConfigured={opensubtitlesConfigured}
        onDownloaded={(track) => {
          setSubtitles((current) => {
            const exists = current.some((entry) => entry.id === track.id);
            return exists ? current : [...current, track];
          });
          setActiveSubtitle(track.id);
          refreshSubtitles();
        }}
      />
    </div>
  );
}
