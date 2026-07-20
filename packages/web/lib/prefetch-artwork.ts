import { api, type MediaItem } from "@/lib/api";
import { nextOptimizedImageUrl } from "@/lib/next-image-url";
import { prefetchMediaPage } from "@/lib/use-media-page-data";
import { prefetchThemeMusic } from "@/components/theme-music-player";
import { TV_LIST_IMAGE_QUALITY, tvImageUrl } from "@/lib/tv-image";
import { isTvClient } from "@/lib/tv-mode-detect";

const inflight = new Set<string>();
/** Match TV poster CSS width (~7.5–10rem) to Next imageSizes. */
const TV_LIST_POSTER_WIDTH = 256;
const DESKTOP_LIST_POSTER_WIDTH = 384;
const FOCUS_NAV_DWELL_MS = 160;

const pendingNavPrefetch = new Map<number, number>();

/** Warm the browser image cache for a poster/backdrop URL (deduped). */
export function preloadImageUrl(
  url: string | null | undefined,
  width = 384,
  quality = 75,
): void {
  if (!url) return;
  const optimized = nextOptimizedImageUrl(url, width, quality);
  if (inflight.has(optimized)) return;
  inflight.add(optimized);
  const img = new Image();
  img.decoding = "async";
  const done = () => inflight.delete(optimized);
  img.onload = done;
  img.onerror = done;
  img.src = optimized;
}

type PosterLike = Pick<MediaItem, "id" | "posterPath" | "backdropPath">;

function listPosterWidth() {
  return isTvClient() ? TV_LIST_POSTER_WIDTH : DESKTOP_LIST_POSTER_WIDTH;
}

function warmListPoster(item: PosterLike) {
  preloadImageUrl(
    tvImageUrl(item.posterPath) ?? api.imageUrl(item.posterPath),
    listPosterWidth(),
    TV_LIST_IMAGE_QUALITY,
  );
}

/** Heavy detail warm-up — media JSON, theme, hero backdrop. */
export function prefetchPosterNavigation(item: PosterLike): void {
  if (!Number.isFinite(item.id)) return;
  prefetchMediaPage(item.id);
  prefetchThemeMusic(item.id);
  warmListPoster(item);
  // Media heroes use `sizes="100vw"`, so a 384px warm-up does not match the
  // eventual image request. Warm the desktop/TV hero-sized variant instead.
  preloadImageUrl(
    tvImageUrl(item.backdropPath ?? item.posterPath, { hd: true }),
    1920,
    TV_LIST_IMAGE_QUALITY,
  );
}

/**
 * Focus/hover warm-up for TV: only the list poster immediately; defer detail
 * prefetch until the focus dwells so rapid D-pad scrolling does not storm the network.
 */
export function prefetchPosterFocus(item: PosterLike): void {
  if (!Number.isFinite(item.id)) return;
  warmListPoster(item);

  if (!isTvClient()) {
    prefetchPosterNavigation(item);
    return;
  }

  const existing = pendingNavPrefetch.get(item.id);
  if (existing != null) window.clearTimeout(existing);

  const timer = window.setTimeout(() => {
    pendingNavPrefetch.delete(item.id);
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: IdleRequestCallback) => window.setTimeout(() => cb({} as IdleDeadline), 1);
    idle(() => prefetchPosterNavigation(item));
  }, FOCUS_NAV_DWELL_MS);
  pendingNavPrefetch.set(item.id, timer);
}

export function preloadPosterList(
  items: ReadonlyArray<PosterLike>,
  limit = 8,
): void {
  for (const item of items.slice(0, limit)) {
    warmListPoster(item);
  }
}

/** Preload poster images for items visible in a horizontal carousel (+ nearby tiles). */
export function prefetchCarouselPosters(
  scroller: HTMLElement,
  items: ReadonlyArray<PosterLike>,
): void {
  const containerRect = scroller.getBoundingClientRect();
  const margin = 280;

  scroller.childNodes.forEach((node, index) => {
    if (!(node instanceof HTMLElement)) return;
    const item = items[index];
    if (!item) return;

    const rect = node.getBoundingClientRect();
    const inRange =
      rect.right >= containerRect.left - margin &&
      rect.left <= containerRect.right + margin;

    if (inRange) {
      warmListPoster(item);
    }
  });
}
