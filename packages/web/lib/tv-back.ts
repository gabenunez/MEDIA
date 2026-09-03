import { stripBasePath } from "@/lib/base-path";

export function isTvHomePath(pathname: string): boolean {
  const path = stripBasePath(pathname).replace(/\/+$/, "") || "/";
  return path === "/";
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
