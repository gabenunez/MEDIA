"use client";

import { useEffect } from "react";
import { ensureAudioUnlocked } from "@/lib/audio-unlock";

/** Unlocks browser audio on the first user interaction anywhere in the app. */
export function AudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      void ensureAudioUnlocked();
    };

    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });

    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, []);

  return null;
}
