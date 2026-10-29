const ROUTE_ERROR_RETRY_KEY = "media-route-error-retry";
/** One automatic reload per route. A second failure inside this window is real. */
const ROUTE_ERROR_RETRY_MS = 10_000;

const STATIC_APP_ROUTES = new Set([
  "/",
  "/login/",
  "/search/",
  "/browse/",
  "/settings/",
  "/downloads/",
  "/continue/",
  "/recent/",
  "/favorites/",
  "/favorites/movie/",
  "/favorites/tv/",
  "/library/",
  "/deck/",
  "/media/",
  "/watch/",
]);

function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

/** Routes the app actually serves. A thrown boundary on these should reload once. */
export function isAppRoute(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (STATIC_APP_ROUTES.has(path)) return true;
  if (/^\/library\/\d+\/$/.test(path)) return true;
  if (/^\/deck\/\d+\/$/.test(path)) return true;
  if (/^\/media\/[1-9]\d*\/$/.test(path)) return true;
  if (/^\/watch\/(movie|episode)\/[1-9]\d*\/$/.test(path)) return true;
  return false;
}

export function routeErrorKey(pathname: string, search = ""): string {
  return `${normalizePathname(pathname)}${search}`;
}

export function wasRouteErrorRetried(
  storage: Pick<Storage, "getItem">,
  key: string,
  now: number,
): boolean {
  const raw = storage.getItem(ROUTE_ERROR_RETRY_KEY);
  if (!raw) return false;
  const split = raw.lastIndexOf("\0");
  if (split < 0) return false;
  if (raw.slice(0, split) !== key) return false;
  const at = Number(raw.slice(split + 1));
  return Number.isFinite(at) && now - at < ROUTE_ERROR_RETRY_MS;
}

export function markRouteErrorRetried(
  storage: Pick<Storage, "setItem">,
  key: string,
  now: number,
): void {
  storage.setItem(ROUTE_ERROR_RETRY_KEY, `${key}\0${now}`);
}

/**
 * A real route gets one full reload before the error screen. `reset()` only
 * re-renders the same failed tree, so a navigation glitch would stick.
 */
export function routeErrorAction(
  pathname: string,
  retriedRecently: boolean,
): "reload" | "show" {
  if (!isAppRoute(pathname)) return "show";
  if (retriedRecently) return "show";
  return "reload";
}
