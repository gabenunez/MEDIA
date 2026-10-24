import type { Metadata } from "next";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife, skipCatalogPrerender } from "@/lib/catalog-cache";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { ContinueWatchingClient } from "./client";
import { fetchContinueWatching } from "@/lib/server-api";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Continue Watching"),
};

export default async function ContinueWatchingPage() {
  if (skipCatalogPrerender()) {
    await connection();
    return (
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <ContinueWatchingClient initialPage={null} />
      </Suspense>
    );
  }
  try {
    return await CachedContinue();
  } catch {
    await connection();
    return (
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <ContinueWatchingClient initialPage={null} />
      </Suspense>
    );
  }
}

async function CachedContinue() {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const { data } = await fetchContinueWatching(1);
  if (!data) throw new Error("continue unavailable");
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <ContinueWatchingClient initialPage={data} />
    </Suspense>
  );
}
