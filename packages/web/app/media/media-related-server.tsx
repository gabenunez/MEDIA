import { cacheLife, cacheTag } from "next/cache";
import { HOME_CATALOG_CACHE_TAG, mediaPageCacheTag } from "@media-app/shared";
import { mediaCacheLife } from "@/lib/catalog-cache";
import { MediaRow } from "@/components/media-row";
import { TvRow } from "@/components/tv/tv-row";
import { TvPoster } from "@/components/tv/tv-poster";
import { fetchRelatedMedia } from "@/lib/server-api";
import type { MediaItem } from "@/lib/api";

export async function MediaRelatedServer({
  mediaId,
  mediaType,
}: {
  mediaId: number;
  mediaType: "movie" | "tv";
}) {
  try {
    return await CachedRelated({ mediaId, mediaType });
  } catch {
    return null;
  }
}

async function CachedRelated({
  mediaId,
  mediaType,
}: {
  mediaId: number;
  mediaType: "movie" | "tv";
}) {
  "use cache";
  cacheLife(mediaCacheLife);
  cacheTag(mediaPageCacheTag(mediaId));
  cacheTag(HOME_CATALOG_CACHE_TAG);
  const items = (await fetchRelatedMedia(mediaId)) as unknown as MediaItem[];
  if (!items.length) return null;

  const title =
    mediaType === "movie"
      ? "More films in your library"
      : "More series in your library";

  return (
    <>
      <div data-web-only>
        <section className="border-t border-border/70 pb-12 pt-10">
          <MediaRow title={title} items={items} />
        </section>
      </div>
      <div data-tv-only className="mt-2">
        <TvRow title={title} prefetchItems={items}>
          {items.map((item) => (
            <TvPoster key={item.id} item={item} />
          ))}
        </TvRow>
      </div>
    </>
  );
}
