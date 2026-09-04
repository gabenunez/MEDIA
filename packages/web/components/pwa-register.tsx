"use client";

import { useEffect, useSyncExternalStore } from "react";
import { withBasePath } from "@/lib/base-path";
import { isTvClient } from "@/lib/tv-mode-detect";
import { shouldRegisterServiceWorker } from "@/lib/pwa";

function subscribe() {
  return () => {};
}

export function PwaRegister() {
  const enabled = useSyncExternalStore(
    subscribe,
    () => shouldRegisterServiceWorker() && !isTvClient(),
    () => false,
  );

  useEffect(() => {
    if (!enabled) return;
    const scriptUrl = withBasePath("/sw.js");
    const scope = withBasePath("/");
    void navigator.serviceWorker.register(scriptUrl, { scope }).catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, [enabled]);

  return null;
}
