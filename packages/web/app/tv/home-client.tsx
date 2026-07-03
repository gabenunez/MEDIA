"use client";

import { useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { api, type ContinueWatchingItem, type MediaItem } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { TvPoster } from "@/components/tv/tv-poster";
import { TvRow } from "@/components/tv/tv-row";
import { useDocumentTitle } from "@/lib/use-document-title";
import { LibraryIcon } from "@/components/navbar";

export function TvHomeClient() {
  useDocumentTitle("TV");
  const [loaded, setLoaded] = useState(false);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([]);
  const [favorites, setFavorites] = useState<MediaItem[]>([]);
  const [libraries, setLibraries] = useState<
    Awaited<ReturnType<typeof api.getHome>>["libraries"]
  >([]);
  const [decks, setDecks] = useState<Awaited<ReturnType<typeof api.getHome>>["decks"]>(
    [],
  );

  useEffect(() => {
    api
      .getHome()
      .then((data) => {
        setContinueWatching(data.continueWatching);
        setRecentlyAdded(data.recentlyAdded);
        setFavorites(data.favorites);
        setLibraries(data.libraries);
        setDecks(data.decks);
      })
      .catch(console.warn)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const first = document.querySelector<HTMLElement>("[data-tv-item]");
    first?.focus();
  }, [loaded]);

  const continueTarget = continueWatching[0] ?? null;

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const hasContent =
    continueWatching.length > 0 ||
    recentlyAdded.length > 0 ||
    favorites.length > 0 ||
    libraries.length > 0 ||
    decks.length > 0;

  return (
    <div className="py-8">
      {continueTarget && (
        <section className="mb-10 px-8">
          <h1 className="mb-5 text-3xl font-black tracking-tight sm:text-4xl">
            Continue watching
          </h1>
          <div data-tv-row="" className="flex flex-wrap items-center gap-5">
            <TvFocusLink
              href={
                continueTarget.itemType === "movie"
                  ? tvRoutes.watch("movie", continueTarget.itemId, continueTarget.mediaId)
                  : tvRoutes.watch("episode", continueTarget.itemId, continueTarget.mediaId)
              }
              className="inline-flex items-center gap-3 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground"
            >
              <Play className="h-6 w-6 fill-current" />
              Continue {continueTarget.title}
            </TvFocusLink>
          </div>
        </section>
      )}

      {continueWatching.length > 0 && (
        <TvRow title="Continue Watching" href={tvRoutes.continueWatching()}>
          {continueWatching.map((item) => (
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
        </TvRow>
      )}

      {favorites.length > 0 && (
        <TvRow title="Favorites" href={tvRoutes.favorites()}>
          {favorites.map((item) => (
            <TvPoster key={item.id} item={item} />
          ))}
        </TvRow>
      )}

      {recentlyAdded.length > 0 && (
        <TvRow title="Recently Added" href={tvRoutes.recentlyAdded()}>
          {recentlyAdded.map((item) => (
            <TvPoster key={item.id} item={item} />
          ))}
        </TvRow>
      )}

      {(decks.length > 0 || libraries.length > 0) && (
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-4 px-8">
            <h2 className="text-2xl font-bold tracking-tight">Browse</h2>
            <a
              href={tvRoutes.browse()}
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </a>
          </div>
          <div
            data-tv-row=""
            className="scrollbar-hide flex snap-x gap-4 overflow-x-auto px-8 pb-2"
          >
            <TvFocusLink
              href={tvRoutes.favorites()}
              className="w-64 shrink-0 snap-start rounded-xl border border-border/80 bg-card p-5"
            >
              <p className="truncate text-lg font-semibold">Favorites</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Saved titles · {favorites.length} favorited
              </p>
            </TvFocusLink>
            {decks.map((deck) => (
              <TvFocusLink
                key={`deck-${deck.id}`}
                href={tvRoutes.deck(deck.id)}
                className="w-64 shrink-0 snap-start rounded-xl border border-border/80 bg-card p-5"
              >
                <p className="truncate text-lg font-semibold">{deck.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deck · {deck.itemCount ?? 0} titles
                </p>
              </TvFocusLink>
            ))}
            {libraries.map((lib) => (
              <TvFocusLink
                key={`library-${lib.id}`}
                href={tvRoutes.library(lib.id)}
                className="w-64 shrink-0 snap-start rounded-xl border border-border/80 bg-card p-5"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LibraryIcon type={lib.type} />
                </div>
                <p className="truncate text-lg font-semibold">{lib.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lib.type === "movies" ? "Movies" : "TV"} · {lib.itemCount ?? 0} titles
                </p>
              </TvFocusLink>
            ))}
          </div>
        </section>
      )}

      {!hasContent && (
        <div className="mx-auto max-w-xl px-8 py-24 text-center">
          <h2 className="mb-3 text-3xl font-bold">No media yet</h2>
          <p className="text-lg text-muted-foreground">
            Add libraries on the desktop site, then come back here to browse.
          </p>
        </div>
      )}
    </div>
  );
}
