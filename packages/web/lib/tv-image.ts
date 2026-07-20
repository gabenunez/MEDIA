import { api } from "@/lib/api";
import { getSourceResolutionTier } from "@media-app/shared";
import { isTv4KClient, isTvClient } from "@/lib/tv-mode-detect";

/** List/grid poster quality — keep on Next's default allowlist for preload cache hits. */
export const TV_LIST_IMAGE_QUALITY = 75;
/** Hero / detail imagery can spend a bit more bitrate. */
export const TV_HERO_IMAGE_QUALITY = 85;

/** True when SD source is upscaled on a 4K TV WebView (not native ExoPlayer). */
export function needsTvSdUpscaleSoftening(
  sourceHeight?: number | null,
  sourceWidth?: number | null,
): boolean {
  if (!isTvClient() || !isTv4KClient()) return false;
  return getSourceResolutionTier(sourceHeight, sourceWidth) === 480;
}

/**
 * Resolve artwork for TV.
 * List posters default to standard (non-HD) to keep browse snappy; pass `{ hd: true }`
 * for media heroes / watch posters.
 */
export function tvImageUrl(
  path?: string | null,
  options?: { hd?: boolean },
): string | null {
  if (!path) return null;
  const hd = Boolean(options?.hd) && isTvClient();
  return api.imageUrl(path, { hd });
}
