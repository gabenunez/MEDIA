import type { WatchType } from "@media-app/shared";
import { withBasePath } from "@/lib/base-path";

export const routes = {
  home: () => withBasePath("/"),
  search: () => withBasePath("/search/"),
  library: (id: number) => withBasePath(`/library/${id}/`),
  deck: (id: number) => withBasePath(`/deck/${id}/`),
  media: (id: number) => withBasePath(`/media/${id}/`),
  favorites: (type?: "movie" | "tv") =>
    withBasePath(type ? `/favorites/${type}/` : "/favorites/"),
  continueWatching: () => withBasePath("/continue/"),
  recentlyAdded: () => withBasePath("/recent/"),
  browse: () => withBasePath("/browse/"),
  settings: () => withBasePath("/settings/"),
  watch: (type: WatchType, fileId: number, mediaId?: number) => {
    const path = `/watch/${type}/${fileId}/`;
    return withBasePath(mediaId ? `${path}?media=${mediaId}` : path);
  },
};
