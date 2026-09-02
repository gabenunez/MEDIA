"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useScanStatus } from "@/components/scan-status-provider";
import {
  homeRefreshOptions,
  invalidateClientCatalogCache,
  libraryCountsSignature,
  type HomeRefreshReason,
} from "@/lib/catalog-cache";
import type { HomeData } from "@/lib/server-api";

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
    void refresh("mount");
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
