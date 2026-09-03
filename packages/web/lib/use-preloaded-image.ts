"use client";

import { useEffect, useState } from "react";
import {
  browserImageUrl,
  PLAYBACK_IMAGE_QUALITY,
  PLAYBACK_IMAGE_WIDTH,
} from "@/lib/next-image-url";

/** Preload a poster/artwork URL so it is decoded before first paint in playback. */
export function usePreloadedImage(
  url: string | null | undefined,
  width = PLAYBACK_IMAGE_WIDTH,
  quality = PLAYBACK_IMAGE_QUALITY,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!url) {
      setReady(false);
      return;
    }

    setReady(false);
    const img = new Image();
    img.decoding = "async";

    const finish = () => setReady(true);
    img.onload = finish;
    img.onerror = finish;
    img.src = browserImageUrl(url, width, quality);

    if (img.complete && img.naturalWidth > 0) {
      finish();
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url, width, quality]);

  return ready;
}
