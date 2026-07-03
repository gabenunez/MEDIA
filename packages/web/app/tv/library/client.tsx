"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, LibraryBig, Loader2 } from "lucide-react";
import { api, type MediaItem } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";
import { TvGrid } from "@/components/tv/tv-row";
import { TvPoster } from "@/components/tv/tv-poster";
import { useDocumentTitle } from "@/lib/use-document-title";

export function TvLibraryClient() {
  const searchParams = useSearchParams();
  const libraryId = parseInt(searchParams.get("id") ?? "", 10);
  const deckId = parseInt(searchParams.get("deck") ?? "", 10);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Browse");

  const isDeck = !Number.isNaN(deckId) && deckId > 0;
  const isLibrary = !Number.isNaN(libraryId) && libraryId > 0;

  useDocumentTitle(isDeck || isLibrary ? title : null);

  useEffect(() => {
    setPage(1);
  }, [libraryId, deckId]);

  useEffect(() => {
    if (!isDeck && !isLibrary) return;

    setLoading(true);

    if (isDeck) {
      api
        .getDeck(deckId)
        .then((deck) => setTitle(deck.name))
        .catch(console.warn);

      api
        .getDeckItems(deckId, page)
        .then((data) => {
          setItems(data.items);
          setTotalPages(data.totalPages);
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
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [libraryId, deckId, page, isDeck, isLibrary]);

  useEffect(() => {
    if (loading) return;
    const first = document.querySelector<HTMLElement>("[data-tv-item]");
    first?.focus();
  }, [loading, page]);

  if (!isDeck && !isLibrary) {
    return (
      <div className="px-8 py-24 text-center">
        <p className="mb-6 text-lg text-muted-foreground">Invalid library or deck</p>
        <TvFocusLink
          href={tvRoutes.home()}
          className="inline-flex rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
        >
          Back to home
        </TvFocusLink>
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-6">
        <div className="flex items-center gap-4">
          <TvFocusLink
            href={tvRoutes.home()}
            className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/60"
            aria-label="Back"
          >
            <ChevronLeft className="h-7 w-7" />
          </TvFocusLink>
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm uppercase tracking-wide text-primary">
              <LibraryBig className="h-4 w-4" />
              {isDeck ? "Deck" : "Library"}
            </p>
            <h1 className="text-4xl font-bold">{title}</h1>
          </div>
        </div>
        {!loading && totalPages > 1 && (
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-lg text-muted-foreground">
          No titles here yet.
        </div>
      ) : (
        <>
          <TvGrid>
            {items.map((item) => (
              <TvPoster key={item.id} item={item} linkClassName="w-full" className="min-w-0" />
            ))}
          </TvGrid>

          {totalPages > 1 && (
            <div
              data-tv-row=""
              className="mt-10 flex items-center justify-center gap-4"
            >
              <TvFocusButton
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-medium disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" /> Previous
              </TvFocusButton>
              <TvFocusButton
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-medium disabled:opacity-40"
              >
                Next <ChevronRight className="h-5 w-5" />
              </TvFocusButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
