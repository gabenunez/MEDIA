import {
  CATALOG_REVALIDATE_PATHS,
  DEFAULT_PORT,
  HOME_CATALOG_CACHE_TAG,
  MEDIA_INTERNAL_HEADER,
  MEDIA_INTERNAL_TOKEN,
  mediaInternalRevalidateUrl,
  mediaPageCacheTag,
} from "@media-app/shared";

function webInternalBase(): string {
  if (process.env.MEDIA_WEB_INTERNAL_URL) {
    return process.env.MEDIA_WEB_INTERNAL_URL.replace(/\/$/, "");
  }
  const port = process.env.MEDIA_PORT ?? String(DEFAULT_PORT);
  return `http://127.0.0.1:${port}`;
}

export function resolveMediaRevalidateUrl(): string {
  return mediaInternalRevalidateUrl(
    webInternalBase(),
    process.env.MEDIA_PUBLIC_PREFIX ?? "",
  );
}

async function postRevalidate(
  body: Record<string, unknown>,
  label: string,
): Promise<void> {
  try {
    const res = await fetch(resolveMediaRevalidateUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MEDIA_INTERNAL_HEADER]: MEDIA_INTERNAL_TOKEN,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`Failed to revalidate ${label}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`Failed to revalidate ${label}:`, err);
  }
}

export async function revalidateCatalog(): Promise<void> {
  await postRevalidate(
    {
      tag: HOME_CATALOG_CACHE_TAG,
      paths: [...CATALOG_REVALIDATE_PATHS],
    },
    HOME_CATALOG_CACHE_TAG,
  );
}

export async function revalidateMediaPage(
  mediaId: number,
  options?: { alsoHome?: boolean },
): Promise<void> {
  if (!Number.isFinite(mediaId) || mediaId <= 0) return;

  const tag = mediaPageCacheTag(mediaId);

  await postRevalidate(
    {
      tag,
      mediaId,
      tags: [HOME_CATALOG_CACHE_TAG],
      paths: options?.alsoHome === false ? undefined : [...CATALOG_REVALIDATE_PATHS],
    },
    tag,
  );
}
