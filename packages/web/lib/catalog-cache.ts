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
