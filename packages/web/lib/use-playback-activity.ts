"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

const HEARTBEAT_MS = 20_000;

/** Keep background preview work idle even while a player serves frames from its buffer. */
export function usePlaybackActivity(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    // getRandomValues also works on the app's non-HTTPS LAN installations.
    const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    let pageHidden = false;
    const report = (playing: boolean) => {
      void api.setPlaybackActive(sessionId, playing).catch(() => {});
    };
    const heartbeat = () => {
      if (!pageHidden) report(true);
    };
    const onPageHide = () => {
      pageHidden = true;
      report(false);
    };
    const onPageShow = () => {
      pageHidden = false;
      heartbeat();
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      onPageHide();
    };
  }, [active]);
}
