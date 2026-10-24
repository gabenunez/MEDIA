import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadataTitle } from "@/lib/document-title";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";
import { LibraryClient } from "../client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Library"),
};

export default function LibraryDetailPage() {
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <LibraryClient />
    </Suspense>
  );
}
