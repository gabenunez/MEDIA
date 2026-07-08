"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { useBrowserPathname } from "@/lib/use-browser-pathname";
import { useAuth } from "@/components/auth-gate";
import { markTvBootContentReady, isTvBootContentReady } from "@/lib/tv-boot-ready";
import { useTvMode } from "@/lib/tv-mode";

type TvBootReadyContextValue = {
  markPageReady: () => void;
};

const TvBootReadyContext = createContext<TvBootReadyContextValue | null>(null);

export function TvBootReadyProvider({ children }: { children: ReactNode }) {
  const isTvMode = useTvMode();
  const pathname = useBrowserPathname();
  const { loading: authLoading, required, authenticated } = useAuth();
  const [pageReady, setPageReady] = useState(false);
  const locked = required && !authenticated;

  useEffect(() => {
    if (!isTvMode || isTvBootContentReady()) return;
    setPageReady(false);
  }, [pathname, isTvMode]);

  const markPageReady = useCallback(() => {
    setPageReady(true);
  }, []);

  useEffect(() => {
    if (!isTvMode || authLoading) return;
    if (locked) {
      markTvBootContentReady();
      return;
    }
    if (pageReady) {
      markTvBootContentReady();
    }
  }, [isTvMode, authLoading, locked, pageReady]);

  useEffect(() => {
    if (!isTvMode) return;
    const timeout = window.setTimeout(() => markTvBootContentReady(), 15_000);
    return () => window.clearTimeout(timeout);
  }, [isTvMode]);

  return (
    <TvBootReadyContext.Provider value={{ markPageReady }}>
      {children}
    </TvBootReadyContext.Provider>
  );
}

/** Tell the TV shell it is safe to dismiss the startup splash. */
export function useMarkTvBootReadyWhen(ready: boolean) {
  const context = useContext(TvBootReadyContext);

  useLayoutEffect(() => {
    if (!ready || !context) return;
    context.markPageReady();
  }, [ready, context]);
}
