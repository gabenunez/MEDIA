export const MEDIA_INTERNAL_HEADER = "x-media-internal";

/**
 * Secret shared by the API and Next at process start.
 * Read dynamically so a production build does not bake the value in.
 */
export function mediaInternalToken(): string | null {
  const value = process.env["MEDIA_INTERNAL_TOKEN"];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Constant-time check against the runtime internal token. */
export function mediaInternalTokenMatches(
  provided: string | null | undefined,
): boolean {
  const expected = mediaInternalToken();
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export const HOME_CATALOG_CACHE_TAG = "home-catalog";

export const CATALOG_REVALIDATE_PATHS = [
  "/",
  "/library/",
  "/recent/",
  "/favorites/",
  "/continue/",
  "/browse/",
] as const;

const CATALOG_PATH_SET = new Set<string>(CATALOG_REVALIDATE_PATHS);

export function mediaPageCacheTag(mediaId: number): string {
  return `media:${mediaId}`;
}

export function normalizePublicPrefix(value: string | undefined): string {
  if (!value || value === "/") return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function mediaInternalRevalidatePath(publicPrefix?: string): string {
  return `${normalizePublicPrefix(publicPrefix)}/internal/revalidate/`;
}

export function mediaInternalRevalidateUrl(
  webBase: string,
  publicPrefix?: string,
): string {
  return `${webBase.replace(/\/$/, "")}${mediaInternalRevalidatePath(publicPrefix)}`;
}

export function collectRevalidateTags(body: {
  tag?: unknown;
  tags?: unknown;
  mediaId?: unknown;
  paths?: unknown;
}): string[] {
  const tags = new Set<string>();

  if (typeof body.tag === "string" && body.tag.trim()) {
    tags.add(body.tag.trim());
  }

  if (Array.isArray(body.tags)) {
    for (const tag of body.tags) {
      if (typeof tag === "string" && tag.trim()) tags.add(tag.trim());
    }
  }

  if (
    typeof body.mediaId === "number" &&
    Number.isFinite(body.mediaId) &&
    body.mediaId > 0
  ) {
    tags.add(mediaPageCacheTag(body.mediaId));
  }

  if (Array.isArray(body.paths)) {
    for (const path of body.paths) {
      if (typeof path === "string" && CATALOG_PATH_SET.has(path)) {
        tags.add(HOME_CATALOG_CACHE_TAG);
        break;
      }
    }
  }

  return [...tags];
}
