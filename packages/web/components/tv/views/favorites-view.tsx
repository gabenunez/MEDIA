"use client";

import { useEffect, useState } from "react";
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
import { focusFirstContentItem } from "@/lib/tv-focus";
import { useMarkTvBootReadyWhen } from "@/components/tv/tv-boot-ready";

export function TvFavoritesView({
  initialPage = null,
}: {
  initialPage?: PaginatedPageData<MediaItem> | null;
}) {
  const filter = useFavoritesRouteFilter();

  const [items, setItems] = useState<MediaItem[]>(initialPage?.items ?? []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPage?.totalPages ?? 1);
  const [totalItems, setTotalItems] = useState(
    initialPage?.total ?? initialPage?.items.length ?? 0,
  );
  const [loading, setLoading] = useState(!initialPage);

  useMarkTvBootReadyWhen(!loading);

  useDocumentTitle("Favorites");

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    api
      .getFavorites(page, filter === "all" ? undefined : filter)
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total ?? data.items.length);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [filter, page]);

  useEffect(() => {
    if (loading) return;
    focusFirstContentItem();
  }, [loading, filter, page]);

  if (loading && items.length === 0) {
    return <TvPageLoading />;
  }

  return (
    <TvPageShell>
      <TvPageHeader
        backHref={routes.home()}
        title="Favorites"
        subtitle={tvPageMeta([totalItems > 0 && `${totalItems} saved`])}
      />

      <div
        data-tv-row=""
        data-tv-content-row=""
        data-tv-scroll-row=""
        className="mb-8 flex gap-4 overflow-x-auto py-1"
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
            className="px-5 py-2.5 text-base font-semibold"
          >
            {option.label}
          </TvFocusLink>
        ))}
      </div>

      {items.length === 0 ? (
        <TvEmptyState
          action={
            <TvFocusLink
              href={routes.home()}
              variant="card"
              className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground"
            >
              Back to home
            </TvFocusLink>
          }
        >
          No favorites yet.
        </TvEmptyState>
      ) : (
        <>
          <TvGrid>
            {items.map((item, index) => (
              <TvPoster
                key={item.id}
                item={item}
                layout="grid"
                priority={index < 12}
                linkClassName="w-full"
                className="min-w-0 w-full"
              />
            ))}
          </TvGrid>
          <TvPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </TvPageShell>
  );
}
