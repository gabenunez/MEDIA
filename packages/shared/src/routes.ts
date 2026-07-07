export type WatchType = "movie" | "episode";
export type FavoriteFilter = "all" | "movie" | "tv";

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = parseInt(value, 10);
  return id > 0 ? id : null;
}

export function parseMediaId(pathname: string): number | null {
  const match = normalizePathname(pathname).match(/^\/media\/(\d+)\/$/);
  return match ? parsePositiveInt(match[1]) : null;
}

export function parseLibraryId(pathname: string): number | null {
  const match = normalizePathname(pathname).match(/^\/library\/(\d+)\/$/);
  return match ? parsePositiveInt(match[1]) : null;
}

export function parseDeckId(pathname: string): number | null {
  const match = normalizePathname(pathname).match(/^\/deck\/(\d+)\/$/);
  return match ? parsePositiveInt(match[1]) : null;
}

export function parseWatchRoute(
  pathname: string,
): { type: WatchType; fileId: number } | null {
  const match = normalizePathname(pathname).match(/^\/watch\/(movie|episode)\/(\d+)\/$/);
  if (!match) return null;
  const fileId = parsePositiveInt(match[2]);
  if (!fileId) return null;
  return { type: match[1] as WatchType, fileId };
}

export function parseFavoritesFilter(pathname: string): FavoriteFilter {
  const path = normalizePathname(pathname);
  if (path === "/favorites/movie/") return "movie";
  if (path === "/favorites/tv/") return "tv";
  return "all";
}

/** Map entity path URLs to the static export HTML shell for SPA routing. */
export function resolveSpaIndexFile(pathname: string): string | null {
  const path = normalizePathname(pathname);
  if (/^\/media\/\d+\/$/.test(path)) return "media/index.html";
  if (/^\/library\/\d+\/$/.test(path)) return "library/index.html";
  if (/^\/deck\/\d+\/$/.test(path)) return "deck/index.html";
  if (/^\/watch\/(movie|episode)\/\d+\/$/.test(path)) return "watch/index.html";
  if (path === "/favorites/movie/" || path === "/favorites/tv/") {
    return "favorites/index.html";
  }
  return null;
}

/** Redirect old query-param URLs to path-based routes (bookmark compatibility). */
export function resolveLegacyRouteRedirect(
  pathname: string,
  search: string,
): string | null {
  const path = normalizePathname(pathname);
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );

  const withQuery = (nextPath: string) => {
    const qs = params.toString();
    return qs ? `${nextPath}?${qs}` : nextPath;
  };

  if (path === "/media/") {
    const id = params.get("id");
    if (!parsePositiveInt(id ?? undefined)) return null;
    params.delete("id");
    return withQuery(`/media/${id}/`);
  }

  if (path === "/library/") {
    const deckId = params.get("deck");
    if (parsePositiveInt(deckId ?? undefined)) {
      params.delete("deck");
      return withQuery(`/deck/${deckId}/`);
    }

    const libraryId = params.get("id");
    if (parsePositiveInt(libraryId ?? undefined)) {
      params.delete("id");
      return withQuery(`/library/${libraryId}/`);
    }
  }

  if (path === "/watch/") {
    const type = params.get("type");
    const id = params.get("id");
    if (
      (type === "movie" || type === "episode") &&
      parsePositiveInt(id ?? undefined)
    ) {
      params.delete("type");
      params.delete("id");
      params.delete("poster");
      return withQuery(`/watch/${type}/${id}/`);
    }
  }

  if (path === "/favorites/") {
    const type = params.get("type");
    if (type === "movie" || type === "tv") {
      params.delete("type");
      return withQuery(`/favorites/${type}/`);
    }
  }

  return null;
}
