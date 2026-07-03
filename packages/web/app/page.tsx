"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  HardDrive,
  Layers,
  Play,
  RadioTower,
  Settings,
} from "lucide-react";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useScanStatus } from "@/components/scan-status-provider";
import { ContinueWatchingRow, MediaRow } from "@/components/media-row";
import { ScanProgressBanner } from "@/components/scan-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { LibraryIcon } from "@/components/navbar";

export default function HomePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getHome>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const { status, activeScan, isScanning } = useScanStatus();
  const wasScanningRef = useRef(false);

  useEffect(() => {
    api
      .getHome()
      .then(setData)
      .catch((err) => console.warn("Failed to load home data", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isScanning) {
      if (wasScanningRef.current) {
        api.getHome().then(setData).catch(console.error);
      }
      wasScanningRef.current = false;
      return;
    }

    wasScanningRef.current = true;
    const interval = setInterval(() => {
      api.getHome().then(setData).catch(console.error);
    }, 1500);

    return () => clearInterval(interval);
  }, [isScanning]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="mb-8 h-12 w-64 rounded-md" />
        <div className="flex gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-44 shrink-0 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const libraries = (data?.libraries ?? []).map((lib) => {
    const live = status?.libraries.find((entry) => entry.id === lib.id);
    return live ? { ...lib, itemCount: live.itemCount } : lib;
  });
  const decks = data?.decks ?? [];
  const recentlyAdded = data?.recentlyAdded ?? [];
  const continueWatching = data?.continueWatching ?? [];
  const featured = recentlyAdded[0];
  const featuredImage = api.imageUrl(featured?.backdropPath ?? featured?.posterPath);
  const totalItems = libraries.reduce(
    (sum, library) => sum + (library.itemCount ?? 0),
    0,
  );

  return (
    <div className="pb-16">
      <section className="relative mb-12 overflow-hidden border-b border-border/70 px-4 py-10 sm:px-6 sm:py-12">
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.7fr)] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[0.68rem] uppercase text-primary">
              <RadioTower className="h-3.5 w-3.5" />
              {isScanning ? "Scan in progress" : "Signal online"}
            </div>

            <h1 className="mb-4 text-5xl font-black sm:text-7xl">Reel</h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              A private cinema console for movies, seasons, and instant local
              playback.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {featured && (
                <Button size="lg" asChild>
                  <Link href={routes.media(featured.id)}>
                    <Play className="h-5 w-5 fill-current" />
                    Open latest
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="lg" asChild>
                <Link href="/settings">
                  <Settings className="h-5 w-5" />
                  Console
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-3 divide-x divide-border/70 border-y border-border/70">
              <div className="px-3 py-4 sm:px-5">
                <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                  Libraries
                </p>
                <p className="mt-1 text-2xl font-bold">{libraries.length}</p>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                  Titles
                </p>
                <p className="mt-1 text-2xl font-bold">{totalItems}</p>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <p className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                  Metadata
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {status?.tmdbConfigured ? "On" : "Off"}
                </p>
              </div>
            </div>

            {activeScan && (
              <ScanProgressBanner scan={activeScan} className="mt-6 max-w-2xl" />
            )}

            {!status?.tmdbConfigured && (
              <div className="mt-4 max-w-2xl rounded-md border border-amber-400/35 bg-amber-400/10 px-4 py-3">
                <p className="text-sm text-amber-100">
                  TMDB is off. Add a key in{" "}
                  <Link href="/settings" className="text-accent underline">
                    Settings
                  </Link>{" "}
                  to pull posters and metadata.
                </p>
              </div>
            )}
          </div>

          <div className="relative min-h-[320px] overflow-hidden rounded-md border border-border/80 bg-card poster-shadow">
            {featuredImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={featuredImage}
                alt={featured?.title ?? ""}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="signal-grid absolute inset-0" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <p className="mb-2 font-mono text-[0.68rem] uppercase text-primary">
                Latest ingest
              </p>
              {featured ? (
                <>
                  <h2 className="line-clamp-2 text-2xl font-bold">
                    {featured.title}
                  </h2>
                  <div className="mt-4 flex items-center gap-3">
                    <Button size="sm" asChild>
                      <Link href={routes.media(featured.id)}>
                        <Play className="h-4 w-4 fill-current" />
                        Play
                      </Link>
                    </Button>
                    <span className="font-mono text-[0.68rem] uppercase text-muted-foreground">
                      {featured.type === "movie" ? "Film" : "Series"}
                      {featured.year ? ` / ${featured.year}` : ""}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <Clapperboard className="mb-4 h-12 w-12 text-primary" />
                    <h2 className="text-2xl font-bold">Library waiting</h2>
                  </div>
                  <Button size="sm" asChild>
                    <Link href="/settings">
                      Add source
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <ContinueWatchingRow items={continueWatching} />

      <MediaRow title="Recently Added" items={recentlyAdded} />

      {(decks.length > 0 || libraries.length > 0) && (
        <section className="mx-auto mb-10 max-w-7xl px-4 sm:px-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <h2 className="text-lg font-semibold sm:text-xl">Library Decks</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    <h3 className="truncate font-semibold group-hover:text-primary">
                      {deck.name}
                    </h3>
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
                    <h3 className="truncate font-semibold group-hover:text-primary">
                      {lib.name}
                    </h3>
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
        </section>
      )}

      {(!libraries.length || !recentlyAdded.length) && !isScanning && (
        <div className="mx-auto max-w-lg border-y border-border/70 px-6 py-16 text-center">
          <HardDrive className="mx-auto mb-4 h-14 w-14 text-primary" />
          <h2 className="mb-2 text-2xl font-semibold">No media yet</h2>
          <p className="mb-6 text-muted-foreground">
            Add movie and TV folders in Settings, then scan them into Reel.
          </p>
          <Button asChild>
            <Link href="/settings">
              Open console
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
