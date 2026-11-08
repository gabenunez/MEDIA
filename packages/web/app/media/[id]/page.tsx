import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MediaLoadingSkeleton } from "@/lib/route-loading";
import { fetchMediaDetail } from "@/lib/server-api";
import { MediaDetailClient } from "../client";

export default function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MediaLoadingSkeleton />}>
      <MediaDetailRoute params={params} />
    </Suspense>
  );
}

async function MediaDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId) || mediaId <= 0) notFound();

  // Stream the cached media payload from RSC so the hero paints from the server
  // instead of a client round-trip. The client hook re-validates after paint.
  const { media } = await fetchMediaDetail(mediaId);
  return <MediaDetailClient mediaId={mediaId} initialMedia={media} />;
}
