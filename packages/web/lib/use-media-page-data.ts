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

  const [snapshot, setSnapshot] = useState(() => ({
    mediaId: validId,
    media: initialMedia ?? null,
    related: [] as MediaItem[],
    pending: validId != null && !initialMedia,
  }));

  useEffect(() => {
    if (validId == null) return;

    setSnapshot((prev) => {
      if (prev.mediaId === validId) return prev;
      const cached = readCachedMedia(validId);
      const seeded = initialMedia ?? cached;
      return {
        mediaId: validId,
        media: seeded,
        related: [],
        pending: !seeded,
      };
    });
  }, [validId, initialMedia]);

  useEffect(() => {
    if (validId == null) return;

    let cancelled = false;
    const hadSeed = Boolean(initialMedia ?? readCachedMedia(validId));

    void api
      .getMedia(validId)
      .then((data) => {
        if (cancelled) return;
        setSnapshot((prev) =>
          prev.mediaId === validId
            ? { ...prev, media: data, pending: false }
            : prev,
        );
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setSnapshot((prev) =>
            prev.mediaId === validId
              ? {
                  ...prev,
                  media: hadSeed ? prev.media : null,
                  pending: false,
                }
              : prev,
          );
        }
      });

    void api
      .getRelatedMedia(validId)
      .then((data) => {
        if (!cancelled) {
          setSnapshot((prev) =>
            prev.mediaId === validId
              ? { ...prev, related: data.items }
              : prev,
          );
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [validId, initialMedia]);

  const cached = readCachedMedia(validId);
  const media =
    snapshot.mediaId === validId
      ? snapshot.media ?? initialMedia ?? cached
      : initialMedia ?? cached;
  const related = snapshot.mediaId === validId ? snapshot.related : [];
  const loading = validId != null && !media && snapshot.pending;

  return {
    media,
    related,
    loading,
  };
}
