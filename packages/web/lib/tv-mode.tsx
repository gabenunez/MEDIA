"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const TV_MODE_KEY = "media-client";
const TV_MODE_VALUE = "android-tv";

const TvModeContext = createContext(false);

export function initTvMode(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get("tv") === "1") {
    sessionStorage.setItem(TV_MODE_KEY, TV_MODE_VALUE);
    const url = new URL(window.location.href);
    url.searchParams.delete("tv");
    const next =
      url.pathname +
      (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
      url.hash;
    window.history.replaceState({}, "", next);
  }

  if (sessionStorage.getItem(TV_MODE_KEY) === TV_MODE_VALUE) return true;
  return navigator.userAgent.includes("MediaAndroidTV");
}

export function TvModeProvider({ children }: { children: ReactNode }) {
  const [isTvMode, setIsTvMode] = useState(() =>
    typeof window !== "undefined" ? initTvMode() : false,
  );

  useEffect(() => {
    setIsTvMode(initTvMode());
  }, []);

  return (
    <TvModeContext.Provider value={isTvMode}>{children}</TvModeContext.Provider>
  );
}

export function useTvMode(): boolean {
  return useContext(TvModeContext);
}
