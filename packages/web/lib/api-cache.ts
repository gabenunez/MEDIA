interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
/** Prefix → block seeding until this timestamp (after intentional invalidation). */
const seedBlockedUntil = new Map<string, number>();

/** Keep SSR seeds from refilling a key that progress/favorite writes just cleared. */
const SEED_BLOCK_MS = 120_000;

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;

  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  if (hit) {
    void revalidate(key, fetcher, ttlMs);
    return hit.data;
  }

  return revalidate(key, fetcher, ttlMs);
}

async function revalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      clearSeedBlock(key);
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

function isSeedBlocked(key: string, now = Date.now()): boolean {
  for (const [prefix, until] of seedBlockedUntil) {
    if (until <= now) {
      seedBlockedUntil.delete(prefix);
      continue;
    }
    if (key === prefix || key.startsWith(prefix)) return true;
  }
  return false;
}

function clearSeedBlock(key: string) {
  for (const prefix of seedBlockedUntil.keys()) {
    if (key === prefix || key.startsWith(prefix)) {
      seedBlockedUntil.delete(prefix);
    }
  }
}

/**
 * Fill the client cache from an SSR payload without overwriting a live entry
 * or undoing a recent invalidate (e.g. after saveProgress).
 */
export function seedApiCache<T>(key: string, data: T, ttlMs = 30_000): boolean {
  if (cache.has(key)) return false;
  if (isSeedBlocked(key)) return false;
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return true;
}

export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    seedBlockedUntil.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
  seedBlockedUntil.set(prefix, Date.now() + SEED_BLOCK_MS);
}

export function peekApiCache<T>(
  key: string,
  options?: { allowStale?: boolean },
): T | undefined {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return undefined;
  if (!options?.allowStale && hit.expiresAt <= Date.now()) return undefined;
  return hit.data;
}
