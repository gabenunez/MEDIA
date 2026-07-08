import type { WatchType } from "@media-app/shared";
import { toGatewayUrl } from "@/lib/gateway";

function route(path: string): string {
  return toGatewayUrl(path);
}

export const routes = {
  home: () => route("/"),
  search: () => route("/search/"),
  library: (id: number) => route(`/library/${id}/`),
  deck: (id: number) => route(`/deck/${id}/`),
  media: (id: number) => route(`/media/${id}/`),
  favorites: (type?: "movie" | "tv") =>
    route(type ? `/favorites/${type}/` : "/favorites/"),
  continueWatching: () => route("/continue/"),
  recentlyAdded: () => route("/recent/"),
  browse: () => route("/browse/"),
  settings: () => route("/settings/"),
  watch: (type: WatchType, fileId: number, mediaId?: number) => {
    const path = `/watch/${type}/${fileId}/`;
    return route(mediaId ? `${path}?media=${mediaId}` : path);
  },
};
