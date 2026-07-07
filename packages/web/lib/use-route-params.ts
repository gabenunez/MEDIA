"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  parseDeckId,
  parseFavoritesFilter,
  parseLibraryId,
  parseMediaId,
  parseWatchRoute,
  type FavoriteFilter,
  type WatchType,
} from "@media-app/shared";

export function useMediaRouteId(): number {
  const pathname = usePathname();
  return parseMediaId(pathname) ?? Number.NaN;
}

export function useLibraryRouteContext(): { libraryId: number; deckId: number } {
  const pathname = usePathname();
  return {
    libraryId: parseLibraryId(pathname) ?? Number.NaN,
    deckId: parseDeckId(pathname) ?? Number.NaN,
  };
}

export function useFavoritesRouteFilter(): FavoriteFilter {
  const pathname = usePathname();
  return parseFavoritesFilter(pathname);
}

export function useWatchRouteParams(): {
  type: WatchType;
  fileId: number;
  mediaId: string | null;
  castStartSeconds: number;
} {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = parseWatchRoute(pathname);

  return {
    type: route?.type ?? "movie",
    fileId: route?.fileId ?? Number.NaN,
    mediaId: searchParams.get("media"),
    castStartSeconds: parseInt(searchParams.get("start") ?? "", 10),
  };
}
