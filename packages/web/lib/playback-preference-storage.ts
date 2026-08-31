import { isTvClient } from "@/lib/tv-mode-detect";

/** TV WebView sessions are short-lived — persist playback prefs in localStorage there. */
export function playbackPreferenceStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return isTvClient() ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPlaybackPreference(key: string): string | null {
  const storage = playbackPreferenceStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writePlaybackPreference(key: string, value: string): void {
  const storage = playbackPreferenceStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore private browsing quota errors.
  }
}

export function removePlaybackPreference(key: string): void {
  const storage = playbackPreferenceStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore private browsing quota errors.
  }
}
