"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import type { MediaItem } from "@/lib/api";
import { prefetchCarouselPosters } from "@/lib/prefetch-artwork";
import { cn } from "@/lib/utils";
import { TvSeeAllTile } from "@/components/tv/tv-see-all-tile";

const tvScrollRowClassName =
  "tv-scroll-row scrollbar-hide flex overflow-x-auto";

interface TvRowProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  seeAllDetail?: string;
  /** Poster metadata aligned with row children (excluding the see-all tile). */
  prefetchItems?: ReadonlyArray<Pick<MediaItem, "id" | "posterPath" | "backdropPath">>;
}

export function TvRow({
  title,
  icon,
  children,
  className,
  seeAllHref,
  seeAllLabel = "See all",
  seeAllDetail,
  prefetchItems,
}: TvRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const prefetchRowPosters = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!prefetchItems?.length) return;
      prefetchCarouselPosters(event.currentTarget, prefetchItems);
    },
    [prefetchItems],
  );

  useEffect(() => {
    if (!prefetchItems?.length) return;
    const row = rowRef.current;
    if (!row) return;

    let frame = 0;
    const warm = () => {
      frame = 0;
      prefetchCarouselPosters(row, prefetchItems);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(warm);
    };

    const mount = requestAnimationFrame(warm);
    row.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(mount);
      if (frame) cancelAnimationFrame(frame);
      row.removeEventListener("scroll", onScroll);
    };
  }, [prefetchItems]);

  return (
    <section className={cn("tv-row-section", className)}>
      <h2 className="tv-row-title">
        {icon ? (
          <span className="tv-row-title-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        {title}
      </h2>
      <div
        ref={rowRef}
        data-tv-row=""
        data-tv-content-row=""
        data-tv-scroll-row=""
        className={tvScrollRowClassName}
        onPointerEnter={prefetchItems?.length ? prefetchRowPosters : undefined}
      >
        {children}
        {seeAllHref ? (
          <TvSeeAllTile
            href={seeAllHref}
            label={seeAllLabel}
            detail={seeAllDetail}
          />
        ) : null}
      </div>
    </section>
  );
}

interface TvGridProps {
  children: ReactNode;
  className?: string;
}

export function TvGrid({ children, className }: TvGridProps) {
  return (
    <div
      data-tv-row=""
      data-tv-content-row=""
      data-tv-grid=""
      className={cn("grid", className)}
    >
      {children}
    </div>
  );
}

export { tvScrollRowClassName };
