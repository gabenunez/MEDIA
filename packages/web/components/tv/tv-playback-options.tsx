"use client";

import { MoreHorizontal, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";

export function TvPlaybackOptions({
  fileId,
  mediaId,
  type = "episode",
}: {
  fileId: number;
  mediaId: number;
  type?: "movie" | "episode";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <TvFocusButton
        aria-label="More playback options"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "tv-media-episode-options h-10 w-10 rounded-lg p-0 text-muted-foreground",
          open && "text-primary",
        )}
      >
        <MoreHorizontal className="h-5 w-5" />
      </TvFocusButton>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-56 rounded-lg border border-white/15 bg-background/95 p-1.5 shadow-xl">
          <TvFocusLink
            href={routes.watchFromStart(type, fileId, mediaId)}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-white"
          >
            <RotateCcw className="h-4 w-4 text-primary" />
            {START_FROM_BEGINNING_LABEL}
          </TvFocusLink>
        </div>
      )}
    </div>
  );
}
