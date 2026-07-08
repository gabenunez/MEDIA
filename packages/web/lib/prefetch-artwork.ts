import { api, type MediaItem } from "@/lib/api";
import { prefetchMediaPage } from "@/lib/use-media-page-data";

const inflight = new Set<string>();

/** Warm the browser image cache for a poster/backdrop URL (deduped). */
export function preloadImageUrl(url: string | null | undefined): void {
  if (!url || inflight.has(url)) return;
  inflight.add(url);
  const img = new Image();
  img.decoding = "async";
  const done = () => inflight.delete(url);
  img.onload = done;
  img.onerror = done;
  img.src = url;
}

type PosterLike = Pick<MediaItem, "id" | "posterPath" | "backdropPath">;

/** Preload list artwork and warm the media detail JSON cache before navigation. */
export function prefetchPosterNavigation(item: PosterLike): void {
  if (!Number.isFinite(item.id)) return;
  prefetchMediaPage(item.id);
  preloadImageUrl(api.imageUrl(item.posterPath));
  preloadImageUrl(api.imageUrl(item.backdropPath ?? item.posterPath));
}

export function preloadPosterList(
  items: ReadonlyArray<PosterLike>,
  limit = 8,
): void {
  for (const item of items.slice(0, limit)) {
    preloadImageUrl(api.imageUrl(item.posterPath));
  }
}
