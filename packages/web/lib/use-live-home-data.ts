"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { peekApiCache, seedApiCache } from "@/lib/api-cache";
import { useScanStatus } from "@/components/scan-status-provider";
import {
  invalidateClientCatalogCache,
  libraryCountsSignature,
} from "@/lib/catalog-cache";
import type { HomeData } from "@/lib/server-api";

const HOME_CLIENT_TTL_MS = 30_000;

/** First paint uses the client cache so returning home does not flash skeletons. */
export function initialHomeData(seed: HomeData | null): HomeData | null {
  return seed ?? peekApiCache<HomeData>("home", { allowStale: true }) ?? null;
}

export function useLiveHomeData(initialData: HomeData | null) {
  const { status, activeScan, isScanning } = useScanStatus();
  const [data, setData] = useState<HomeData | null>(() => initialHomeData(initialData));
  const [loaded, setLoaded] = useState(() => initialHomeData(initialData) != null);
  const previousCatalog = useRef<{ counts: string; isScanning: boolean } | null>(null);
  const latestRefresh = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRefresh.current;
    try {
      const next = await api.getHome();
      if (request === latestRefresh.current) setData(next);
    } catch (err) {
      if (request === latestRefresh.current) console.warn("Failed to load home data", err);
    } finally {
      if (request === latestRefresh.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Keep the first server payload as a seed. Live data is refreshed in place
    // through the API, including when a write has blocked seeding.
    if (initialData) {
      seedApiCache("home", initialData, HOME_CLIENT_TTL_MS);
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [refresh]);

  useEffect(() => {
    if (!status) return;
    const counts = libraryCountsSignature(status.libraries);
    const previous = previousCatalog.current;
    previousCatalog.current = { counts, isScanning };
    // A scan can finish and change the counts in the same poll. Refresh once,
    // including after scans that added episodes without adding a new title.
    if (!isScanning && previous && (previous.isScanning || previous.counts !== counts)) {
      invalidateClientCatalogCache();
      void refresh();
    }
  }, [status, isScanning, refresh]);

  useEffect(() => {
    const onVisible = () => {
      // Only refetch on tab focus if the home entry is actually stale; a fresh
      // cache entry means we painted it moments ago and a network hit is wasted.
      if (document.visibilityState !== "visible") return;
      if (peekApiCache<HomeData>("home")) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { data, loaded, status, activeScan, isScanning };
}
