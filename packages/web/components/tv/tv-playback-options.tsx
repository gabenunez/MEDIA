"use client";

import { RotateCcw } from "lucide-react";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL, cn } from "@/lib/utils";
import { TvFocusLink } from "@/components/tv/tv-focus-link";

export function TvPlaybackOptions({
  fileId,
  mediaId,
  type = "episode",
  compact = false,
  revealOnRight = false,
}: {
  fileId: number;
  mediaId: number;
  type?: "movie" | "episode";
  /** Icon-only restart, for a list row. The words stay on the movie actions. */
  compact?: boolean;
  /** In a vertical episode list, stay out of the Up/Down flow and only become
   * focusable when the user presses Right on the episode (mirrors the subtitle
   * track "Remove" reveal). */
  revealOnRight?: boolean;
}) {
  return (
    <TvFocusLink
      href={routes.watchFromStart(type, fileId, mediaId)}
      aria-label={START_FROM_BEGINNING_LABEL}
      {...(revealOnRight
        ? { "data-tv-episode-restart": "", tabIndex: -1, "aria-hidden": true }
        : {})}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-foreground",
        compact
          ? "tv-media-episode-options h-11 w-11"
          : "h-10 gap-2 px-4 text-sm",
        revealOnRight && "tv-media-episode-options-reveal",
      )}
    >
      <RotateCcw className={compact ? "h-5 w-5 text-primary" : "h-4 w-4 text-primary"} />
      {compact ? (
        <span className="tv-media-episode-options-label">{START_FROM_BEGINNING_LABEL}</span>
      ) : (
        START_FROM_BEGINNING_LABEL
      )}
    </TvFocusLink>
  );
}
