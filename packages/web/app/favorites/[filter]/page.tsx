import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife } from "@/lib/catalog-cache";
import { Suspense } from "react";
import { FavoritesClient } from "../client";
import { pageMetadataTitle } from "@/lib/document-title";
import { fetchFavorites } from "@/lib/server-api";
import { DynamicMarker } from "@/lib/dynamic-marker";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Favorites"),
};

export default function FavoritesFilterPage({
  params,
}: {
  params: Promise<{ filter: string }>;
}) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <FavoritesFilterContent params={params} />
      </Suspense>
    </>
  );
}

async function FavoritesFilterContent({
  params,
}: {
  params: Promise<{ filter: string }>;
}) {
  const { filter } = await params;
  const type = filter === "movie" || filter === "tv" ? filter : "all";
  try {
    return await CachedFavoriteFilter({ type });
  } catch {
    return <FavoritesClient initialPage={null} />;
  }
}

async function CachedFavoriteFilter({ type }: { type: "movie" | "tv" | "all" }) {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const { data } = await fetchFavorites(1, type === "all" ? undefined : type);
  if (!data) throw new Error("favorites unavailable");
  return <FavoritesClient initialPage={data} />;
}
