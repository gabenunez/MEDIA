import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MediaLoadingSkeleton } from "@/lib/route-loading";
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
  return <MediaDetailClient mediaId={mediaId} />;
}
