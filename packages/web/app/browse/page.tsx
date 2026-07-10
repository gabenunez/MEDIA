import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { BrowseClient } from "./client";
import { BrowseLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Browse Files"),
};

export default function BrowsePage() {
  return (
    <Suspense fallback={<BrowseLoadingSkeleton />}>
      <BrowseClient />
    </Suspense>
  );
}
