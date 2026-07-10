import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { ContinueWatchingClient } from "./client";
import { fetchContinueWatching } from "@/lib/server-api";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";

export const revalidate = 60;

export const metadata: Metadata = {
  title: pageMetadataTitle("Continue Watching"),
};

export default async function ContinueWatchingPage() {
  const { data: initialPage } = await fetchContinueWatching(1);
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <ContinueWatchingClient initialPage={initialPage} />
    </Suspense>
  );
}
