import type { WatchType } from "@media-app/shared";

export const routes = {
  home: () => "/",
  search: () => "/search/",
  library: (id: number) => `/library/${id}/`,
  deck: (id: number) => `/deck/${id}/`,
  media: (id: number) => `/media/${id}/`,
  favorites: (type?: "movie" | "tv") =>
    type ? `/favorites/${type}/` : "/favorites/",
  continueWatching: () => "/continue/",
  recentlyAdded: () => "/recent/",
  browse: () => "/browse/",
  settings: () => "/settings/",
  watch: (type: WatchType, fileId: number, mediaId?: number) => {
    const path = `/watch/${type}/${fileId}/`;
    return mediaId ? `${path}?media=${mediaId}` : path;
  },
};
