"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Radar, Search } from "lucide-react";
import { api, type MediaItem } from "@/lib/api";
import { PosterCard } from "@/components/poster-card";
import { Skeleton } from "@/components/ui/skeleton";

export function SearchClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      api
        .search(query)
        .then((data) => setResults(data.results))
        .catch((err) => console.warn("Failed to search media", err))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 border-b border-border/70 pb-6">
        <p className="mb-1 flex items-center gap-2 font-mono text-[0.68rem] uppercase text-primary">
          <Radar className="h-3.5 w-3.5" />
          Signal search
        </p>
        <h1 className="text-3xl font-bold">Find a Title</h1>
      </div>

      <div className="relative mb-8 max-w-2xl">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies and TV shows..."
          className="h-14 w-full rounded-md border border-border bg-background/55 py-3 pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-md" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <>
          <p className="mb-5 font-mono text-[0.68rem] uppercase text-muted-foreground">
            {results.length} match{results.length === 1 ? "" : "es"}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {results.map((item) => (
              <PosterCard key={item.id} item={item} />
            ))}
          </div>
        </>
      ) : query.trim() ? (
        <p className="border-y border-border/70 py-14 text-center text-muted-foreground">
          No results for &ldquo;{query}&rdquo;
        </p>
      ) : (
        <p className="border-y border-border/70 py-14 text-center text-muted-foreground">
          Start typing to search your library.
        </p>
      )}
    </div>
  );
}
