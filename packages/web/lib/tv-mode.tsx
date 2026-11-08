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
  WEB_CLIENT_HTML_CLASS,
  initTvMode,
  initTv4KMode,
} from "@/lib/tv-mode-detect";

export { initTvMode } from "@/lib/tv-mode-detect";

const TvModeContext = createContext(false);

function getInitialTvMode(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains(TV_MODE_HTML_CLASS)) {
    return true;
  }
  return initTvMode();
}

export function TvModeProvider({ children }: { children: ReactNode }) {
  const [isTvMode, setIsTvMode] = useState(getInitialTvMode);

  useLayoutEffect(() => {
    const tv = initTvMode();
    const root = document.documentElement;
    if (tv) {
      root.classList.add(TV_MODE_HTML_CLASS);
      root.classList.add(TV_READY_HTML_CLASS);
      // Never both: TV must not carry the web-grid marker.
      root.classList.remove(WEB_CLIENT_HTML_CLASS);
      initTv4KMode();
    } else {
      root.classList.remove(TV_MODE_HTML_CLASS);
      root.classList.remove(TV_READY_HTML_CLASS);
      root.classList.add(WEB_CLIENT_HTML_CLASS);
    }
    setIsTvMode(tv);
  }, []);

  return (
    <TvModeContext.Provider value={isTvMode}>{children}</TvModeContext.Provider>
  );
}

export function useTvMode(): boolean {
  return useContext(TvModeContext);
}
