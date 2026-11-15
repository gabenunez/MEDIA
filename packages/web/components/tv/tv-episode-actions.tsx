"use client";

import { Check, RotateCcw } from "lucide-react";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL, cn } from "@/lib/utils";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";

/**
 * Per-episode actions revealed when the user presses Right on an episode row.
 * Stays out of the vertical Up/Down flow (hidden until revealed) — see
 * lib/tv-episode-row.ts. Compact icon-only buttons.
 *
 * Deliberately stateless/presentational: a TV show page renders one of these
 * per episode, so it must stay cheap. Watched state is owned by the parent and
 * toggled through onToggleWatched.
 */
export function TvEpisodeActions({
  fileId,
  mediaId,
  watched,
  canRestart = true,
  onToggleWatched,
}: {
  fileId: number;
  mediaId: number;
  watched: boolean;
  /** Only show "Start from beginning" when there's progress to restart from. */
  canRestart?: boolean;
  onToggleWatched: () => void;
}) {
  return (
    <div className="tv-episode-actions flex shrink-0 items-center gap-1">
      {canRestart && (
        <TvFocusLink
          href={routes.watchFromStart("episode", fileId, mediaId)}
          aria-label={START_FROM_BEGINNING_LABEL}
          title={START_FROM_BEGINNING_LABEL}
          data-tv-episode-action=""
          tabIndex={-1}
          aria-hidden
          className="tv-episode-action"
        >
          <RotateCcw className="tv-episode-action-icon" />
        </TvFocusLink>
      )}
      <TvFocusButton
        type="button"
        onClick={onToggleWatched}
        aria-pressed={watched}
        aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
        title={watched ? "Mark as unwatched" : "Mark as watched"}
        data-tv-episode-action=""
        tabIndex={-1}
        aria-hidden
        className={cn("tv-episode-action", watched && "is-watched")}
      >
        <Check className="tv-episode-action-icon" strokeWidth={3} />
      </TvFocusButton>
    </div>
  );
}
