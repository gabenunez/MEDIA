"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type ServerStatus } from "@/lib/api";
import { invalidateApiCache } from "@/lib/api-cache";
import { scanPollDelayMs } from "@/lib/scan-poll";
import { isTvClient } from "@/lib/tv-mode-detect";

type ScanStatusContextValue = {
  status: ServerStatus | null;
  activeScan: NonNullable<ServerStatus["activeScan"]> | null;
  isScanning: boolean;
  refresh: () => Promise<ServerStatus | null>;
};

const ScanStatusContext = createContext<ScanStatusContextValue | null>(null);

export function ScanStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const wasScanningRef = useRef(false);

  const refresh = useCallback(async (): Promise<ServerStatus | null> => {
    try {
      invalidateApiCache("status");
      const next = await api.getStatus();
      setStatus(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number | null) => {
      if (timeout) clearTimeout(timeout);
      if (delayMs == null) return;
      timeout = setTimeout(() => {
        void poll();
      }, delayMs);
    };

    const poll = async () => {
      const next = await refresh();
      if (cancelled) return;

      const scanning = next?.activeScan?.status === "running";
      if (wasScanningRef.current && !scanning) {
        await refresh();
      }
      wasScanningRef.current = scanning;

      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      schedule(
        scanPollDelayMs({
          scanning,
          tv: isTvClient(),
          hidden,
        }),
      );
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void poll();
        return;
      }
      schedule(null);
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const activeScan =
    status?.activeScan?.status === "running" ? status.activeScan : null;

  return (
    <ScanStatusContext.Provider
      value={{
        status,
        activeScan,
        isScanning: Boolean(activeScan),
        refresh,
      }}
    >
      {children}
    </ScanStatusContext.Provider>
  );
}

export function useScanStatus() {
  const context = useContext(ScanStatusContext);
  if (!context) {
    throw new Error("useScanStatus must be used within ScanStatusProvider");
  }
  return context;
}
