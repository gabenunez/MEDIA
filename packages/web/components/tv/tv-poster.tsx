"use client";

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
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
import { measureTvMarqueeShift } from "@/lib/tv-marquee";

interface TvPosterProps {
  item: MediaItem;
  href?: string;
  className?: string;
  progress?: number;
  subtitle?: string;
  /** Next.js priority decode — use for the first visible tiles only. */
  priority?: boolean;
  /** Catalog grids use larger artwork than home rows. */
  layout?: "row" | "grid";
  onOpen?: (mediaId: number) => void;
}

export const TvPoster = memo(function TvPoster({
  item,
  href,
  className,
  progress,
  subtitle,
  priority = false,
  layout = "row",
  onOpen,
}: TvPosterProps) {
  const router = useRouter();
  const imageUrl = tvImageUrl(item.posterPath);
  const linkHref = href ?? routes.media(item.id);
  const onTv = isTvClient();
  const inGrid = layout === "grid";
  const detail = subtitle ?? (inGrid
    ? [item.year, item.type === "movie" ? "Movie" : "TV"].filter(Boolean).join(" · ")
    : undefined);
  // Android TV WebView often never loads lazy images inside horizontal rows/grids.
  // Keep eager decode on TV, but only mark the first few tiles as priority.
  const loading = onTv || priority ? ("eager" as const) : ("lazy" as const);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const [marqueeShiftPx, setMarqueeShiftPx] = useState(0);

  const measureSubtitleMarquee = useCallback(() => {
    const el = subtitleRef.current;
    const inner = el?.firstElementChild;
    if (!el) {
      setMarqueeShiftPx(0);
      return;
    }
    const textEl = inner instanceof HTMLElement ? inner : el;
    setMarqueeShiftPx(measureTvMarqueeShift(el, textEl));
  }, []);

  useEffect(() => {
    setMarqueeShiftPx(0);
  }, [subtitle]);

  const warmNavigation = useCallback(() => {
    prefetchPosterFocus(item, router, linkHref);
    if (!inGrid && subtitle) measureSubtitleMarquee();
  }, [inGrid, item, linkHref, measureSubtitleMarquee, router, subtitle]);

  return (
    <div data-tv-poster-layout={layout} className={cn("tv-poster-tile shrink-0", className)}>
      <Link
        href={linkHref}
        prefetch={!onTv}
        data-tv-item=""
        data-tv-video-item=""
        data-tv-media-id={item.id}
        tabIndex={0}
        className={cn(
          tvPosterLinkClassName,
          inGrid ? "min-w-0 w-full" : "w-[var(--tv-poster-width,7rem)]",
        )}
        aria-label={detail ? `${item.title}, ${detail}` : item.title}
        onMouseEnter={warmNavigation}
        onFocus={warmNavigation}
        onNavigate={onOpen ? () => onOpen(item.id) : undefined}
      >
        <div className={cn(
          "tv-poster-art poster-shadow relative overflow-hidden bg-muted",
          inGrid ? "rounded-xl" : "rounded-lg",
        )}>
          {imageUrl ? (
            <MediaImage
              src={imageUrl}
              alt=""
              fill
              priority={priority}
              loading={loading}
              quality={TV_LIST_IMAGE_QUALITY}
              sizes={
                inGrid
                  ? "(min-width: 1920px) 11rem, 9rem"
                  : "(min-width: 1920px) 7.5rem, 7rem"
              }
              className="object-cover"
            />
          ) : (
            <div className="signal-grid absolute inset-0 flex items-center justify-center text-primary/70" aria-hidden="true">
              {item.type === "movie" ? (
                <Clapperboard className="h-8 w-8" />
              ) : (
                <Tv className="h-8 w-8" />
              )}
            </div>
          )}

          {progress !== undefined && progress > 0 && (
            <div className={cn(
              "absolute inset-x-0 bottom-0 z-10 bg-white/25",
              inGrid ? "h-1.5" : "h-1",
            )}>
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
        <p className={cn("tv-poster-title text-muted-foreground", inGrid ? "tv-catalog-title" : "line-clamp-2 leading-snug")}>
          {item.title}
        </p>
        {inGrid && detail ? (
          <p className="tv-catalog-meta text-muted-foreground">{detail}</p>
        ) : subtitle ? (
          <p
            ref={subtitleRef}
            className="tv-poster-subtitle text-sm text-muted-foreground"
            data-tv-marquee={marqueeShiftPx < 0 ? "" : undefined}
            style={
              marqueeShiftPx < 0
                ? ({ "--tv-marquee-shift": `${marqueeShiftPx}px` } as CSSProperties)
                : undefined
            }
          >
            <span className="tv-poster-subtitle-text">{subtitle}</span>
          </p>
        ) : null}
      </Link>
    </div>
  );
});
