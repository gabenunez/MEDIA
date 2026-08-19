"use client";

import { useEffect, useState } from "react";
import { api, type ContinueWatchingItem } from "@/lib/api";
import type { PaginatedPageData } from "@/lib/server-api";
import { routes } from "@/lib/routes";
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

export function TvContinueView({
  initialPage = null,
}: {
  initialPage?: PaginatedPageData<ContinueWatchingItem> | null;
}) {
  const [items, setItems] = useState<ContinueWatchingItem[]>(initialPage?.items ?? []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPage?.totalPages ?? 1);
  const [totalItems, setTotalItems] = useState(
    initialPage?.total ?? initialPage?.items.length ?? 0,
  );
  const [loading, setLoading] = useState(!initialPage);

  useMarkTvBootReadyWhen(!loading);

  useDocumentTitle("Continue Watching");

  useEffect(() => {
    if (page === 1 && initialPage) {
      setItems(initialPage.items);
      setTotalPages(initialPage.totalPages);
      setTotalItems(initialPage.total ?? initialPage.items.length);
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .getContinueWatching(page)
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total ?? data.items.length);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [page, initialPage]);

  useEffect(() => {
    if (loading || items.length === 0) return;
    requestAnimationFrame(() => focusFirstContentItem());
  }, [loading, page, items.length]);

  if (loading && items.length === 0) {
    return <TvPageLoading />;
  }

  return (
    <TvPageShell>
      <TvPageHeader
        backHref={routes.home()}
        title="Continue Watching"
        subtitle={tvPageMeta([totalItems > 0 && `${totalItems} in progress`])}
      />

      {items.length === 0 ? (
        <TvEmptyState>Nothing in progress yet.</TvEmptyState>
      ) : (
        <>
          <TvGrid>
            {items.map((item, index) => (
              <TvPoster
                key={item.id}
                layout="grid"
                priority={index < 12}
                item={{
                  id: item.mediaId,
                  libraryId: 0,
                  title: item.title,
                  type: item.itemType === "movie" ? "movie" : "tv",
                  posterPath: item.posterPath,
                }}
                href={
                  item.itemType === "movie"
                    ? routes.watch("movie", item.itemId, item.mediaId)
                    : routes.watch("episode", item.itemId, item.mediaId)
                }
                progress={item.percent}
                subtitle={item.subtitle}
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
