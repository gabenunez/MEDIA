import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadataTitle } from "@/lib/document-title";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";
import { ContinueWatchingClient } from "./client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Continue Watching"),
};

export default function ContinueWatchingPage() {
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <ContinueWatchingClient initialPage={null} />
    </Suspense>
  );
}
