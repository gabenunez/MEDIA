import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MediaClient, MediaPageSkeleton } from "./client";

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
    <Suspense fallback={<MediaPageSkeleton />}>
      <MediaClient />
    </Suspense>
  );
}
