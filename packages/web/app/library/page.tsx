import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { LibraryClient } from "./client";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Library"),
};

export default function LibraryPage() {
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <LibraryClient />
    </Suspense>
  );
}
