"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  TV_MODE_HTML_CLASS,
  TV_READY_HTML_CLASS,
  initTvMode,
} from "@/lib/tv-mode-detect";

export { initTvMode } from "@/lib/tv-mode-detect";

const TvModeContext = createContext(false);

export function TvModeProvider({ children }: { children: ReactNode }) {
  const [isTvMode, setIsTvMode] = useState(false);

  useLayoutEffect(() => {
    const tv = initTvMode();
    if (tv) {
      document.documentElement.classList.add(TV_MODE_HTML_CLASS);
    }
    setIsTvMode(tv);
  }, []);

  useLayoutEffect(() => {
    const pendingTvShell =
      document.documentElement.classList.contains(TV_MODE_HTML_CLASS) && !isTvMode;
    if (pendingTvShell) return;
    document.documentElement.classList.add(TV_READY_HTML_CLASS);
  }, [isTvMode]);

  return (
    <TvModeContext.Provider value={isTvMode}>{children}</TvModeContext.Provider>
  );
}

export function useTvMode(): boolean {
  return useContext(TvModeContext);
}
