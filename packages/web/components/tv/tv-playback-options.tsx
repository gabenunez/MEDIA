"use client";

import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MoreOptionsIcon } from "@/components/more-options-icon";
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
      className={cn("relative shrink-0", open && "z-30")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <TvFocusButton
        aria-label="More playback options"
        aria-expanded={open}
        aria-haspopup="menu"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "tv-media-episode-options inline-flex h-10 w-10 items-center justify-center rounded-lg p-0 text-foreground",
        )}
      >
        <MoreOptionsIcon className="h-5 w-5" />
      </TvFocusButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-56 rounded-lg border border-white/15 bg-background/95 p-1.5 shadow-xl"
        >
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
