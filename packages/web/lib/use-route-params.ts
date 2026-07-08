"use client";

import { useSearchParams } from "next/navigation";
import {
  parseDeckId,
  parseFavoritesFilter,
  parseLegacyLibraryContext,
  parseLegacyMediaId,
  parseLegacyWatchRoute,
  parseLibraryId,
  parseMediaId,
  parseWatchRoute,
  type FavoriteFilter,
  type WatchType,
} from "@media-app/shared";
import { useBrowserPathname } from "@/lib/use-browser-pathname";

function searchQuery(searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function useMediaRouteId(): number {
  const pathname = useBrowserPathname();
  const searchParams = useSearchParams();
  return (
    parseMediaId(pathname) ??
    parseLegacyMediaId(pathname, searchQuery(searchParams)) ??
    Number.NaN
  );
}

export function useLibraryRouteContext(): { libraryId: number; deckId: number } {
  const pathname = useBrowserPathname();
  const searchParams = useSearchParams();
  const legacy = parseLegacyLibraryContext(pathname, searchQuery(searchParams));

  return {
    libraryId: parseLibraryId(pathname) ?? legacy.libraryId ?? Number.NaN,
    deckId: parseDeckId(pathname) ?? legacy.deckId ?? Number.NaN,
  };
}

export function useFavoritesRouteFilter(): FavoriteFilter {
  const pathname = useBrowserPathname();
  return parseFavoritesFilter(pathname);
}

export function useWatchRouteParams(): {
  type: WatchType;
  fileId: number;
  mediaId: string | null;
  castStartSeconds: number;
} {
  const pathname = useBrowserPathname();
  const searchParams = useSearchParams();
  const route =
    parseWatchRoute(pathname) ??
    parseLegacyWatchRoute(pathname, searchQuery(searchParams));

  return {
    type: route?.type ?? "movie",
    fileId: route?.fileId ?? Number.NaN,
    mediaId: searchParams.get("media"),
    castStartSeconds: parseInt(searchParams.get("start") ?? "", 10),
  };
}
