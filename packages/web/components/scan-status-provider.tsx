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

const SCAN_POLL_MS = 1500;
const IDLE_POLL_MS = 8000;

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
      const next = await api.getStatus();
      setStatus(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const next = await refresh();
      if (cancelled) return;

      const scanning = next?.activeScan?.status === "running";
      if (wasScanningRef.current && !scanning) {
        await refresh();
      }
      wasScanningRef.current = scanning;

      timeout = setTimeout(poll, scanning ? SCAN_POLL_MS : IDLE_POLL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
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
