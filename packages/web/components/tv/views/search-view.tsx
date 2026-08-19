"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { routes } from "@/lib/routes";
import { tvFocusRingClassName } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";
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
    if (document.activeElement === inputRef.current) return;
    focusFirstContentItem();
  }, [searched, loading, results]);

  return (
    <TvPageShell>
      <TvPageHeader
        backHref={routes.home()}
        title="Search"
        subtitle={tvPageMeta([searched && results.length > 0 && `${results.length} results`])}
      />

      <div data-tv-row="" data-tv-content-row="" className="mb-10">
        <div className="relative max-w-4xl">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            data-tv-item=""
            tabIndex={0}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies and TV shows"
            className={cn(
              tvFocusRingClassName,
              "tv-search-field w-full rounded-2xl border-border bg-card pl-16 pr-6 outline-none",
            )}
          />
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
        <p className="py-20 text-center text-xl text-muted-foreground">
          Type at least 2 characters to search.
        </p>
      )}
    </TvPageShell>
  );
}
