"use client";

import { useSyncExternalStore } from "react";
import { isMobileClient } from "@/lib/pwa";

function subscribe() {
  return () => {};
}

/** Client-only mobile phone/tablet check; false during SSR. */
export function useMobileClient(): boolean {
  return useSyncExternalStore(subscribe, () => isMobileClient(), () => false);
}
