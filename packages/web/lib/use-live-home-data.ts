"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { seedApiCache } from "@/lib/api-cache";
import { useScanStatus } from "@/components/scan-status-provider";
import {
  homeRefreshOptions,
  invalidateClientCatalogCache,
  libraryCountsSignature,
  type HomeRefreshReason,
} from "@/lib/catalog-cache";
import type { HomeData } from "@/lib/server-api";

const HOME_CLIENT_TTL_MS = 30_000;

export function useLiveHomeData(initialData: HomeData | null) {
  const router = useRouter();
  const { status, activeScan, isScanning } = useScanStatus();
  const [data, setData] = useState<HomeData | null>(initialData);
  const [loaded, setLoaded] = useState(Boolean(initialData));
  const wasScanningRef = useRef(false);
  const countsKeyRef = useRef("");

  const refresh = useCallback(
    async (reason: HomeRefreshReason = "mount") => {
      const { bust, refreshRsc } = homeRefreshOptions(reason);
      if (bust) invalidateClientCatalogCache();
      if (refreshRsc) router.refresh();
      try {
        const next = await api.getHome();
        setData(next);
      } catch (err) {
        console.warn("Failed to load home data", err);
      } finally {
        setLoaded(true);
      }
    },
    [router],
  );

  useEffect(() => {
    // Seed from SSR so the mount refresh is a client-cache hit unless
    // saveProgress / catalog writes blocked seeding via invalidate.
    // Depend only on refresh — remount picks up a new SSR seed; scan-complete
    // already refreshes live and must not double-fetch when RSC props update.
    if (initialData) {
      seedApiCache("home", initialData, HOME_CLIENT_TTL_MS);
    }
    void refresh("mount");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [refresh]);

  useEffect(() => {
    if (isScanning) {
      wasScanningRef.current = true;
      return;
    }

    if (wasScanningRef.current) void refresh("scan-complete");
    wasScanningRef.current = false;
  }, [isScanning, refresh]);

  useEffect(() => {
    const key = libraryCountsSignature(status?.libraries);
    if (!key) return;
    const previous = countsKeyRef.current;
    countsKeyRef.current = key;
    if (isScanning) return;
    if (previous && previous !== key) void refresh("library-counts");
  }, [status, isScanning, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh("visible");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { data, loaded, status, activeScan, isScanning };
}
