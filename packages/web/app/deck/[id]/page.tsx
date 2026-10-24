import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadataTitle } from "@/lib/document-title";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";
import { LibraryClient } from "../../library/client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Deck"),
};

export default function DeckDetailPage() {
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <LibraryClient />
    </Suspense>
  );
}
