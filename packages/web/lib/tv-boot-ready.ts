import { notifyAndroidTvBootReady } from "@/lib/android-bridge";
import { isTvClient } from "@/lib/tv-mode-detect";

export const TV_BOOT_READY_HTML_CLASS = "tv-boot-ready";

let bootReadyMarked = false;

export function isTvBootContentReady(): boolean {
  if (typeof document === "undefined") return false;
  return (
    bootReadyMarked ||
    document.documentElement.classList.contains(TV_BOOT_READY_HTML_CLASS)
  );
}

/** Safe to reveal the TV shell — auth resolved and the active view has content. */
export function markTvBootContentReady() {
  if (typeof document === "undefined" || !isTvClient()) return;
  if (bootReadyMarked) return;
  bootReadyMarked = true;
  document.documentElement.classList.add(TV_BOOT_READY_HTML_CLASS);
  notifyAndroidTvBootReady();
}
