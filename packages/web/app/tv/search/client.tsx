"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { api, type MediaItem } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { TvGrid } from "@/components/tv/tv-row";
import { TvPoster } from "@/components/tv/tv-poster";
import { useDocumentTitle } from "@/lib/use-document-title";

export function TvSearchClient() {
  useDocumentTitle("Search");
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(trimmed)
        .then((data) => {
          setResults(data.results);
          setSearched(true);
        })
        .catch(console.warn)
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!searched || loading) return;
    const first = document.querySelector<HTMLElement>("[data-tv-item]");
    first?.focus();
  }, [searched, loading, results]);

  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="mb-5 text-4xl font-bold">Search</h1>
        <div className="relative max-w-3xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies and TV shows..."
            className="h-16 w-full rounded-xl border-2 border-border bg-card pl-14 pr-5 text-xl outline-none focus:border-primary focus:ring-4 focus:ring-primary/30"
          />
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="py-16 text-center text-lg text-muted-foreground">No results found.</p>
      )}

      {!loading && results.length > 0 && (
        <TvGrid>
          {results.map((item) => (
            <TvPoster key={item.id} item={item} linkClassName="w-full" className="min-w-0" />
          ))}
        </TvGrid>
      )}

      {!loading && !searched && (
        <div className="py-16 text-center text-lg text-muted-foreground">
          Type at least 2 characters to search.
        </div>
      )}

      <div data-tv-row="" className="mt-10">
        <TvFocusLink
          href={tvRoutes.home()}
          className="inline-flex rounded-xl border border-border bg-card px-6 py-3 text-base font-medium"
        >
          Back to home
        </TvFocusLink>
      </div>
    </div>
  );
}
