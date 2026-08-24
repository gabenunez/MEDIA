"use client";

import { useEffect, useState } from "react";
import { api, type MediaItem } from "@/lib/api";
import type { PaginatedPageData } from "@/lib/server-api";
import { routes } from "@/lib/routes";
import { invalidateClientCatalogCache } from "@/lib/catalog-cache";
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

export function TvRecentView({
  initialPage = null,
}: {
  initialPage?: PaginatedPageData<MediaItem> | null;
}) {
  const [items, setItems] = useState<MediaItem[]>(initialPage?.items ?? []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialPage?.totalPages ?? 1);
  const [totalItems, setTotalItems] = useState(
    initialPage?.total ?? initialPage?.items.length ?? 0,
  );
  const [loading, setLoading] = useState(!initialPage);

  useMarkTvBootReadyWhen(!loading);

  useDocumentTitle("Recently Added");

  useEffect(() => {
    let cancelled = false;
    const seeded = page === 1 && Boolean(initialPage);
    if (!seeded) setLoading(true);
    invalidateClientCatalogCache();
    api
      .getRecentlyAdded(page)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total ?? data.items.length);
      })
      .catch(console.warn)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
        title="Recently Added"
        subtitle={tvPageMeta([totalItems > 0 && `${totalItems} titles`])}
      />

      {items.length === 0 ? (
        <TvEmptyState>Nothing here yet.</TvEmptyState>
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
