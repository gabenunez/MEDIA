import { api } from "@/lib/api";
import { getSourceResolutionTier } from "@media-app/shared";
import { isTv4KClient, isTvClient } from "@/lib/tv-mode-detect";

/** True when SD source is upscaled on a 4K TV WebView (not native ExoPlayer). */
export function needsTvSdUpscaleSoftening(
  sourceHeight?: number | null,
  sourceWidth?: number | null,
): boolean {
  if (!isTvClient() || !isTv4KClient()) return false;
  return getSourceResolutionTier(sourceHeight, sourceWidth) === 480;
}
export function tvImageUrl(path?: string | null): string | null {
  if (!path) return null;
  return api.imageUrl(path, { hd: isTvClient() });
}
