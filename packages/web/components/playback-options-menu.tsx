"use client";

import Link from "next/link";
import { MoreHorizontal, RotateCcw } from "lucide-react";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function PlaybackOptionsMenu({
  type,
  fileId,
  mediaId,
  className,
}: {
  type: "movie" | "episode";
  fileId: number;
  mediaId: number;
  className?: string;
}) {
  return (
    <details className={cn("group relative", className)}>
      <summary
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground [&::-webkit-details-marker]:hidden"
        aria-label="More playback options"
      >
        <MoreHorizontal className="h-5 w-5" />
      </summary>
      <div className="absolute right-0 top-full z-20 mt-2 min-w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
        <Link
          href={routes.watchFromStart(type, fileId, mediaId)}
          className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <RotateCcw className="h-4 w-4 text-primary" />
          {START_FROM_BEGINNING_LABEL}
        </Link>
      </div>
    </details>
  );
}
