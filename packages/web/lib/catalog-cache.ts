import { HOME_CATALOG_CACHE_TAG } from "@media-app/shared";
import { invalidateApiCache } from "./api-cache";

export function catalogDataCache(revalidateSeconds: number) {
  return {
    revalidate: revalidateSeconds,
    tags: [HOME_CATALOG_CACHE_TAG],
  };
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
