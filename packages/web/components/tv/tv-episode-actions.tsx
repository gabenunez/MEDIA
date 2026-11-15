"use client";

import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL, cn } from "@/lib/utils";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";

/**
 * Per-episode actions revealed when the user presses Right on an episode row.
 * Stays out of the vertical Up/Down flow (hidden until revealed) — see
 * lib/tv-episode-row.ts — and exposes "Start from beginning" plus a
 * mark-watched toggle.
 */
export function TvEpisodeActions({
  fileId,
  mediaId,
  durationMs,
  initialWatched = false,
  canRestart = true,
}: {
  fileId: number;
  mediaId: number;
  durationMs?: number | null;
  initialWatched?: boolean;
  /** Only show "Start from beginning" when there's progress to restart from. */
  canRestart?: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [loading, setLoading] = useState(false);

  const toggleWatched = async () => {
    if (loading) return;
    const next = !watched;
    setLoading(true);
    // Optimistic: the icon flips immediately so the remote feels responsive.
    setWatched(next);
    try {
      const duration = durationMs && durationMs > 0 ? durationMs : undefined;
      await api.saveProgress(
        {
          itemType: "episode",
          itemId: fileId,
          // positionMs === durationMs reads as completed; 0 clears it.
          positionMs: next ? (duration ?? 1) : 0,
          durationMs: duration,
        },
        { mediaId },
      );
    } catch (err) {
      console.warn("Failed to update episode watched state", err);
      setWatched(!next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tv-episode-actions flex shrink-0 items-center gap-1.5">
      {canRestart && (
        <TvFocusLink
          href={routes.watchFromStart("episode", fileId, mediaId)}
          aria-label={START_FROM_BEGINNING_LABEL}
          data-tv-episode-action=""
          tabIndex={-1}
          aria-hidden
          className="tv-episode-action group/action"
        >
          <RotateCcw className="tv-episode-action-icon" />
          <span className="tv-episode-action-label">{START_FROM_BEGINNING_LABEL}</span>
        </TvFocusLink>
      )}
      <TvFocusButton
        type="button"
        onClick={() => void toggleWatched()}
        disabled={loading}
        selected={watched}
        aria-pressed={watched}
        aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
        data-tv-episode-action=""
        tabIndex={-1}
        aria-hidden
        className={cn("tv-episode-action group/action", watched && "is-watched")}
      >
        <Check className="tv-episode-action-icon" strokeWidth={3} />
        <span className="tv-episode-action-label">
          {watched ? "Watched" : "Mark watched"}
        </span>
      </TvFocusButton>
    </div>
  );
}
