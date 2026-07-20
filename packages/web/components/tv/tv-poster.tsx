"use client";

import { memo, useCallback } from "react";
import { TV_LIST_IMAGE_QUALITY, tvImageUrl } from "@/lib/tv-image";
import { routes } from "@/lib/routes";
import type { MediaItem } from "@/lib/api";
import Link from "next/link";
import { tvPosterLinkClassName } from "@/components/tv/tv-focus-link";
import { prefetchPosterFocus } from "@/lib/prefetch-artwork";
import { cn } from "@/lib/utils";
import { Clapperboard, Tv } from "lucide-react";
import { isTvClient } from "@/lib/tv-mode-detect";
import { MediaImage } from "@/components/media-image";

interface TvPosterProps {
  item: MediaItem;
  href?: string;
  className?: string;
  linkClassName?: string;
  progress?: number;
  subtitle?: string;
  /** Next.js priority decode — use for the first visible tiles only. */
  priority?: boolean;
}

export const TvPoster = memo(function TvPoster({
  item,
  href,
  className,
  linkClassName,
  progress,
  subtitle,
  priority = false,
}: TvPosterProps) {
  const imageUrl = tvImageUrl(item.posterPath);
  const linkHref = href ?? routes.media(item.id);
  const onTv = isTvClient();
  // Android TV WebView often never loads lazy images inside horizontal rows/grids.
  // Keep eager decode on TV, but only mark the first few tiles as priority.
  const loading = onTv || priority ? ("eager" as const) : ("lazy" as const);

  const warmNavigation = useCallback(() => {
    prefetchPosterFocus(item);
  }, [item]);

  return (
    <div className={cn("tv-poster-tile shrink-0", className)}>
      <Link
        href={linkHref}
        prefetch={!onTv}
        data-tv-item=""
        data-tv-video-item=""
        tabIndex={0}
        className={cn(
          tvPosterLinkClassName,
          "group w-[var(--tv-poster-width,7.5rem)]",
          linkClassName,
        )}
        aria-label={item.title}
        onMouseEnter={warmNavigation}
        onFocus={warmNavigation}
      >
        <div className="tv-poster-art poster-shadow relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
          {imageUrl ? (
            <MediaImage
              src={imageUrl}
              alt=""
              fill
              priority={priority}
              loading={loading}
              quality={TV_LIST_IMAGE_QUALITY}
              sizes="(min-width: 1920px) 10rem, 7.5rem"
              className="object-cover"
            />
          ) : (
            <div className="signal-grid flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
              {item.type === "movie" ? (
                <Clapperboard className="h-8 w-8 text-primary" />
              ) : (
                <Tv className="h-8 w-8 text-primary" />
              )}
            </div>
          )}

          {progress !== undefined && progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/25">
              <div
                className={cn(
                  "h-full bg-accent",
                  progress >= 99.5 ? "w-full" : "rounded-r-full",
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          )}
        </div>
        <p className="tv-poster-title mt-2 line-clamp-2 text-sm font-medium leading-snug text-muted-foreground">
          {item.title}
        </p>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </Link>
    </div>
  );
});
