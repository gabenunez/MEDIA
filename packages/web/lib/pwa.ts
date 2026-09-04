export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export function shouldOfferPwaInstall(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandalonePwa()) return false;
  return true;
}

const AUTH_CACHE_KEY = "media:auth-status";

export function cacheAuthStatus(status: {
  required: boolean;
  authenticated: boolean;
}): void {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(status));
  } catch {
    // quota / private mode
  }
}

export function readCachedAuthStatus(): {
  required: boolean;
  authenticated: boolean;
} | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      required?: boolean;
      authenticated?: boolean;
    };
    return {
      required: Boolean(parsed.required),
      authenticated: Boolean(parsed.authenticated),
    };
  } catch {
    return null;
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function shouldRegisterServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  return true;
}
