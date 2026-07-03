import { Suspense } from "react";
import { BrowseClient } from "./client";
import { Skeleton } from "@/components/ui/skeleton";

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Skeleton className="mb-8 h-10 w-40" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-md" />
            ))}
          </div>
        </div>
      }
    >
      <BrowseClient />
    </Suspense>
  );
}
