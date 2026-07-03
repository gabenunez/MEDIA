"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api, type MediaItem } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { TvPoster } from "@/components/tv/tv-poster";
import { useDocumentTitle } from "@/lib/use-document-title";

type FavoriteFilter = "all" | "movie" | "tv";

export function TvFavoritesClient() {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("type");
  const filter: FavoriteFilter =
    filterParam === "movie" || filterParam === "tv" ? filterParam : "all";

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentTitle("Favorites");

  useEffect(() => {
    setLoading(true);
    api
      .getFavorites(1, filter === "all" ? undefined : filter)
      .then((data) => setItems(data.items))
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    if (loading) return;
    const first = document.querySelector<HTMLElement>("[data-tv-item]");
    first?.focus();
  }, [loading, filter]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <h1 className="mb-6 text-3xl font-black tracking-tight sm:text-4xl">Favorites</h1>

      <div data-tv-row="" className="mb-8 flex flex-wrap gap-3">
        {(
          [
            { id: "all", label: "All" },
            { id: "movie", label: "Movies" },
            { id: "tv", label: "TV Shows" },
          ] as const
        ).map((option) => (
          <TvFocusLink
            key={option.id}
            href={tvRoutes.favorites(option.id === "all" ? undefined : option.id)}
            className={
              filter === option.id
                ? "rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground"
                : "rounded-xl border border-border bg-muted/60 px-6 py-3 text-lg font-semibold text-foreground"
            }
          >
            {option.label}
          </TvFocusLink>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border/70 px-8 py-16 text-center">
          <p className="mb-6 text-lg text-muted-foreground">No favorites yet.</p>
          <TvFocusLink
            href={tvRoutes.home()}
            className="inline-flex rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
          >
            Back to home
          </TvFocusLink>
        </div>
      ) : (
        <div
          data-tv-row=""
          className="grid grid-cols-3 gap-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        >
          {items.map((item) => (
            <TvPoster key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
