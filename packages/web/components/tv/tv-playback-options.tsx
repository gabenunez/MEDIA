"use client";

import { RotateCcw } from "lucide-react";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL } from "@/lib/utils";
import { TvFocusLink } from "@/components/tv/tv-focus-link";

export function TvPlaybackOptions({
  fileId,
  mediaId,
  type = "episode",
}: {
  fileId: number;
  mediaId: number;
  type?: "movie" | "episode";
}) {
  return (
    <TvFocusLink
      href={routes.watchFromStart(type, fileId, mediaId)}
      aria-label={START_FROM_BEGINNING_LABEL}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-foreground"
    >
      <RotateCcw className="h-4 w-4 text-primary" />
      {START_FROM_BEGINNING_LABEL}
    </TvFocusLink>
  );
}
