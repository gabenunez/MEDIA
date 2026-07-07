interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

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

export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function peekApiCache<T>(key: string): T | undefined {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit || hit.expiresAt <= Date.now()) return undefined;
  return hit.data;
}
