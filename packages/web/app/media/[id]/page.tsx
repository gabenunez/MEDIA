import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MediaClient } from "../client";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMediaDetail } from "@/lib/server-api";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

function MediaPageSkeleton() {
  return (
    <div>
      <Skeleton className="h-80 w-full" />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-24 w-full max-w-2xl" />
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId)) return {};
  const { media } = await fetchMediaDetail(mediaId);
  const title = typeof media?.title === "string" ? media.title : undefined;
  return title ? { title } : {};
}

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId) || mediaId <= 0) notFound();

  const { media: initialMedia, unauthorized } = await fetchMediaDetail(mediaId);
  if (!initialMedia && !unauthorized) notFound();

  return (
    <Suspense fallback={<MediaPageSkeleton />}>
      <MediaClient mediaId={mediaId} initialMedia={initialMedia ?? undefined} />
    </Suspense>
  );
}
