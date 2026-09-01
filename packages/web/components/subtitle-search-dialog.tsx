"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import { api, type SubtitleSearchResult, type SubtitleTrack } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { TvWatchSideSheet } from "@/components/tv/tv-watch-settings-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { focusFirstWatchMenuItem, focusTvItem } from "@/lib/tv-focus";

function subtitleResultKey(result: SubtitleSearchResult) {
  return `${result.provider ?? "opensubtitles"}:${result.id}:${result.fileId}`;
}

function subtitleResultMeta(result: SubtitleSearchResult) {
  const parts = [
    result.sourceLabel ||
      (result.provider === "wyzie" ? "Wyzie" : "OpenSubtitles"),
    result.downloadCount > 0
      ? `${result.downloadCount.toLocaleString()} downloads`
      : null,
    result.hearingImpaired ? "HI" : null,
    result.uploader || null,
  ].filter(Boolean);
  return parts.join(" · ");
}

interface SubtitleSearchDialogProps {
  open: boolean;
  onClose: () => void;
  fileId: number;
  type: "movie" | "episode";
  opensubtitlesConfigured: boolean;
  wyzieConfigured: boolean;
  onDownloaded: (track: SubtitleTrack) => void;
  tv?: boolean;
}

export function SubtitleSearchDialog({
  open,
  onClose,
  fileId,
  type,
  opensubtitlesConfigured,
  wyzieConfigured,
  onDownloaded,
  tv = false,
}: SubtitleSearchDialogProps) {
  const [languages, setLanguages] = useState("en");
  const [results, setResults] = useState<SubtitleSearchResult[]>([]);
  const [contextTitle, setContextTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const firstResultRef = useRef<HTMLButtonElement>(null);
  const onlineSearchConfigured = opensubtitlesConfigured || wyzieConfigured;
  const sourceSummary = [
    opensubtitlesConfigured ? "OpenSubtitles" : null,
    wyzieConfigured ? "Wyzie" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  useEffect(() => {
    if (!open) {
      setResults([]);
      setError(null);
    }
  }, [open]);

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.searchSubtitles(fileId, type, languages);
      setResults(data.results);
      setContextTitle(
        data.context.seasonNumber !== undefined
          ? `${data.context.title} S${data.context.seasonNumber}E${data.context.episodeNumber}`
          : data.context.title,
      );
      if (!data.results.length) {
        setError("No subtitles found. Try another language code (e.g. en, es, fr).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && onlineSearchConfigured) {
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlineSearchConfigured]);

  useEffect(() => {
    if (!open || !tv) return;

    requestAnimationFrame(() => {
      if (results.length > 0 && firstResultRef.current) {
        focusTvItem(firstResultRef.current);
        return;
      }
      if (!focusFirstWatchMenuItem()) {
        closeButtonRef.current?.focus();
      }
    });
  }, [open, tv, onlineSearchConfigured, results.length, loading]);

  const handleDownload = async (result: SubtitleSearchResult) => {
    const key = subtitleResultKey(result);
    setDownloadingId(key);
    setError(null);
    try {
      const provider = result.provider ?? "opensubtitles";
      const { track } = await api.downloadSubtitle({
        fileId,
        type,
        provider,
        opensubtitlesFileId:
          provider === "opensubtitles" ? result.fileId : undefined,
        wyzieUrl: provider === "wyzie" ? result.url : undefined,
        wyzieId: provider === "wyzie" ? result.id : undefined,
        language: result.language,
        release: result.release,
      });
      onDownloaded(track);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  if (!open) return null;

  if (tv) {
    return (
      <TvWatchSideSheet>
        <aside data-tv-watch-menu="" className="flex h-full min-h-0 flex-col">
          <div
            data-tv-row=""
            data-tv-watch-menu-header=""
            className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white">Search subtitles</h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {contextTitle || sourceSummary || "Online subtitles"}
              </p>
            </div>
            <TvFocusButton
              ref={closeButtonRef}
              variant="nav"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
            >
              <X className="h-5 w-5" />
            </TvFocusButton>
          </div>

          {!onlineSearchConfigured ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <p>Add a free OpenSubtitles or Wyzie API key in Settings to search online subtitles.</p>
              <p>OpenSubtitles: opensubtitles.com → API consumers. Wyzie: store.wyzie.io/redeem.</p>
            </div>
          ) : (
            <>
              <div
                data-tv-row=""
                data-tv-content-row=""
                className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3"
              >
                <Input
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="Languages (en, es, fr)"
                  className="max-w-xs bg-muted/40 text-base text-white"
                />
                <TvFocusButton
                  ref={searchButtonRef}
                  onClick={runSearch}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </TvFocusButton>
              </div>

              <div
                data-tv-row=""
                data-tv-content-row=""
                data-tv-vertical=""
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
              >
                {loading ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Searching subtitles...
                  </p>
                ) : results.length ? (
                  results.map((result) => {
                    const key = subtitleResultKey(result);
                    return (
                      <TvFocusButton
                        key={key}
                        ref={result === results[0] ? firstResultRef : undefined}
                        variant="card"
                        disabled={downloadingId === key}
                        onClick={() => handleDownload(result)}
                        className="mb-1.5 flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-white">
                            {result.language.toUpperCase()}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {result.release}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {subtitleResultMeta(result)}
                          </p>
                        </div>
                        {downloadingId === key ? (
                          <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-primary" />
                        ) : (
                          <Download className="mt-1 h-5 w-5 shrink-0 text-primary" />
                        )}
                      </TvFocusButton>
                    );
                  })
                ) : (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {error ?? "No results yet"}
                  </p>
                )}
              </div>

              {error && results.length > 0 && (
                <p className="shrink-0 border-t border-white/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </p>
              )}
            </>
          )}
        </aside>
      </TvWatchSideSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold">Search subtitles</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {contextTitle || sourceSummary || "Online subtitles"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!onlineSearchConfigured ? (
          <div className="space-y-3 px-5 py-8 text-center text-sm text-muted-foreground">
            <p>Add a free OpenSubtitles or Wyzie API key in Settings to search online subtitles.</p>
            <p>
              OpenSubtitles:{" "}
              <a
                href="https://www.opensubtitles.com/en/consumers"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:text-accent"
              >
                API consumers
              </a>
              . Wyzie:{" "}
              <a
                href="https://store.wyzie.io/redeem"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:text-accent"
              >
                store.wyzie.io/redeem
              </a>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-border px-5 py-4">
              <Input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="Languages (en, es, fr)"
                className="max-w-xs"
              />
              <Button onClick={runSearch} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Searching subtitles...
                </p>
              ) : results.length ? (
                results.map((result) => {
                  const key = subtitleResultKey(result);
                  return (
                    <div
                      key={key}
                      className="flex items-start gap-3 rounded-md px-3 py-3 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{result.language.toUpperCase()}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {result.release}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {subtitleResultMeta(result)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadingId === key}
                        onClick={() => handleDownload(result)}
                      >
                        {downloadingId === key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Use
                      </Button>
                    </div>
                  );
                })
              ) : (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {error ?? "No results yet"}
                </p>
              )}
            </div>

            {error && results.length > 0 && (
              <p className={cn("border-t border-border px-5 py-3 text-sm text-red-400")}>
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
