import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MediaClient } from "./client";
import { Skeleton } from "@/components/ui/skeleton";

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (id && /^\d+$/.test(id) && parseInt(id, 10) > 0) {
    redirect(`/media/${id}/`);
  }

  return (
    <Suspense
      fallback={
        <div>
          <Skeleton className="h-80 w-full" />
          <div className="mx-auto max-w-7xl px-6 py-10">
            <Skeleton className="mb-4 h-10 w-64" />
            <Skeleton className="h-24 w-full max-w-2xl" />
          </div>
        </div>
      }
    >
      <MediaClient />
    </Suspense>
  );
}
