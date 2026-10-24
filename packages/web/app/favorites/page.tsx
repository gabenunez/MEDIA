import type { Metadata } from "next";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife, skipCatalogPrerender } from "@/lib/catalog-cache";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { FavoritesClient } from "./client";
import { fetchFavorites } from "@/lib/server-api";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Favorites"),
};

export default async function FavoritesPage() {
  if (skipCatalogPrerender()) {
    await connection();
    return (
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <FavoritesClient initialPage={null} />
      </Suspense>
    );
  }
  try {
    return await CachedFavorites();
  } catch {
    await connection();
    return (
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <FavoritesClient initialPage={null} />
      </Suspense>
    );
  }
}

async function CachedFavorites() {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const { data } = await fetchFavorites(1);
  if (!data) throw new Error("favorites unavailable");
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <FavoritesClient initialPage={data} />
    </Suspense>
  );
}
