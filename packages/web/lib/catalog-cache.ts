import { invalidateApiCache } from "./api-cache";

/** Shared catalog pages. A library scan busts these immediately. */
export const catalogCacheLife = {
  stale: 60,
  revalidate: 60,
  expire: 300,
} as const;

/** Title detail and related rows. */
export const mediaCacheLife = {
  stale: 300,
  revalidate: 300,
  expire: 3600,
} as const;

/**
 * `next build` without the prerender API cannot fill catalog caches.
 * Skip those reads so a refused connection is not baked into the page.
 */
export function skipCatalogPrerender(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" &&
    process.env.MEDIA_PRERENDER_BUILD !== "1"
  );
}

export function libraryCountsSignature(
  libraries: ReadonlyArray<{ id: number; itemCount?: number }>,
): string {
  return libraries.map((lib) => `${lib.id}:${lib.itemCount ?? 0}`).sort().join(",");
}

export function invalidateClientCatalogCache() {
  invalidateApiCache("home");
  invalidateApiCache("recent:");
  invalidateApiCache("libraries");
  invalidateApiCache("library:");
  invalidateApiCache("deck");
  invalidateApiCache("favorites");
  invalidateApiCache("continue");
}
