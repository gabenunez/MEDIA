import type { Metadata } from "next";
import { pageMetadataTitle } from "@/lib/document-title";
import { Suspense } from "react";
import { SearchClient } from "./client";
import { SearchLoadingSkeleton } from "@/lib/route-loading";

export const metadata: Metadata = {
  title: pageMetadataTitle("Search"),
};

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchLoadingSkeleton />}>
      <SearchClient />
    </Suspense>
  );
}
