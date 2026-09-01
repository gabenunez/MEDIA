"use client";

import { cn } from "@/lib/utils";
import { usePreloadedImage } from "@/lib/use-preloaded-image";
import { MediaImage } from "@/components/media-image";
import { PLAYBACK_IMAGE_QUALITY, PLAYBACK_IMAGE_WIDTH } from "@/lib/next-image-url";

interface PlaybackPosterBackdropProps {
  posterUrl: string | null;
  visible: boolean;
  /** Native ExoPlayer sits behind the WebView — avoid opaque letterbox fill. */
  transparentBackground?: boolean;
  className?: string;
}

export function PlaybackPosterBackdrop({
  posterUrl,
  visible,
  transparentBackground = false,
  className,
}: PlaybackPosterBackdropProps) {
  const ready = usePreloadedImage(
    visible ? posterUrl : null,
    PLAYBACK_IMAGE_WIDTH,
    PLAYBACK_IMAGE_QUALITY,
  );

  if (!visible || !posterUrl) return null;

  return (
    <MediaImage
      src={posterUrl}
      alt=""
      fill
      priority
      quality={PLAYBACK_IMAGE_QUALITY}
      sizes="100vw"
      className={cn(
        "pointer-events-none z-[1] object-contain transition-opacity duration-150",
        transparentBackground ? "bg-transparent" : "bg-black",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
