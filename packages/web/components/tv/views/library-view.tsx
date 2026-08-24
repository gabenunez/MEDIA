"use client";

import { useEffect, useState } from "react";
import { useLibraryRouteContext } from "@/lib/use-route-params";
import { useIsClient } from "@/lib/use-browser-pathname";
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

type LibraryInitialList = {
  kind: "library" | "deck";
  id: number;
  page: PaginatedPageData<MediaItem> | null;
  title?: string;
  subtitle?: string;
};

export function TvLibraryView({
  initialList = null,
}: {
  initialList?: LibraryInitialList | null;
}) {
  const isClient = useIsClient();
  const { libraryId, deckId } = useLibraryRouteContext();
  const seed =
    initialList &&
    ((initialList.kind === "library" && initialList.id === libraryId) ||
      (initialList.kind === "deck" && initialList.id === deckId))
      ? initialList
      : null;

  const [items, setItems] = useState<MediaItem[]>(seed?.page?.items ?? []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(seed?.page?.totalPages ?? 1);
  const [totalItems, setTotalItems] = useState(seed?.page?.total ?? seed?.page?.items.length ?? 0);
  const [loading, setLoading] = useState(!seed?.page);
  const [title, setTitle] = useState(seed?.title ?? "Browse");

  const isDeck = !Number.isNaN(deckId) && deckId > 0;
  const isLibrary = !Number.isNaN(libraryId) && libraryId > 0;

  useMarkTvBootReadyWhen(!loading || (isClient && !isDeck && !isLibrary));

  useDocumentTitle(isDeck || isLibrary ? title : null);

  useEffect(() => {
    setPage(1);
  }, [libraryId, deckId]);

  useEffect(() => {
    if (!isDeck && !isLibrary) return;

    if (page === 1 && seed?.page) {
      setItems(seed.page.items);
      setTotalPages(seed.page.totalPages);
      setTotalItems(seed.page.total ?? seed.page.items.length);
      if (seed.title) setTitle(seed.title);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isDeck) {
      void Promise.all([
        api.getDeck(deckId).catch(() => null),
        api.getDeckItems(deckId, page),
      ])
        .then(([deck, data]) => {
          if (deck) setTitle(deck.name);
          setItems(data.items);
          setTotalPages(data.totalPages);
          setTotalItems(data.total ?? data.items.length);
        })
        .catch(console.warn)
        .finally(() => setLoading(false));
      return;
    }

    setTitle("Library");
    api
      .getLibraryItems(libraryId, page)
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total ?? data.items.length);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [libraryId, deckId, page, isDeck, isLibrary, seed]);

  useEffect(() => {
    if (loading) return;
    focusFirstContentItem();
  }, [loading, page]);

  if (!isDeck && !isLibrary) {
    if (!isClient) {
      return <TvPageLoading />;
    }

    return (
      <TvPageShell>
        <TvEmptyState
          action={
            <TvFocusLink
              href={routes.home()}
              className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground"
            >
              Back to home
            </TvFocusLink>
          }
        >
          Invalid library or deck
        </TvEmptyState>
      </TvPageShell>
    );
  }

  const backHref = routes.home();

  return (
    <TvPageShell>
      <TvPageHeader
        backHref={backHref}
        title={title}
        subtitle={tvPageMeta([
          isDeck ? "Deck" : "Library",
          !loading && totalItems > 0 && `${totalItems} titles`,
        ])}
      />

      {loading && items.length === 0 ? (
        <TvPageLoading />
      ) : items.length === 0 ? (
        <TvEmptyState>No titles here yet.</TvEmptyState>
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
