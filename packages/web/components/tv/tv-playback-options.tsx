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
}: {
  fileId: number;
  mediaId: number;
  type?: "movie" | "episode";
  /** Icon-only restart, for a list row. The words stay on the movie actions. */
  compact?: boolean;
}) {
  return (
    <TvFocusLink
      href={routes.watchFromStart(type, fileId, mediaId)}
      aria-label={START_FROM_BEGINNING_LABEL}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-foreground",
        compact
          ? "tv-media-episode-options h-11 w-11"
          : "h-10 gap-2 px-4 text-sm",
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
