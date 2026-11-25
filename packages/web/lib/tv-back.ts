import { stripBasePath } from "@/lib/base-path";
import { routes } from "@/lib/routes";
import { tvAppLocation } from "@/lib/tv-navigation";

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
  searchHandler?: (() => boolean) | undefined;
  goBack?: (steps: number) => void;
  replace?: (href: string) => void;
  backSteps?: number;
};

type TvNavigationHistory = {
  currentEntry: { index: number } | null;
  entries: () => ReadonlyArray<{ url: string | null; sameDocument: boolean }>;
};

/** Stay in the current MEDIA document and skip leftover players or duplicate pages. */
export function tvBackSteps(navigation: TvNavigationHistory | undefined, current: string, basePath?: string) {
  const index = navigation?.currentEntry?.index;
  if (!navigation || index == null || index < 0) return undefined;
  const active = tvAppLocation(current, current, basePath);
  const entries = navigation.entries();
  for (let previous = index - 1; previous >= 0; previous--) {
    const entry = entries[previous];
    if (!entry?.sameDocument || !entry.url) break;
    const target = tvAppLocation(entry.url, current, basePath);
    if (!target) break;
    if (target.pathname.startsWith("/watch/")) continue;
    if (target.pathname === active?.pathname && target.url.search === active.url.search && target.url.hash === active.url.hash) {
      continue;
    }
    return index - previous;
  }
  return 0;
}

/**
 * Consume Android TV remote Back in the same JS turn as evaluateJavascript.
 * Watch peels one player layer first; catalog pages call history.back() here
 * so native WebView.goBack() is not a second hop after the JS result returns.
 *
 * Older browsers use {@link installTvWatchReentryGuard} to skip leftover players.
 */
export function consumeTvRemoteBack(options: TvRemoteBackOptions = {}): boolean {
  const pathname = options.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const watch =
    options.watchHandler ??
    (typeof window !== "undefined" ? window.__mediaWatchHandleBack : undefined);
  if (isTvWatchPath(pathname) && typeof watch === "function") {
    try {
      if (watch()) return true;
    } catch {
      // fall through to catalog back
    }
  }

  if (stripBasePath(pathname).replace(/\/+$/, "") === "/search") {
    const search = options.searchHandler ??
      (typeof window !== "undefined" ? window.__mediaSearchHandleBack : undefined);
    if (search?.()) return true;
  }
  if (isTvHomePath(pathname)) return false;

  const historyLength =
    options.historyLength ??
    (typeof window !== "undefined" ? window.history.length : 1);
  const steps = options.backSteps ?? (historyLength > 1 ? 1 : 0);
  if (steps === 0) {
    if (!options.replace) return false;
    const search = typeof window === "undefined" ? "" : window.location.search;
    options.replace(isTvWatchPath(pathname) ? tvWatchExitHref(pathname, search) : routes.home());
    return true;
  }

  const goBack = options.goBack ?? ((steps) => {
    if (steps === 1) window.history.back();
    else window.history.go(-steps);
  });
  goBack(steps);
  return true;
}

export function installTvRemoteBackBridge(replace?: (href: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const browser = window as Window & { navigation?: TvNavigationHistory };
  window.__mediaHandleBack = () => consumeTvRemoteBack({
    replace,
    backSteps: tvBackSteps(browser.navigation, window.location.href),
  });
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
