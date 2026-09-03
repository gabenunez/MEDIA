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
  linkClassName?: string;
  progress?: number;
  subtitle?: string;
  /** Next.js priority decode — use for the first visible tiles only. */
  priority?: boolean;
  /** Catalog grids use larger artwork than home rows. */
  layout?: "row" | "grid";
}

export const TvPoster = memo(function TvPoster({
  item,
  href,
  className,
  linkClassName,
  progress,
  subtitle,
  priority = false,
  layout = "row",
}: TvPosterProps) {
  const router = useRouter();
  const imageUrl = tvImageUrl(item.posterPath);
  const linkHref = href ?? routes.media(item.id);
  const onTv = isTvClient();
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
    measureSubtitleMarquee();
  }, [item, linkHref, measureSubtitleMarquee, router]);

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
        aria-label={subtitle ? `${item.title}, ${subtitle}` : item.title}
        onMouseEnter={warmNavigation}
        onFocus={warmNavigation}
      >
        <div className={cn(
          "tv-poster-art poster-shadow relative aspect-[2/3] overflow-hidden bg-muted",
          layout === "grid" ? "rounded-xl" : "rounded-lg",
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
                layout === "grid"
                  ? "(min-width: 1920px) 12rem, 9.5rem"
                  : "(min-width: 1920px) 8rem, 7.5rem"
              }
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
            <div className={cn(
              "absolute inset-x-0 bottom-0 z-10 bg-white/25",
              layout === "grid" ? "h-1.5" : "h-1",
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
        <p className="tv-poster-title line-clamp-2 leading-snug text-muted-foreground">
          {item.title}
        </p>
        {subtitle && (
          <p
            ref={subtitleRef}
            className={cn(
              "tv-poster-subtitle text-muted-foreground",
              layout === "grid" ? "text-base" : "text-sm",
            )}
            data-tv-marquee={marqueeShiftPx < 0 ? "" : undefined}
            style={
              marqueeShiftPx < 0
                ? ({ "--tv-marquee-shift": `${marqueeShiftPx}px` } as CSSProperties)
                : undefined
            }
          >
            <span className="tv-poster-subtitle-text">{subtitle}</span>
          </p>
        )}
      </Link>
    </div>
  );
});
