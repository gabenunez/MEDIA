"use client";

import { cn } from "@/lib/utils";
import { usePreloadedImage } from "@/lib/use-preloaded-image";

interface PlaybackPosterBackdropProps {
  posterUrl: string | null;
  visible: boolean;
  className?: string;
}

export function PlaybackPosterBackdrop({
  posterUrl,
  visible,
  className,
}: PlaybackPosterBackdropProps) {
  const ready = usePreloadedImage(visible ? posterUrl : null);

  if (!visible || !posterUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={posterUrl}
      alt=""
      decoding="sync"
      fetchPriority="high"
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] h-full w-full bg-black object-contain transition-opacity duration-150",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
