export const MEDIA_INTERNAL_HEADER = "x-media-internal";
export const MEDIA_INTERNAL_TOKEN = "next-isr";

export function mediaPageCacheTag(mediaId: number): string {
  return `media:${mediaId}`;
}
