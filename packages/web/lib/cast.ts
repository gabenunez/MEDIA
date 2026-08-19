import { rewriteCastMediaUrls, safeCastLocation, toChromecastMediaUrl } from "./cast-url";

let castFrameworkLoaded = false;
let castOptionsSet = false;
let castFrameworkLoading: Promise<void> | null = null;

function initializeCastContext(): void {
  if (castOptionsSet && window.cast?.framework) {
    castFrameworkLoaded = true;
    return;
  }

  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });
  castOptionsSet = true;
  castFrameworkLoaded = true;
}

export function loadCastFramework(): Promise<void> {
  if (castFrameworkLoaded && window.cast?.framework) {
    return Promise.resolve();
  }

  if (castFrameworkLoading) {
    return castFrameworkLoading;
  }

  const loading = new Promise<void>((resolve, reject) => {
    const finishInit = () => {
      try {
        initializeCastContext();
        resolve();
      } catch (err) {
        reject(
          err instanceof Error ? err : new Error("Failed to initialize Cast"),
        );
      }
    };

    if (window.cast?.framework) {
      finishInit();
      return;
    }

    window.__onGCastApiAvailable = (isAvailable) => {
      if (!isAvailable) {
        reject(new Error("Google Cast is not available in this browser"));
        return;
      }
      finishInit();
    };

    const existing = document.querySelector('script[src*="cast_sender.js"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src =
        "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      script.async = true;
      script.onerror = () =>
        reject(new Error("Failed to load Google Cast SDK"));
      document.head.appendChild(script);
      return;
    }

    // Script tag exists but callback may have fired before we registered it.
    const pollStart = Date.now();
    const poll = () => {
      if (window.cast?.framework) {
        finishInit();
        return;
      }
      if (Date.now() - pollStart > 10_000) {
        reject(new Error("Google Cast SDK timed out"));
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });

  castFrameworkLoading = loading.catch((err) => {
    castFrameworkLoading = null;
    throw err;
  });

  return castFrameworkLoading;
}

export function isCastBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (/CrKey/i.test(navigator.userAgent)) return false;
  return /Chrome|Chromium|Edg/i.test(navigator.userAgent);
}

export function isCastContextSecure(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return (
    window.isSecureContext ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

export function getCastContextHint(): string | null {
  if (!isCastBrowser()) return null;
  if (isCastContextSecure()) return null;
  const port = window.location.port || "8096";
  return `Open http://localhost:${port} in Chrome to enable Chromecast. Media URLs still use your LAN IP automatically.`;
}

export function isCastSupported(): boolean {
  return isCastBrowser() && isCastContextSecure();
}

export interface CastMediaOptions {
  contentUrl: string;
  contentType: string;
  title: string;
  posterUrl?: string | null;
  subtitleUrl?: string | null;
  subtitleLanguage?: string;
  startTime?: number;
}

const CAST_ERROR_HINTS: Record<string, string> = {
  load_media_failed:
    "Your TV couldn't load this video. If you're using a password on MEDIA!, try again after this update, or try a lower quality / Original in the player first.",
  cancel: "Cast cancelled.",
  receiver_unavailable: "No Chromecast device was found.",
  timeout: "Cast timed out. Try again.",
  channel_error: "Lost connection to Chromecast. Try again.",
};

function normalizeCastErrorCode(err: unknown): string | null {
  if (typeof err === "string") {
    return err.toLowerCase();
  }

  if (err && typeof err === "object") {
    const castErr = err as { code?: string | number; description?: string };
    if (typeof castErr.code === "string") {
      return castErr.code.toLowerCase();
    }
    if (typeof castErr.description === "string") {
      return castErr.description.toLowerCase();
    }
  }

  return null;
}

function validateCastMediaUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname.endsWith(".localhost")
  ) {
    throw new Error(
      "Cast URL is localhost. Your TV can't reach that. Restart MEDIA! and try again.",
    );
  }
}

async function ensureCastSession(): Promise<CastSession> {
  const context = cast.framework.CastContext.getInstance();
  let session = context.getCurrentSession();
  if (!session) {
    try {
      await context.requestSession();
    } catch (err) {
      throw formatCastError(err);
    }

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      session = context.getCurrentSession();
      if (session) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!session) {
    throw new Error("Could not connect to a Cast device");
  }

  // Default receiver app needs a beat after SESSION_STARTED before loadMedia.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return session;
}

export function formatCastError(err: unknown, contentUrl?: string): Error {
  if (err instanceof Error && err.message && !("code" in err)) {
    return err;
  }

  const code = normalizeCastErrorCode(err);
  const location = contentUrl ? safeCastLocation(contentUrl) : null;
  const locationHint = location ? ` Tried ${location}.` : "";

  if (code === "session_error" || code === "load_media_failed") {
    return new Error(
      `Chromecast couldn't load the video.${locationHint} Your TV has to fetch the same HTTPS address as the browser (including /reel if you use a reverse proxy). Check that the TV can reach that host.`,
    );
  }

  if (err && typeof err === "object") {
    const castErr = err as {
      description?: string;
      message?: string;
      code?: string | number;
    };
    if (castErr.description?.trim()) {
      return new Error(`${castErr.description}${locationHint}`);
    }
    if (castErr.message?.trim()) {
      return new Error(`${castErr.message}${locationHint}`);
    }
  }

  if (code && CAST_ERROR_HINTS[code]) {
    return new Error(CAST_ERROR_HINTS[code]);
  }

  if (err instanceof Error) {
    return err.message ? err : new Error("Cast failed");
  }

  if (err && typeof err === "object") {
    const castErr = err as { code?: string | number };
    if (castErr.code !== undefined) {
      return new Error(`Cast failed (${String(castErr.code)})`);
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {
      // fall through
    }
  }

  if (typeof err === "string" && err.trim()) {
    return new Error(err);
  }

  return new Error("Cast failed to load media");
}

export async function castMedia(options: CastMediaOptions): Promise<void> {
  await loadCastFramework();

  const pageOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const aligned = pageOrigin
    ? rewriteCastMediaUrls(options, pageOrigin)
    : options;
  const httpUrl = toChromecastMediaUrl(aligned.contentUrl);
  const candidates = [
    httpUrl,
    ...(httpUrl === aligned.contentUrl ? [] : [aligned.contentUrl]),
  ];

  validateCastMediaUrl(candidates[0]);

  const session = await ensureCastSession();

  let lastError: unknown;
  let lastUrl = candidates[0];
  for (const contentUrl of candidates) {
    lastUrl = contentUrl;
    const mediaInfo = new chrome.cast.media.MediaInfo(
      contentUrl,
      aligned.contentType,
    );
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = aligned.title;

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;

    try {
      await session.loadMedia(request);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw formatCastError(lastError, lastUrl);
}

export function subscribeToCastState(
  onChange: (connected: boolean) => void,
): () => void {
  if (!window.cast?.framework) {
    return () => {};
  }

  const context = cast.framework.CastContext.getInstance();
  const handler = () => {
    const state = context.getCastState();
    onChange(state === cast.framework.CastState.CONNECTED);
  };

  context.addEventListener(
    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
    handler,
  );

  handler();

  return () => {
    context.removeEventListener(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      handler,
    );
  };
}
