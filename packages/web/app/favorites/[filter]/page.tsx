import { Suspense } from "react";
import { FavoritesClient } from "../client";
import { Skeleton } from "@/components/ui/skeleton";

function FavoritesPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Skeleton className="mb-8 h-10 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function FavoritesFilterPage() {
  return (
    <Suspense fallback={<FavoritesPageSkeleton />}>
      <FavoritesClient />
    </Suspense>
  );
}
