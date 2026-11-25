import { getPublicPrefix } from "@/lib/base-path";
import { isAppRoute } from "@/lib/route-error-recovery";

export function tvAppLocation(raw: string, current: string, basePath = getPublicPrefix()) {
  try {
    const url = new URL(raw, current);
    if (url.origin !== new URL(current).origin) return null;
    if (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
      return null;
    }

    const path = url.pathname.slice(basePath.length) || "/";
    const pathname = `${path.replace(/\/+$/, "")}/`;
    if (!isAppRoute(pathname) || pathname === "/login/") return null;
    return { url, pathname };
  } catch {
    return null;
  }
}

/** Warm native intents use the router; cold starts still load the original URL. */
export function installTvNativeNavigation(router: {
  push: (href: string) => void;
  replace: (href: string) => void;
}): () => void {
  const navigate = (href: string) => {
    const current = window.location.href;
    const target = tvAppLocation(href, current);
    if (!target || (target.pathname !== "/search/" && !target.pathname.startsWith("/watch/"))) {
      return false;
    }

    const from = tvAppLocation(current, current)?.pathname;
    const sameView = (from === "/search/" && target.pathname === "/search/") ||
      (from?.startsWith("/watch/") && target.pathname.startsWith("/watch/"));
    if (from === "/search/") window.__mediaSearchHandleBack?.();
    target.url.searchParams.delete("tv");
    const next = `${target.pathname}${target.url.search}${target.url.hash}`;
    if (sameView) router.replace(next);
    else router.push(next);
    return true;
  };

  window.__mediaNavigate = navigate;
  return () => {
    if (window.__mediaNavigate === navigate) delete window.__mediaNavigate;
  };
}
