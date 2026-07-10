import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { FavoritesClient } from "./client";
import { fetchFavorites } from "@/lib/server-api";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const revalidate = 60;

export const metadata: Metadata = {
  title: pageMetadataTitle("Favorites"),
};

export default async function FavoritesPage() {
  const { data: initialPage } = await fetchFavorites(1);
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <FavoritesClient initialPage={initialPage} />
    </Suspense>
  );
}
