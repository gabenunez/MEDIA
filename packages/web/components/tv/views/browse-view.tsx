"use client";

import { useEffect, useState } from "react";
import { Heart, Play, Sparkles } from "lucide-react";
import { api, type Library, type LibraryDeck } from "@/lib/api";
import { routes } from "@/lib/routes";
import {
  TvPageHeader,
  TvPageLoading,
  TvPageShell,
  tvPageMeta,
} from "@/components/tv/tv-page-header";
import { TvBrowseCard } from "@/components/tv/tv-see-all-tile";
import { LibraryIcon } from "@/components/navbar";
import { useDocumentTitle } from "@/lib/use-document-title";
import { focusFirstContentItem } from "@/lib/tv-focus";
import { useMarkTvBootReadyWhen } from "@/components/tv/tv-boot-ready";

export function TvBrowseView() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [decks, setDecks] = useState<LibraryDeck[]>([]);
  const [continueCount, setContinueCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useMarkTvBootReadyWhen(!loading);

  useDocumentTitle("Browse");

  useEffect(() => {
    Promise.all([
      api.getLibraries(),
      api.getDecks(),
      api.getContinueWatching(1),
      api.getRecentlyAdded(1),
    ])
      .then(([libs, deckList, continueData, recentData]) => {
        setLibraries(libs);
        setDecks(deckList);
        setContinueCount(continueData.total ?? continueData.items.length);
        setRecentCount(recentData.total ?? recentData.items.length);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    focusFirstContentItem();
  }, [loading]);

  if (loading) {
    return <TvPageLoading />;
  }

  const shortcutCount =
    (continueCount > 0 ? 1 : 0) + (recentCount > 0 ? 1 : 0) + 1;
  const totalEntries = shortcutCount + decks.length + libraries.length;

  return (
    <TvPageShell>
      <TvPageHeader
        backHref={routes.home()}
        title="Browse"
        subtitle={tvPageMeta([`${totalEntries} collections`])}
      />

      <div
        data-tv-row=""
        data-tv-content-row=""
        data-tv-scroll-row=""
        className="scrollbar-hide flex gap-4 overflow-x-auto py-1"
      >
        {continueCount > 0 && (
          <TvBrowseCard
            href={routes.continueWatching()}
            title="Continue Watching"
            detail={`${continueCount} in progress`}
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
                <Play className="h-4 w-4 fill-current" />
              </div>
            }
          />
        )}
        {recentCount > 0 && (
          <TvBrowseCard
            href={routes.recentlyAdded()}
            title="Recently Added"
            detail={`${recentCount} titles`}
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
          detail="Saved titles"
          icon={
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Heart className="h-4 w-4" />
            </div>
          }
        />
        {decks.map((deck) => (
          <TvBrowseCard
            key={deck.id}
            href={routes.deck(deck.id)}
            title={deck.name}
            detail={`Deck · ${deck.itemCount ?? 0} titles`}
          />
        ))}
        {libraries.map((lib) => (
          <TvBrowseCard
            key={lib.id}
            href={routes.library(lib.id)}
            title={lib.name}
            detail={`${lib.type === "movies" ? "Movies" : "TV"} · ${lib.itemCount ?? 0} titles`}
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <LibraryIcon type={lib.type} />
              </div>
            }
          />
        ))}
      </div>
    </TvPageShell>
  );
}
