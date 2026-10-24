import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { catalogCacheLife } from "@/lib/catalog-cache";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { LibraryClient } from "../client";
import { fetchLibraryItems } from "@/lib/server-api";
import { DynamicMarker } from "@/lib/dynamic-marker";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Library"),
};

export default function LibraryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<PosterGridLoadingSkeleton />}>
        <LibraryDetailContent params={params} />
      </Suspense>
    </>
  );
}

async function LibraryDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const libraryId = parseInt(id, 10);
  if (!Number.isFinite(libraryId)) return <LibraryClient />;

  try {
    return await CachedLibrary({ libraryId });
  } catch {
    return <LibraryClient />;
  }
}

async function CachedLibrary({ libraryId }: { libraryId: number }) {
  "use cache";
  cacheLife(catalogCacheLife);
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const { data } = await fetchLibraryItems(libraryId, 1);
  if (!data) throw new Error("library unavailable");
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <LibraryClient
        initialList={{
          kind: "library",
          id: libraryId,
          page: data,
          title: "Browse Titles",
          subtitle: "Full library",
        }}
      />
    </Suspense>
  );
}
