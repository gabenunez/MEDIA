"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { routes } from "@/lib/routes";
import {
  TvEmptyState,
  TvPageHeader,
  TvPageShell,
  tvPageMeta,
} from "@/components/tv/tv-page-header";
import { TvGrid } from "@/components/tv/tv-row";
import { TvPoster } from "@/components/tv/tv-poster";
import { useDocumentTitle } from "@/lib/use-document-title";
import { focusFirstContentItem } from "@/lib/tv-focus";
import { useMediaSearch } from "@/lib/use-media-search";
import { useMarkTvBootReadyWhen } from "@/components/tv/tv-boot-ready";

export function TvSearchView() {
  useDocumentTitle("Search");
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const { results, loading, searched } = useMediaSearch(query);

  useMarkTvBootReadyWhen(true);

  useEffect(() => {
    const fromUrl = searchParams.get("q")?.trim() ?? "";
    if (fromUrl && fromUrl !== query) {
      setQuery(fromUrl);
    }
  }, [searchParams, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!searched || loading || results.length === 0) return;
    focusFirstContentItem();
  }, [searched, loading, results]);

  return (
    <TvPageShell>
      <TvPageHeader
        backHref={routes.home()}
        title="Search"
        subtitle={tvPageMeta([searched && results.length > 0 && `${results.length} results`])}
      />

      <div data-tv-row="" data-tv-content-row="" className="mb-8 py-0.5">
        <div className="relative max-w-3xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies and TV shows..."
            className="h-14 w-full rounded-xl border border-border bg-card pl-14 pr-5 text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <TvEmptyState>No results found.</TvEmptyState>
      )}

      {results.length > 0 && (
        <TvGrid>
          {results.map((item, index) => (
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
      )}

      {!loading && !searched && (
        <p className="py-16 text-center text-lg text-muted-foreground">
          Type at least 2 characters to search.
        </p>
      )}
    </TvPageShell>
  );
}
