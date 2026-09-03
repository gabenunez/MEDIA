import { api, type MediaItem } from "@/lib/api";
import {
  browserImageUrl,
  PLAYBACK_IMAGE_QUALITY,
  PLAYBACK_IMAGE_WIDTH,
} from "@/lib/next-image-url";
import { routes } from "@/lib/routes";
import {
  findNextEpisode,
  nextEpisodeArtworkPaths,
  type NextEpisodeInfo,
  type PlaybackMediaDetail,
} from "@/lib/playback-utils";
import { peekApiCache } from "@/lib/api-cache";
import { prefetchMediaPage } from "@/lib/use-media-page-data";
import { prefetchThemeMusic } from "@/components/theme-music-player";
import { TV_HERO_IMAGE_QUALITY, TV_LIST_IMAGE_QUALITY, tvImageUrl } from "@/lib/tv-image";
import { isTvClient } from "@/lib/tv-mode-detect";

const inflight = new Set<string>();
const warmed = new Set<string>();
/** Match TV poster CSS width (~7.5–10rem) to Next imageSizes. */
const TV_LIST_POSTER_WIDTH = 256;
const DESKTOP_LIST_POSTER_WIDTH = 384;
const FOCUS_NAV_DWELL_MS = 160;

let pendingHeavyPrefetchTimer: number | null = null;
const prefetchedRoutes = new Set<string>();

function hintDocumentImagePreload(href: string): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = href;
  document.head.appendChild(link);
}

/** Warm the browser image cache for a poster/backdrop URL (deduped). */
export function preloadImageUrl(
  url: string | null | undefined,
  width = 384,
  quality = 75,
  options?: { documentHint?: boolean },
): void {
  if (!url) return;
  const warmedUrl = browserImageUrl(url, width, quality);
  if (warmed.has(warmedUrl) || inflight.has(warmedUrl)) return;
  inflight.add(warmedUrl);
  if (options?.documentHint) {
    hintDocumentImagePreload(warmedUrl);
  }
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    inflight.delete(warmedUrl);
    warmed.add(warmedUrl);
  };
  img.onerror = () => inflight.delete(warmedUrl);
  img.src = warmedUrl;
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
    TV_HERO_IMAGE_QUALITY,
  );
}

export function prefetchTvRoute(
  router: { prefetch: (href: string) => void } | undefined,
  href: string | undefined,
): void {
  if (!router || !href || prefetchedRoutes.has(href)) return;
  prefetchedRoutes.add(href);
  router.prefetch(href);
}

/**
 * Focus/hover warm-up for TV: list poster + destination route immediately.
 * Defer media JSON / theme / hero until the focus dwells — and only for the
 * last focused tile so D-pad scrolling does not storm the network.
 */
export function prefetchPosterFocus(
  item: PosterLike,
  router?: { prefetch: (href: string) => void },
  href?: string,
): void {
  if (!Number.isFinite(item.id)) return;
  warmListPoster(item);
  prefetchTvRoute(router, href ?? routes.media(item.id));

  if (!isTvClient()) {
    prefetchPosterNavigation(item);
    return;
  }

  if (pendingHeavyPrefetchTimer != null) {
    window.clearTimeout(pendingHeavyPrefetchTimer);
  }

  pendingHeavyPrefetchTimer = window.setTimeout(() => {
    pendingHeavyPrefetchTimer = null;
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: IdleRequestCallback) => window.setTimeout(() => cb({} as IdleDeadline), 1);
    idle(() => prefetchPosterNavigation(item));
  }, FOCUS_NAV_DWELL_MS);
}

/** Warm a 16:9 still / hero so the up-next overlay can paint immediately. */
export function preloadPlaybackStill(path?: string | null): void {
  preloadImageUrl(
    tvImageUrl(path, { hd: true }) ?? api.imageUrl(path),
    PLAYBACK_IMAGE_WIDTH,
    PLAYBACK_IMAGE_QUALITY,
    { documentHint: true },
  );
}

/** Warm every still/backdrop/poster the up-next overlay and next watch page use. */
export function preloadNextEpisodeArtwork(
  next: NextEpisodeInfo,
  media?: PlaybackMediaDetail | null,
): void {
  for (const path of nextEpisodeArtworkPaths(next, media)) {
    preloadPlaybackStill(path);
  }
}

/**
 * Start next-episode artwork as soon as media JSON arrives — before countdown
 * or the next watch page begins loading.
 */
export function warmNextEpisodeArtwork(
  type: "movie" | "episode",
  media: PlaybackMediaDetail | null | undefined,
  currentEpisodeId: number,
): void {
  if (type !== "episode" || !media) return;
  const next = findNextEpisode(media, currentEpisodeId);
  if (!next) return;
  preloadNextEpisodeArtwork(next, media);
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

  const tiles = Array.from(scroller.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );

  tiles.forEach((node, index) => {
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

/** Warm the post-watch route so Back is not a blank layout while RSC loads. */
export function prefetchWatchExitTarget(
  router: { prefetch: (href: string) => void },
  href: string,
  mediaId?: string | number | null,
): void {
  prefetchTvRoute(router, href);
  const id =
    typeof mediaId === "number"
      ? mediaId
      : mediaId
        ? parseInt(String(mediaId), 10)
        : NaN;
  if (Number.isNaN(id)) return;
  prefetchMediaPage(id);
  const cached = peekCachedMediaArtwork(id);
  if (cached) {
    warmListPoster(cached);
    preloadImageUrl(
      tvImageUrl(cached.backdropPath ?? cached.posterPath, { hd: true }),
      1920,
      TV_HERO_IMAGE_QUALITY,
    );
  }
}

function peekCachedMediaArtwork(mediaId: number): PosterLike | null {
  const cached = peekApiCache<Record<string, unknown>>(`media:${mediaId}`, {
    allowStale: true,
  });
  if (!cached) return null;
  return {
    id: mediaId,
    posterPath: typeof cached.posterPath === "string" ? cached.posterPath : null,
    backdropPath: typeof cached.backdropPath === "string" ? cached.backdropPath : null,
  };
}
