"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type ContinueWatchingItem } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { TvPoster } from "@/components/tv/tv-poster";
import { useDocumentTitle } from "@/lib/use-document-title";

export function TvContinueWatchingClient() {
  const [items, setItems] = useState<ContinueWatchingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentTitle("Continue Watching");

  useEffect(() => {
    api
      .getContinueWatching(1)
      .then((data) => setItems(data.items))
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <TvFocusLink
        href={tvRoutes.home()}
        className="mb-8 inline-flex h-12 items-center rounded-xl bg-card px-5 text-base font-medium"
      >
        Back to home
      </TvFocusLink>
      <h1 className="mb-8 text-3xl font-black">Continue Watching</h1>
      {items.length === 0 ? (
        <p className="text-lg text-muted-foreground">Nothing in progress yet.</p>
      ) : (
        <div data-tv-row="" className="flex flex-wrap gap-5">
          {items.map((item) => (
            <TvPoster
              key={item.id}
              item={{
                id: item.mediaId,
                libraryId: 0,
                title: item.title,
                type: item.itemType === "movie" ? "movie" : "tv",
                posterPath: item.posterPath,
              }}
              href={
                item.itemType === "movie"
                  ? tvRoutes.watch("movie", item.itemId, item.mediaId)
                  : tvRoutes.watch("episode", item.itemId, item.mediaId)
              }
              progress={item.percent}
              subtitle={item.subtitle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
