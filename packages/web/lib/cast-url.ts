function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

/**
 * Chromecast's default receiver is HTTPS. Behind Apache/nginx, Fastify often
 * builds `http://…` stream URLs (Next rewrites overwrite X-Forwarded-Proto).
 * Rewrite media URLs to the sender page origin, including the HLS `base` param
 * so playlist segments stay on the same host.
 *
 * Leave localhost senders alone — those URLs are already LAN IPs the TV can use.
 */
export function rewriteCastUrlToPageOrigin(
  url: string,
  pageOrigin: string,
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

  const rewritten = new URL(
    `${parsed.pathname}${parsed.search}${parsed.hash}`,
    page.origin,
  );

  const nestedBase = rewritten.searchParams.get("base");
  if (nestedBase) {
    try {
      const baseUrl = new URL(nestedBase);
      const prefix = baseUrl.pathname.replace(/\/$/, "");
      rewritten.searchParams.set("base", `${page.origin}${prefix}`);
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
>(media: T, pageOrigin: string): T {
  return {
    ...media,
    contentUrl: rewriteCastUrlToPageOrigin(media.contentUrl, pageOrigin),
    posterUrl: media.posterUrl
      ? rewriteCastUrlToPageOrigin(media.posterUrl, pageOrigin)
      : media.posterUrl,
    subtitleUrl: media.subtitleUrl
      ? rewriteCastUrlToPageOrigin(media.subtitleUrl, pageOrigin)
      : media.subtitleUrl,
  };
}
