"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Heart, Layers } from "lucide-react";
import { api, type Library, type LibraryDeck } from "@/lib/api";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LibraryIcon } from "@/components/navbar";
import { useDocumentTitle } from "@/lib/use-document-title";

export function BrowseClient() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [decks, setDecks] = useState<LibraryDeck[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useDocumentTitle("Browse");

  useEffect(() => {
    Promise.all([api.getLibraries(), api.getDecks(), api.getHome()])
      .then(([libs, deckList, home]) => {
        setLibraries(libs);
        setDecks(deckList);
        setFavoritesCount(home.favorites.length);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-4 border-b border-border/70 pb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <p className="mb-1 font-mono text-[0.68rem] uppercase text-primary">
            Library decks
          </p>
          <h1 className="text-3xl font-bold">Browse</h1>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href={routes.favorites()}
            className="group relative overflow-hidden rounded-md border border-border/80 bg-card/85 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card"
          >
            <div className="absolute inset-y-0 left-0 w-1 bg-primary/0 transition-colors group-hover:bg-primary" />
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <Heart className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold group-hover:text-primary">Favorites</h3>
                <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                  Saved titles / {favoritesCount} favorited
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </Link>

          {decks.map((deck) => (
            <Link
              key={`deck-${deck.id}`}
              href={routes.deck(deck.id)}
              className="group relative overflow-hidden rounded-md border border-border/80 bg-card/85 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-primary/0 transition-colors group-hover:bg-primary" />
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold group-hover:text-primary">{deck.name}</h3>
                  <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                    Custom / {deck.itemCount ?? 0} titles
                  </p>
                  {deck.libraryNames.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {deck.libraryNames.join(", ")}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            </Link>
          ))}

          {libraries.map((lib) => (
            <Link
              key={`library-${lib.id}`}
              href={routes.library(lib.id)}
              className="group relative overflow-hidden rounded-md border border-border/80 bg-card/85 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-primary/0 transition-colors group-hover:bg-primary" />
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                  <LibraryIcon type={lib.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold group-hover:text-primary">{lib.name}</h3>
                  <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                    {lib.type === "movies" ? "Full library" : "Full series"} /{" "}
                    {lib.itemCount ?? 0} titles
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
