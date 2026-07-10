"use client";

import { useEffect, useState } from "react";
import { Heart, Layers, Loader2, Play, Sparkles } from "lucide-react";
import { api, type ContinueWatchingItem, type MediaItem } from "@/lib/api";
import { routes } from "@/lib/routes";
import { TvPoster } from "@/components/tv/tv-poster";
import { TvRow, tvScrollRowClassName } from "@/components/tv/tv-row";
import { TvBrowseCard } from "@/components/tv/tv-see-all-tile";
import { useDocumentTitle } from "@/lib/use-document-title";
import { focusFirstHomeVideoItem, focusPrimaryContentItem } from "@/lib/tv-focus";
import { useMarkTvBootReadyWhen } from "@/components/tv/tv-boot-ready";
import { LibraryIcon } from "@/components/navbar";
import { preloadPosterList } from "@/lib/prefetch-artwork";
import type { HomeData } from "@/lib/server-api";

export function TvHomeView({ initialData = null }: { initialData?: HomeData | null }) {
  useDocumentTitle("Home");
  const [loaded, setLoaded] = useState(Boolean(initialData));
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>(
    initialData?.continueWatching ?? [],
  );
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>(
    initialData?.recentlyAdded ?? [],
  );
  const [favorites, setFavorites] = useState<MediaItem[]>(initialData?.favorites ?? []);
  const [libraries, setLibraries] = useState(initialData?.libraries ?? []);
  const [decks, setDecks] = useState(initialData?.decks ?? []);

  useMarkTvBootReadyWhen(loaded);

  useEffect(() => {
    if (initialData) return;
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
  }, [initialData]);

  useEffect(() => {
    if (!loaded) return;
    const seed =
      continueWatching.length > 0
        ? continueWatching.map((item) => ({
            id: item.mediaId,
            posterPath: item.posterPath,
            backdropPath: item.posterPath,
          }))
        : recentlyAdded;
    preloadPosterList(seed, 10);
  }, [loaded, continueWatching, recentlyAdded]);

  useEffect(() => {
    if (!loaded) return;
    requestAnimationFrame(() => {
      // Continue Watching is rendered first, so this selects the most
      // recently played video when available. Otherwise it selects the first
      // available poster before any browse/action cards.
      if (!focusFirstHomeVideoItem()) focusPrimaryContentItem();
    });
  }, [loaded]);

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

  const firstRowKey = continueWatching.length
    ? "continue"
    : favorites.length
      ? "favorites"
      : recentlyAdded.length
        ? "recent"
        : null;

  return (
    <div className="py-5">
      {continueWatching.length > 0 && (
        <TvRow
          title="Continue Watching"
          seeAllHref={routes.continueWatching()}
          seeAllLabel="Continue Watching"
          seeAllDetail="All in progress"
          prefetchItems={continueWatching.map((item) => ({
            id: item.mediaId,
            posterPath: item.posterPath,
            backdropPath: item.posterPath,
          }))}
        >
          {continueWatching.map((item, index) => (
            <TvPoster
              key={item.id}
              priority={firstRowKey === "continue" && index < 6}
              item={{
                id: item.mediaId,
                libraryId: 0,
                title: item.title,
                type: item.itemType === "movie" ? "movie" : "tv",
                posterPath: item.posterPath,
              }}
                href={
                  item.itemType === "movie"
                    ? routes.watch("movie", item.itemId, item.mediaId)
                    : routes.watch("episode", item.itemId, item.mediaId)
                }
              progress={item.percent}
              subtitle={item.subtitle}
            />
          ))}
        </TvRow>
      )}

      {favorites.length > 0 && (
        <TvRow
          title="Favorites"
          seeAllHref={routes.favorites()}
          seeAllLabel="Favorites"
          seeAllDetail={`${favorites.length}+ saved`}
          prefetchItems={favorites}
        >
          {favorites.map((item, index) => (
            <TvPoster key={item.id} item={item} priority={firstRowKey === "favorites" && index < 6} />
          ))}
        </TvRow>
      )}

      {recentlyAdded.length > 0 && (
        <TvRow
          title="Recently Added"
          seeAllHref={routes.recentlyAdded()}
          seeAllLabel="Recently Added"
          seeAllDetail="Full list"
          prefetchItems={recentlyAdded}
        >
          {recentlyAdded.map((item, index) => (
            <TvPoster key={item.id} item={item} priority={firstRowKey === "recent" && index < 6} />
          ))}
        </TvRow>
      )}

      {(decks.length > 0 || libraries.length > 0 || continueWatching.length > 0 || recentlyAdded.length > 0) && (
        <section className="tv-row-section mb-5">
          <h2 className="mb-2 px-8 text-base font-semibold tracking-tight text-muted-foreground">
            Browse
          </h2>
          <div
            data-tv-row=""
            data-tv-content-row=""
            data-tv-scroll-row=""
            className={tvScrollRowClassName}
          >
            {continueWatching.length > 0 && (
              <TvBrowseCard
                href={routes.continueWatching()}
                title="Continue Watching"
                detail={`${continueWatching.length} in progress`}
                icon={
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
                    <Play className="h-4 w-4 fill-current" />
                  </div>
                }
              />
            )}
            {recentlyAdded.length > 0 && (
              <TvBrowseCard
                href={routes.recentlyAdded()}
                title="Recently Added"
                detail={`${recentlyAdded.length} new titles`}
                icon={
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                }
              />
            )}
            <TvBrowseCard
              href={routes.favorites()}
              title="Favorites"
              detail={`${favorites.length} saved`}
              icon={
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Heart className="h-4 w-4" />
                </div>
              }
            />
            <TvBrowseCard
              href={routes.browse()}
              title="All collections"
              detail="Libraries & decks"
              icon={
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Layers className="h-4 w-4" />
                </div>
              }
            />
            {decks.map((deck) => (
              <TvBrowseCard
                key={`deck-${deck.id}`}
                href={routes.deck(deck.id)}
                title={deck.name}
                detail={`${deck.itemCount ?? 0} titles`}
              />
            ))}
            {libraries.map((lib) => (
              <TvBrowseCard
                key={`library-${lib.id}`}
                href={routes.library(lib.id)}
                title={lib.name}
                detail={`${lib.itemCount ?? 0} titles`}
                icon={
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <LibraryIcon type={lib.type} />
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      {!hasContent && (
        <div className="mx-auto max-w-xl px-8 py-20 text-center">
          <h2 className="mb-2 text-2xl font-bold">No media yet</h2>
          <p className="text-base text-muted-foreground">
            Add libraries on the desktop site, then come back here to browse.
          </p>
        </div>
      )}
    </div>
  );
}
