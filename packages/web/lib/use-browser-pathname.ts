"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const pathnameListeners = new Set<() => void>();
let historyPatched = false;
let originalPushState: History["pushState"];
let originalReplaceState: History["replaceState"];

function notifyPathnameListeners() {
  for (const listener of pathnameListeners) {
    listener();
  }
}

function ensureHistoryListener() {
  if (historyPatched || typeof window === "undefined") return;

  historyPatched = true;
  originalPushState = window.history.pushState.bind(window.history);
  originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = (...args) => {
    const result = originalPushState(...args);
    notifyPathnameListeners();
    return result;
  };

  window.history.replaceState = (...args) => {
    const result = originalReplaceState(...args);
    notifyPathnameListeners();
    return result;
  };
}

function subscribeToBrowserPathname(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  ensureHistoryListener();
  pathnameListeners.add(onStoreChange);
  window.addEventListener("popstate", onStoreChange);

  return () => {
    pathnameListeners.delete(onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

/** Read the real browser URL path (static export entity routes live outside Next's route tree). */
export function useBrowserPathname(): string {
  const nextPathname = usePathname();

  return useSyncExternalStore(
    subscribeToBrowserPathname,
    () => window.location.pathname,
    () => nextPathname,
  );
}

/** True after hydration; use to avoid showing route errors from the static shell HTML. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
