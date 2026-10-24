"use client";

import { Suspense } from "react";
import { useMediaRouteId } from "@/lib/use-route-params";
import { useIsClient } from "@/lib/use-browser-pathname";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTvMode } from "@/lib/tv-mode";
import { TvMediaView } from "@/components/tv/views/media-view";
import { MediaDesktopSeasons } from "./media-desktop-seasons";
import { MediaRow } from "@/components/media-row";
import { MediaHero } from "./media-hero";
import { MediaDocumentTitle, MediaThemeShell } from "./media-chrome";
import { asMediaDetail } from "./types";
import { useMediaPageData } from "@/lib/use-media-page-data";
import { routes } from "@/lib/routes";

export function MediaPageSkeleton() {
  return (
    <div>
      <Skeleton className="h-80 w-full" />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-24 w-full max-w-2xl" />
      </div>
    </div>
  );
}

/** Legacy `/media?id=` route — dynamic client fetch with Suspense. */
export function MediaClient() {
  const isTvMode = useTvMode();
  return (
    <Suspense fallback={<MediaPageSkeleton />}>
      {isTvMode ? <LegacyTvMedia /> : <LegacyDesktopMedia />}
    </Suspense>
  );
}

function LegacyDesktopMedia() {
  const isClient = useIsClient();
  const mediaId = useMediaRouteId();

  if (!mediaId || Number.isNaN(mediaId)) {
    if (!isClient) return <MediaPageSkeleton />;
    return (
      <div className="py-20 text-center">
        <p>Invalid media</p>
        <Button asChild className="mt-4">
          <Link href={routes.home()}>Go Home</Link>
        </Button>
      </div>
    );
  }

  return <LegacyDesktopMediaResolved mediaId={mediaId} />;
}

function LegacyDesktopMediaResolved({ mediaId }: { mediaId: number }) {
  return <DesktopMediaDetail mediaId={mediaId} />;
}

export function MediaDetailClient({ mediaId }: { mediaId: number }) {
  const isTvMode = useTvMode();
  if (isTvMode) return <TvMediaView mediaId={mediaId} />;
  return <DesktopMediaDetail mediaId={mediaId} />;
}

function DesktopMediaDetail({ mediaId }: { mediaId: number }) {
  const { media: mediaRecord, related, missing } = useMediaPageData(mediaId);
  if (missing) {
    return (
      <div className="py-20 text-center">
        <p>Title not found</p>
        <Button asChild className="mt-4">
          <Link href={routes.home()}>Go Home</Link>
        </Button>
      </div>
    );
  }
  if (!mediaRecord) return <MediaPageSkeleton />;

  const media = asMediaDetail(mediaRecord);
  const relatedTitle =
    media.type === "movie" ? "More films in your library" : "More series in your library";
  const page = (
    <>
      <MediaDocumentTitle title={media.title} />
      <MediaHero media={media} />
      <MediaDesktopSeasons media={media} />
      {related.length > 0 && (
        <section className="border-t border-border/70 pb-12 pt-10">
          <MediaRow title={relatedTitle} items={related} />
        </section>
      )}
    </>
  );

  if (media.hasThemeMusic) {
    return <MediaThemeShell mediaId={media.id}>{page}</MediaThemeShell>;
  }
  return page;
}

function LegacyTvMedia() {
  return <TvMediaView />;
}
