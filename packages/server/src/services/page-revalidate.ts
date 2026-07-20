import {
  DEFAULT_PORT,
  MEDIA_INTERNAL_HEADER,
  MEDIA_INTERNAL_TOKEN,
  mediaPageCacheTag,
} from "@media-app/shared";

function webInternalBase(): string {
  if (process.env.MEDIA_WEB_INTERNAL_URL) {
    return process.env.MEDIA_WEB_INTERNAL_URL.replace(/\/$/, "");
  }
  const port = process.env.MEDIA_PORT ?? String(DEFAULT_PORT);
  return `http://127.0.0.1:${port}`;
}

export async function revalidateMediaPage(
  mediaId: number,
  options?: { alsoHome?: boolean },
): Promise<void> {
  if (!Number.isFinite(mediaId) || mediaId <= 0) return;

  const tag = mediaPageCacheTag(mediaId);

  try {
    const res = await fetch(`${webInternalBase()}/internal/revalidate/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MEDIA_INTERNAL_HEADER]: MEDIA_INTERNAL_TOKEN,
      },
      body: JSON.stringify({
        tag,
        mediaId,
        paths: options?.alsoHome === false ? undefined : ["/", "/library/", "/recent/", "/favorites/"],
      }),
    });

    if (!res.ok) {
      console.warn(`Failed to revalidate ${tag}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`Failed to revalidate ${tag}:`, err);
  }
}
