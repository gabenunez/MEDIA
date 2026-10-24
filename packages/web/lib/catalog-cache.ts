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
  libraries: Array<{ id: number; itemCount?: number }> | undefined,
): string {
  if (!libraries?.length) return "";
  return libraries.map((lib) => `${lib.id}:${lib.itemCount ?? 0}`).join(",");
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

export type HomeRefreshReason = "mount" | "scan-complete" | "library-counts" | "visible";

/** Mount/tab-focus keep painting current home data; only catalog changes bust caches. */
export function homeRefreshOptions(reason: HomeRefreshReason): {
  bust: boolean;
  refreshRsc: boolean;
} {
  if (reason === "scan-complete" || reason === "library-counts") {
    return { bust: true, refreshRsc: true };
  }
  return { bust: false, refreshRsc: false };
}
