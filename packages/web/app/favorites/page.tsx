import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadataTitle } from "@/lib/document-title";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";
import { FavoritesClient } from "./client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Favorites"),
};

export default function FavoritesPage() {
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <FavoritesClient initialPage={null} />
    </Suspense>
  );
}
