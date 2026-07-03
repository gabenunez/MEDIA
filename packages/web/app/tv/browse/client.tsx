"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type Library, type LibraryDeck } from "@/lib/api";
import { tvRoutes } from "@/lib/tv/routes";
import { TvFocusLink } from "@/components/tv/tv-focus-link";
import { LibraryIcon } from "@/components/navbar";
import { useDocumentTitle } from "@/lib/use-document-title";

export function TvBrowseClient() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [decks, setDecks] = useState<LibraryDeck[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentTitle("Browse");

  useEffect(() => {
    Promise.all([api.getLibraries(), api.getDecks()])
      .then(([libs, deckList]) => {
        setLibraries(libs);
        setDecks(deckList);
      })
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
      <h1 className="mb-8 text-3xl font-black">Browse</h1>
      <div data-tv-row="" className="flex flex-col gap-4">
        <TvFocusLink
          href={tvRoutes.favorites()}
          className="rounded-xl border border-border/80 bg-card p-5 text-lg font-semibold"
        >
          Favorites
        </TvFocusLink>
        {decks.map((deck) => (
          <TvFocusLink
            key={deck.id}
            href={tvRoutes.deck(deck.id)}
            className="rounded-xl border border-border/80 bg-card p-5"
          >
            <p className="text-lg font-semibold">{deck.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Deck · {deck.itemCount ?? 0} titles
            </p>
          </TvFocusLink>
        ))}
        {libraries.map((lib) => (
          <TvFocusLink
            key={lib.id}
            href={tvRoutes.library(lib.id)}
            className="flex items-center gap-4 rounded-xl border border-border/80 bg-card p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LibraryIcon type={lib.type} />
            </div>
            <div>
              <p className="text-lg font-semibold">{lib.name}</p>
              <p className="text-sm text-muted-foreground">
                {lib.type === "movies" ? "Movies" : "TV"} · {lib.itemCount ?? 0} titles
              </p>
            </div>
          </TvFocusLink>
        ))}
      </div>
    </div>
  );
}
