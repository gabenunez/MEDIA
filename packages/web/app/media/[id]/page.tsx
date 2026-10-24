import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { mediaCacheLife } from "@/lib/catalog-cache";
import { notFound } from "next/navigation";
import { mediaPageCacheTag } from "@media-app/shared";
import { MediaHeroServer } from "../media-hero-server";
import { MediaPageBody } from "../media-page-body";
import { MediaRelatedServer } from "../media-related-server";
import { MediaDocumentTitle, MediaThemeShell } from "../media-chrome";
import { MediaAuthRequired } from "../media-auth-required";
import { asMediaDetail } from "../types";
import { DynamicMarker } from "@/lib/dynamic-marker";
import { fetchMediaDetail } from "@/lib/server-api";

export default function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={null}>
        <MediaDetailContent params={params} />
      </Suspense>
    </>
  );
}

async function MediaDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId) || mediaId <= 0) notFound();

  const { media: raw, unauthorized } = await fetchMediaDetail(mediaId);
  if (!raw && !unauthorized) notFound();
  if (unauthorized) return <MediaAuthRequired />;
  if (!raw) return null;

  const media = asMediaDetail(raw);

  return (
    <>
      <CachedMediaFrame mediaId={mediaId} />
      <Suspense fallback={null}>
        <MediaRelatedServer mediaId={mediaId} mediaType={media.type} />
      </Suspense>
    </>
  );
}

async function CachedMediaFrame({ mediaId }: { mediaId: number }) {
  "use cache";
  cacheLife(mediaCacheLife);
  cacheTag(mediaPageCacheTag(mediaId));
  const { media: raw, unauthorized } = await fetchMediaDetail(mediaId);
  if (unauthorized) return <MediaAuthRequired />;
  if (!raw) return null;

  const media = asMediaDetail(raw);
  const page = (
    <>
      <MediaDocumentTitle title={media.title} />
      <div data-web-only>
        <MediaHeroServer media={media} />
      </div>
      <MediaPageBody media={media} />
    </>
  );

  if (media.hasThemeMusic) {
    return <MediaThemeShell mediaId={media.id}>{page}</MediaThemeShell>;
  }

  return page;
}
