/** Query key used when routing through a single public entry path (e.g. /reel?__p=/media/5/). */
export const GATEWAY_QUERY_KEY = "__p";

function normalizeGatewayPrefix(value: string | undefined): string {
  if (!value || value === "/") return "";
  const trimmed = value.replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function readGatewayPrefix(): string {
  return normalizeGatewayPrefix(
    process.env.NEXT_PUBLIC_GATEWAY_PREFIX ?? process.env.MEDIA_GATEWAY_PREFIX,
  );
}

/** Public entry path when behind a broken subpath proxy (e.g. /reel). Empty when disabled. */
export const GATEWAY_PREFIX = readGatewayPrefix();

export function gatewayEnabled(): boolean {
  return GATEWAY_PREFIX.length > 0;
}

function normalizeAppPath(path: string): string {
  if (!path || path === "/") return "/";
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 * Map an internal app path to the URL the browser should request.
 * Home is the bare entry path; everything else uses ?__p=.
 */
export function toGatewayUrl(path: string): string {
  if (!gatewayEnabled()) return path;

  if (!path || path === "/") return GATEWAY_PREFIX;

  const absolute = path.startsWith("http://") || path.startsWith("https://");
  if (absolute) {
    try {
      const url = new URL(path);
      return `${url.origin}${toGatewayUrl(`${url.pathname}${url.search}`)}`;
    } catch {
      return path;
    }
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  params.set(GATEWAY_QUERY_KEY, normalized);
  return `${GATEWAY_PREFIX}?${params.toString()}`;
}

/** Resolve the in-app pathname from a browser URL when gateway mode is active. */
export function pathnameFromGatewayUrl(pathname: string, search: string): string | null {
  if (!gatewayEnabled()) return null;

  const entry = GATEWAY_PREFIX;
  if (pathname !== entry && pathname !== `${entry}/`) return null;

  const outer = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const target = outer.get(GATEWAY_QUERY_KEY);
  if (!target) return "/";
  if (!target.startsWith("/")) return "/";

  const inner = new URL(target, "http://gateway.local");
  return normalizeAppPath(inner.pathname);
}

/** Split a browser URL into in-app pathname + merged query params (gateway-aware). */
export function parseGatewayLocation(
  pathname: string,
  search: string,
): { pathname: string; searchParams: URLSearchParams } {
  const gatewayPath = pathnameFromGatewayUrl(pathname, search);
  if (gatewayPath === null) {
    return {
      pathname,
      searchParams: new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
    };
  }

  const outer = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const target = outer.get(GATEWAY_QUERY_KEY);
  outer.delete(GATEWAY_QUERY_KEY);

  const merged = new URLSearchParams();
  if (target?.startsWith("/")) {
    const inner = new URL(target, "http://gateway.local");
    inner.searchParams.forEach((value, key) => merged.set(key, value));
  }
  outer.forEach((value, key) => merged.set(key, value));

  return { pathname: gatewayPath, searchParams: merged };
}

/** Build a NextResponse rewrite target from ?__p=… when gateway mode is enabled. */
export function resolveGatewayRewritePath(
  pathname: string,
  search: string,
): { pathname: string; search: string } | null {
  if (!gatewayEnabled()) return null;

  const outer = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const target = outer.get(GATEWAY_QUERY_KEY);
  if (!target?.startsWith("/")) return null;

  const inner = new URL(target, "http://gateway.local");
  return {
    pathname: inner.pathname,
    search: inner.search,
  };
}

/** Prefix for fetch/stream URLs — explicit API URL wins, else gateway-wrap internal paths. */
export function publicUrl(path: string): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (apiBase) return `${apiBase.replace(/\/$/, "")}${path}`;
  return toGatewayUrl(path);
}
