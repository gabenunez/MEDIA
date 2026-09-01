import { withBasePath } from "./base-path";

/** Must stay in sync with `images.qualities` in `next.config.mjs`. */
export const NEXT_IMAGE_QUALITIES = [75, 80] as const;

/** Next 16 default allowlist is `[75]`; keep generic preloads on an allowed quality. */
export const DEFAULT_IMAGE_QUALITY = 75;

/** Hero / playback stills — highest allowed quality so overlay + next page share a cache. */
export const PLAYBACK_IMAGE_QUALITY = 80;

/** Full-bleed still / backdrop width (`sizes="100vw"` on TV and desktop watch). */
export const PLAYBACK_IMAGE_WIDTH = 1920;

/** Widths Next.js `/_next/image` accepts by default (deviceSizes + imageSizes). */
export const NEXT_IMAGE_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

/** Snap an arbitrary width to a Next-allowed `w` so preload URLs never 400. */
export function snapNextImageWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1200;
  let best: (typeof NEXT_IMAGE_WIDTHS)[number] = NEXT_IMAGE_WIDTHS[0];
  let bestDist = Math.abs(best - width);
  for (const candidate of NEXT_IMAGE_WIDTHS) {
    const dist = Math.abs(candidate - width);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/** Snap an arbitrary quality to a Next-allowed `q` so preload URLs never 400. */
export function snapNextImageQuality(quality: number): number {
  if (!Number.isFinite(quality) || quality <= 0) return DEFAULT_IMAGE_QUALITY;
  let best: (typeof NEXT_IMAGE_QUALITIES)[number] = NEXT_IMAGE_QUALITIES[0];
  let bestDist = Math.abs(best - quality);
  for (const candidate of NEXT_IMAGE_QUALITIES) {
    const dist = Math.abs(candidate - quality);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/** Build a `/_next/image` URL for warming the optimizer cache before navigation. */
export function nextOptimizedImageUrl(
  src: string,
  width: number,
  quality = DEFAULT_IMAGE_QUALITY,
): string {
  const params = new URLSearchParams({
    url: src,
    w: String(snapNextImageWidth(width)),
    q: String(snapNextImageQuality(quality)),
  });
  return withBasePath(`/_next/image?${params.toString()}`);
}
