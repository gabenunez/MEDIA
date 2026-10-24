import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DynamicMarker } from "@/lib/dynamic-marker";
import { MediaClient, MediaPageSkeleton } from "./client";

export default function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<MediaPageSkeleton />}>
        <LegacyMediaRedirect searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LegacyMediaRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (id && /^\d+$/.test(id) && parseInt(id, 10) > 0) {
    redirect(`/media/${id}/`);
  }

  return <MediaClient />;
}
