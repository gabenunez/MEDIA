"use client";

import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";

interface TvSeeAllTileProps {
  href: string;
  label: string;
  detail?: string;
  className?: string;
}

/** Poster-sized tile at the end of a row — opens a full list page (not a header link). */
export function TvSeeAllTile({ href, label, detail, className }: TvSeeAllTileProps) {
  return (
    <div className={cn("tv-poster-tile shrink-0", className)}>
      <TvFocusLink
        href={href}
        variant="poster"
        aria-label={label}
        className="group w-[var(--tv-poster-width,7.5rem)]"
      >
        <div className="tv-poster-art relative flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/10">
          <LayoutGrid className="h-8 w-8 text-primary" />
        </div>
        <p className="tv-poster-title mt-2 line-clamp-2 font-semibold leading-snug">
          {label}
        </p>
        {detail ? (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </TvFocusLink>
    </div>
  );
}

interface TvBrowseCardProps {
  href: string;
  title: string;
  detail?: string;
  icon?: ReactNode;
  className?: string;
  layout?: "row" | "grid";
}

/** Wide browse card used in the home collections row and Browse grid. */
export function TvBrowseCard({
  href,
  title,
  detail,
  icon,
  className,
  layout = "row",
}: TvBrowseCardProps) {
  return (
    <TvFocusLink
      href={href}
      variant="card"
      className={cn(
        "rounded-xl bg-card p-4",
        layout === "grid" ? "flex min-h-[7rem] w-full flex-col justify-between" : "w-[14.5rem] shrink-0",
        className,
      )}
    >
      {icon ? <div className="mb-2">{icon}</div> : null}
      <p className="truncate text-base font-semibold leading-snug">{title}</p>
      {detail ? (
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      ) : null}
    </TvFocusLink>
  );
}
