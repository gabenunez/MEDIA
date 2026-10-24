import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadataTitle } from "@/lib/document-title";
import { PosterGridLoadingSkeleton } from "@/lib/route-loading";
import { RecentClient } from "./client";

export const metadata: Metadata = {
  title: pageMetadataTitle("Recently Added"),
};

export default function RecentPage() {
  return (
    <Suspense fallback={<PosterGridLoadingSkeleton />}>
      <RecentClient initialPage={null} />
    </Suspense>
  );
}
