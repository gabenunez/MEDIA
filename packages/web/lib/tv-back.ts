import { stripBasePath } from "@/lib/base-path";
import { routes } from "@/lib/routes";

export function isTvHomePath(pathname: string): boolean {
  const path = stripBasePath(pathname).replace(/\/+$/, "") || "/";
  return path === "/";
}

/** True for `/watch` and `/watch/...` (with or without public prefix). */
export function isTvWatchPath(pathname: string): boolean {
  const path = stripBasePath(pathname).replace(/\/+$/, "") || "/";
  return path === "/watch" || path.startsWith("/watch/");
}

/** Catalog target when Back must leave a leftover watch history entry. */
export function tvWatchExitHref(pathname: string, search = ""): string {
  void pathname;
  const query = search.startsWith("?") ? search.slice(1) : search;
  const mediaId = new URLSearchParams(query).get("media");
  if (mediaId && /^\d+$/.test(mediaId)) {
    return routes.media(parseInt(mediaId, 10));
  }
  return routes.home();
}

export type TvRemoteBackOptions = {
  pathname?: string;
  historyLength?: number;
  watchHandler?: (() => boolean) | undefined;
  goBack?: () => void;
};

/**
 * Consume Android TV remote Back in the same JS turn as evaluateJavascript.
 * Watch peels one player layer first; catalog pages call history.back() here
 * so native WebView.goBack() is not a second hop after the JS result returns.
 *
 * Leftover `/watch` entries are skipped by {@link installTvWatchReentryGuard}.
 */
export function consumeTvRemoteBack(options: TvRemoteBackOptions = {}): boolean {
  const watch =
    options.watchHandler ??
    (typeof window !== "undefined" ? window.__mediaWatchHandleBack : undefined);
  if (typeof watch === "function") {
    try {
      if (watch()) return true;
    } catch {
      // fall through to catalog back
    }
  }

  const pathname =
    options.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  if (isTvHomePath(pathname)) return false;

  const historyLength =
    options.historyLength ??
    (typeof window !== "undefined" ? window.history.length : 1);
  if (historyLength <= 1) return false;

  const goBack = options.goBack ?? (() => window.history.back());
  goBack();
  return true;
}

export function installTvRemoteBackBridge(): () => void {
  if (typeof window === "undefined") return () => {};
  window.__mediaHandleBack = () => consumeTvRemoteBack();
  return () => {
    delete window.__mediaHandleBack;
  };
}

export type TvWatchReentryGuardOptions = {
  replace: (href: string) => void;
  goBack?: () => void;
  getLocation?: () => { pathname: string; search: string };
  getHistoryLength?: () => number;
  schedule?: (fn: () => void) => void;
};

/**
 * If catalog Back lands on a leftover `/watch` entry, skip it so the remote
 * never resumes the title you already left — only the previous menu/page.
 */
export function installTvWatchReentryGuard(
  options: TvWatchReentryGuardOptions,
): () => void {
  if (typeof window === "undefined") return () => {};

  const getLocation =
    options.getLocation ??
    (() => ({
      pathname: window.location.pathname,
      search: window.location.search,
    }));
  const getHistoryLength =
    options.getHistoryLength ?? (() => window.history.length);
  const goBack = options.goBack ?? (() => window.history.back());
  const schedule =
    options.schedule ?? ((fn) => window.setTimeout(fn, 0));

  let skippingWatch = false;

  const bounceOrSkip = () => {
    const { pathname, search } = getLocation();
    if (!isTvWatchPath(pathname)) return;

    const exitHref = tvWatchExitHref(pathname, search);
    if (getHistoryLength() > 1) {
      skippingWatch = true;
      goBack();
      schedule(() => {
        skippingWatch = false;
        const again = getLocation();
        if (isTvWatchPath(again.pathname)) {
          options.replace(tvWatchExitHref(again.pathname, again.search));
        }
      });
      return;
    }

    options.replace(exitHref);
  };

  const onPopState = () => {
    if (skippingWatch) return;
    bounceOrSkip();
  };

  window.addEventListener("popstate", onPopState);
  return () => {
    window.removeEventListener("popstate", onPopState);
  };
}
