"use client";

import { api, type MediaItem } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";
import { Clapperboard, Play, Tv } from "lucide-react";

interface TvPosterProps {
  item: MediaItem;
  href?: string;
  className?: string;
  linkClassName?: string;
  progress?: number;
  subtitle?: string;
}

export function TvPoster({
  item,
  href,
  className,
  linkClassName,
  progress,
  subtitle,
}: TvPosterProps) {
  const imageUrl = api.imageUrl(item.posterPath);
  const linkHref = href ?? tvRoutes.media(item.id);

  return (
    <div className={cn("shrink-0", className)}>
      <TvFocusLink
        href={linkHref}
        className={cn(
          "group block w-[11rem] sm:w-[12.5rem]",
          linkClassName,
        )}
      >
        <div className="poster-shadow relative aspect-[2/3] overflow-hidden rounded-xl border-2 border-transparent bg-muted transition-colors group-focus-visible:border-primary">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={item.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="signal-grid flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
              {item.type === "movie" ? (
                <Clapperboard className="h-10 w-10 text-primary" />
              ) : (
                <Tv className="h-10 w-10 text-primary" />
              )}
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-focus-visible:opacity-100">
            <Play className="h-12 w-12 fill-white text-white" />
          </div>

          {progress !== undefined && progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/25">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          )}
        </div>
        <p className="mt-3 line-clamp-2 text-base font-semibold leading-snug">
          {item.title}
        </p>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </TvFocusLink>
    </div>
  );
}
