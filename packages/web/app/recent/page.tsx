import type { Metadata } from "next";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife, skipCatalogPrerender } from "@/lib/catalog-cache";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { RecentClient } from "./client";
import { fetchRecentlyAdded } from "@/lib/server-api";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Recently Added"),
};

export default async function RecentPage() {
  if (skipCatalogPrerender()) {
    await connection();
    return (
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <RecentClient initialPage={null} />
      </Suspense>
    );
  }
  try {
    return await CachedRecent();
  } catch {
    await connection();
    return (
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <RecentClient initialPage={null} />
      </Suspense>
    );
  }
}

async function CachedRecent() {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const { data } = await fetchRecentlyAdded(1);
  if (!data) throw new Error("recent unavailable");
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <RecentClient initialPage={data} />
    </Suspense>
  );
}
