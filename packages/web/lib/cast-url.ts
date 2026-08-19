import { getPublicPrefix } from "./base-path";

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function applyPublicPrefix(pathname: string, prefix: string): string {
  if (!prefix) return pathname;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return pathname;
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${prefix}${normalized}`;
}

export function safeCastLocation(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Chromecast's default receiver is HTTPS. Behind Apache/nginx, Fastify often
 * builds `http://…` stream URLs (Next rewrites overwrite X-Forwarded-Proto).
 * Always pin media to the sender page origin and public_prefix (`/reel`) so
 * the TV hits the reverse-proxy path, not `/api` at the site root.
 *
 * Leave localhost senders alone — those URLs are already LAN IPs the TV can use.
 */
export function rewriteCastUrlToPageOrigin(
  url: string,
  pageOrigin: string,
  publicPrefix = getPublicPrefix(),
): string {
  let page: URL;
  try {
    page = new URL(pageOrigin);
  } catch {
    return url;
  }

  if (isLoopbackHostname(page.hostname)) {
    return url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const path = applyPublicPrefix(parsed.pathname, publicPrefix);
  const rewritten = new URL(`${path}${parsed.search}${parsed.hash}`, page.origin);

  const nestedBase = rewritten.searchParams.get("base");
  if (nestedBase) {
    try {
      const baseUrl = new URL(nestedBase);
      const prefixPath = applyPublicPrefix(
        baseUrl.pathname.replace(/\/$/, "") || "/",
        publicPrefix,
      );
      const normalized = prefixPath === "/" ? "" : prefixPath.replace(/\/$/, "");
      rewritten.searchParams.set("base", `${page.origin}${normalized}`);
    } catch {
      // keep the original base query
    }
  }

  return rewritten.toString();
}

export function rewriteCastMediaUrls<
  T extends {
    contentUrl: string;
    posterUrl?: string | null;
    subtitleUrl?: string | null;
  },
>(media: T, pageOrigin: string, publicPrefix = getPublicPrefix()): T {
  return {
    ...media,
    contentUrl: rewriteCastUrlToPageOrigin(
      media.contentUrl,
      pageOrigin,
      publicPrefix,
    ),
    posterUrl: media.posterUrl
      ? rewriteCastUrlToPageOrigin(media.posterUrl, pageOrigin, publicPrefix)
      : media.posterUrl,
    subtitleUrl: media.subtitleUrl
      ? rewriteCastUrlToPageOrigin(media.subtitleUrl, pageOrigin, publicPrefix)
      : media.subtitleUrl,
  };
}
