import type { Metadata } from "next";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife, skipCatalogPrerender } from "@/lib/catalog-cache";
import { HomeClient } from "./home-client";
import { pageMetadataTitle } from "@/lib/document-title";
import { fetchHome } from "@/lib/server-api";

export const metadata: Metadata = {
  title: pageMetadataTitle("Home"),
};

export default async function HomePage() {
  // A build without the prerender API cannot fill this cache. Stay dynamic
  // so that empty result is not baked into the static shell.
  if (skipCatalogPrerender()) {
    await connection();
    return <HomeClient initialData={null} />;
  }
  try {
    return await CachedHome();
  } catch {
    await connection();
    return <HomeClient initialData={null} />;
  }
}

async function CachedHome() {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const { data } = await fetchHome();
  // Throw so a down API is not stored for the cache lifetime.
  if (!data) throw new Error("home unavailable");
  return <HomeClient initialData={data} />;
}
