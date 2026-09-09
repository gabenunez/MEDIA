export type ProxyAuthStatus = {
  required: boolean;
  authenticated: boolean;
};

type CacheEntry = {
  cookie: string;
  status: ProxyAuthStatus;
  expiresAt: number;
};

/** Short TTL so navs reuse status without serving a stale unlock/lock for long. */
export const AUTH_STATUS_CACHE_TTL_MS = 5_000;

let cached: CacheEntry | null = null;

export function resetAuthStatusCache() {
  cached = null;
}

export function peekAuthStatusCache(
  cookie: string,
  now = Date.now(),
): ProxyAuthStatus | null {
  if (!cached) return null;
  if (cached.cookie !== cookie) return null;
  if (cached.expiresAt <= now) return null;
  return cached.status;
}

export function writeAuthStatusCache(
  cookie: string,
  status: ProxyAuthStatus,
  now = Date.now(),
  ttlMs = AUTH_STATUS_CACHE_TTL_MS,
) {
  cached = { cookie, status, expiresAt: now + ttlMs };
}

/**
 * Reuse a fresh auth status for the same cookie across HTML/RSC navigations.
 * Cookie identity is part of the key so sessions never share a cached result.
 */
export async function getCachedAuthStatus(
  cookie: string,
  fetcher: () => Promise<ProxyAuthStatus>,
  now = Date.now(),
): Promise<ProxyAuthStatus> {
  const hit = peekAuthStatusCache(cookie, now);
  if (hit) return hit;
  const status = await fetcher();
  writeAuthStatusCache(cookie, status, now);
  return status;
}
