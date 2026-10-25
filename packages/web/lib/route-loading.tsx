"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { markTvBootContentReady } from "@/lib/tv-boot-ready";
import { useTvMode } from "@/lib/tv-mode";

function RouteLoading({ children }: { children: ReactNode }) {
  const isTvMode = useTvMode();

  // A slow catalog fetch must not leave the TV body hidden until the 15s
  // boot cap. The skeleton itself is the ready state.
  useLayoutEffect(() => {
    markTvBootContentReady();
  }, []);

  if (isTvMode) {
    // Opaque page fill only — never a bordered loading chip. Back from watch
    // (and other soft nav) can flash loading.tsx briefly; button-like chrome
    // is worse than a quiet background until the destination paints.
    return (
      <div
        data-tv-route-loading=""
        className="min-h-[80vh] bg-background"
        role="status"
        aria-label="Loading"
      />
    );
  }

  // Opaque fill so the body grid is not visible while the destination RSC loads.
  return <div className="min-h-[80vh] bg-background">{children}</div>;
}

export function HomeLoadingSkeleton() {
  return <RouteLoading>
    <div className="pb-16">
      <Skeleton className="mb-14 h-96 w-full" />
      <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-32 shrink-0 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  </RouteLoading>;
}

export function PosterGridLoadingSkeleton() {
  return <RouteLoading>
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Skeleton className="mb-8 h-10 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-md" />
        ))}
      </div>
    </div>
  </RouteLoading>;
}

export function BrowseLoadingSkeleton() {
  return <RouteLoading>
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Skeleton className="mb-8 h-10 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-md" />
        ))}
      </div>
    </div>
  </RouteLoading>;
}

export function WatchLoadingSkeleton() {
  const isTvMode = useTvMode();

  useLayoutEffect(() => {
    markTvBootContentReady();
  }, []);

  // Full-bleed black cover — must sit above the TV rail so media→watch does not
  // flash a padded centered card while the sidebar width changes.
  if (isTvMode) {
    return (
      <div
        data-tv-route-loading=""
        data-tv-watch-loading=""
        className="fixed inset-0 z-40 flex items-center justify-center bg-black"
        role="status"
        aria-label="Loading"
      >
        <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Skeleton className="h-10 w-40" />
    </div>
  );
}

export function SettingsLoadingSkeleton() {
  return <RouteLoading>
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-48 w-full rounded-md" />
      <Skeleton className="h-48 w-full rounded-md" />
    </div>
  </RouteLoading>;
}

export function SearchLoadingSkeleton() {
  return <RouteLoading>
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <Skeleton className="h-10 w-56" />
    </div>
  </RouteLoading>;
}

/** Poster, title, and episode rows while a TV title page is still loading. */
export function TvMediaPageSkeleton() {
  useLayoutEffect(() => {
    markTvBootContentReady();
  }, []);

  return (
    <div
      className="tv-media-page"
      data-tv-route-loading=""
      role="status"
      aria-label="Loading"
    >
      <section className="relative mb-4 overflow-hidden">
        <div className="tv-media-hero bg-muted/40" aria-hidden />
        <div className="relative z-10 tv-media-gutter">
          <div className="flex items-start gap-4">
            <Skeleton className="tv-media-poster aspect-[2/3] shrink-0 shadow-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-3 w-24 shadow-none" />
              <Skeleton className="h-8 w-2/3 max-w-md shadow-none" />
              <Skeleton className="h-4 w-full max-w-xl shadow-none" />
              <Skeleton className="h-4 w-4/5 max-w-lg shadow-none" />
              <div className="mt-2 flex gap-2">
                <Skeleton className="h-10 w-28 shadow-none" />
                <Skeleton className="h-10 w-28 shadow-none" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="tv-media-gutter flex flex-col gap-2">
        <Skeleton className="h-4 w-24 shadow-none" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full shadow-none" />
        ))}
      </div>
    </div>
  );
}

export function MediaLoadingSkeleton() {
  // Desktop skeleton and TV page skeleton are both in the HTML. The TV class
  // on <html> picks the TV layout before paint.
  useLayoutEffect(() => {
    markTvBootContentReady();
  }, []);

  return (
    <>
      <div data-tv-only>
        <TvMediaPageSkeleton />
      </div>
      <div data-web-only className="min-h-[60vh] bg-background" role="status" aria-label="Loading">
        <Skeleton className="h-80 w-full" />
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <Skeleton className="mb-4 h-10 w-64" />
          <Skeleton className="h-24 w-full max-w-2xl" />
        </div>
      </div>
    </>
  );
}
