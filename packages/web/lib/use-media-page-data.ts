"use client";

import { useEffect, useState } from "react";
import { api, type MediaItem } from "@/lib/api";
import { peekApiCache } from "@/lib/api-cache";

export function prefetchMediaPage(mediaId: number): void {
  if (!Number.isFinite(mediaId)) return;
  void api.getMedia(mediaId);
}

function readCachedMedia(mediaId: number | null) {
  if (mediaId == null) return null;
  return peekApiCache<Record<string, unknown>>(`media:${mediaId}`) ?? null;
}

export function useMediaPageData(
  mediaId: number,
  initialMedia?: Record<string, unknown> | null,
) {
  const validId = Number.isFinite(mediaId) ? mediaId : null;
  const [snapshot, setSnapshot] = useState(() => {
    const seeded = initialMedia ?? readCachedMedia(validId);
    return {
      mediaId: validId,
      media: seeded,
      related: [] as MediaItem[],
      loading: validId != null && !seeded,
    };
  });

  if (snapshot.mediaId !== validId) {
    const seeded = initialMedia ?? readCachedMedia(validId);
    setSnapshot({
      mediaId: validId,
      media: seeded,
      related: [],
      loading: validId != null && !seeded,
    });
  }

  useEffect(() => {
    if (validId == null) return;

    let cancelled = false;
    const hadSeed = Boolean(initialMedia ?? readCachedMedia(validId));

    void api
      .getMedia(validId)
      .then((data) => {
        if (cancelled) return;
        setSnapshot((prev) => ({ ...prev, media: data }));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled && !hadSeed) {
          setSnapshot((prev) => ({ ...prev, media: null }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSnapshot((prev) => ({ ...prev, loading: false }));
        }
      });

    void api
      .getRelatedMedia(validId)
      .then((data) => {
        if (!cancelled) {
          setSnapshot((prev) => ({ ...prev, related: data.items }));
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [validId, initialMedia]);

  return {
    media: snapshot.media,
    related: snapshot.related,
    loading: snapshot.loading,
  };
}
