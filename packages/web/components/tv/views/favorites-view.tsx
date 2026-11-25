"use client";

import { useEffect, useRef, useState } from "react";
import type { FavoriteFilter } from "@media-app/shared";
import { useFavoritesRouteFilter } from "@/lib/use-route-params";
import { api, type MediaItem } from "@/lib/api";
import type { PaginatedPageData } from "@/lib/server-api";
import { routes } from "@/lib/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import {
  TvEmptyState,
  TvPageHeader,
  TvPageLoading,
  TvPageShell,
  TvPagination,
  tvPageMeta,
} from "@/components/tv/tv-page-header";
import { TvGrid } from "@/components/tv/tv-row";
import { TvPoster } from "@/components/tv/tv-poster";
import { useDocumentTitle } from "@/lib/use-document-title";
import { focusTvItem } from "@/lib/tv-focus";

export function TvFavoritesView({
  initialPage = null,
}: {
  initialPage?: PaginatedPageData<MediaItem> | null;
}) {
  const filter = useFavoritesRouteFilter();
  const [cursor, setCursor] = useState({ filter, page: 1 });
  const [result, setResult] = useState<{
    filter: FavoriteFilter;
    page: number;
    data: PaginatedPageData<MediaItem> | null;
  } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const page = cursor.filter === filter ? cursor.page : 1;
  const seed = page === 1 ? initialPage : null;
  const current = result?.filter === filter && result.page === page ? result : null;
  const data = seed ?? current?.data;
  const totalItems = data?.total ?? data?.items.length ?? 0;
  const loading = !seed && !current;

  useDocumentTitle("Favorites");

  useEffect(() => {
    if (seed) return;
    let active = true;
    void api.getFavorites(page, filter === "all" ? undefined : filter).then(
      (data) => { if (active) setResult({ filter, page, data }); },
      () => { if (active) setResult({ filter, page, data: null }); },
    );
    return () => { active = false; };
  }, [filter, page, seed]);

  useEffect(() => {
    if (loading) return;
    // Other history entries can still have hidden grids in the document.
    const firstItem = grid.current?.querySelector<HTMLElement>("[data-tv-item]");
    if (firstItem) focusTvItem(firstItem);
  }, [loading, filter, page]);

  return (
    <TvPageShell>
      <TvPageHeader
        title="Favorites"
        subtitle={tvPageMeta([totalItems > 0 && `${totalItems} saved`])}
      />

      <div
        data-tv-row=""
        data-tv-content-row=""
        data-tv-scroll-row=""
        className="mb-5 flex gap-2 overflow-x-auto py-1"
      >
        {(
          [
            { id: "all", label: "All" },
            { id: "movie", label: "Movies" },
            { id: "tv", label: "TV Shows" },
          ] as const
        ).map((option) => (
          <TvFocusLink
            key={option.id}
            href={routes.favorites(option.id === "all" ? undefined : option.id)}
            variant="chip"
            selected={filter === option.id}
            aria-current={filter === option.id ? "page" : undefined}
            className="whitespace-nowrap px-5 py-2.5 text-base font-semibold"
          >
            {option.label}
          </TvFocusLink>
        ))}
      </div>

      {loading ? (
        <TvPageLoading />
      ) : !data ? (
        <TvEmptyState>Couldn’t load favorites.</TvEmptyState>
      ) : data.items.length === 0 ? (
        <TvEmptyState>
          {filter === "tv" ? "No favorite TV shows yet." : filter === "movie" ? "No favorite movies yet." : "No favorites yet."}
        </TvEmptyState>
      ) : (
        <>
          <TvGrid ref={grid}>
            {data.items.map((item, index) => (
              <TvPoster
                key={item.id}
                item={item}
                layout="grid"
                priority={index < 12}
              />
            ))}
          </TvGrid>
          <TvPagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={(page) => setCursor({ filter, page })}
          />
        </>
      )}
    </TvPageShell>
  );
}
