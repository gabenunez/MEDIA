/**
 * Helpers for keeping catalog HTML off unauthenticated document requests.
 * Used by Next.js proxy.ts (Node) and the login gate (browser).
 */

export function isLoginPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/login";
}

/**
 * Only allow same-origin relative paths as a post-login destination.
 * Rejects protocol-relative URLs, backslashes, and the login route itself.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  if (trimmed.includes("://") || trimmed.includes("\\")) return null;
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  if (isLoginPath(pathOnly)) return null;
  return trimmed;
}

/** Where to send the browser after a successful password unlock. */
export function resolvePostLoginHref(input: {
  pathname: string;
  search: string;
  isTv: boolean;
}): string {
  if (!isLoginPath(input.pathname)) {
    return `${input.pathname}${input.search}`;
  }

  const params = new URLSearchParams(
    input.search.startsWith("?") ? input.search.slice(1) : input.search,
  );
  const next = safeInternalPath(params.get("next"));
  if (next) return next;
  if (input.isTv || params.get("tv") === "1") return "/?tv=1";
  return "/";
}

export function resolveAuthStatusUrl(
  env: Record<string, string | undefined>,
): string {
  const internal = env.MEDIA_INTERNAL_API_URL?.replace(/\/$/, "");
  if (internal) return `${internal}/api/auth/status`;
  const port =
    env.MEDIA_INTERNAL_API_PORT ?? env.MEDIA_RUNTIME_API_PORT ?? "8097";
  return `http://127.0.0.1:${port}/api/auth/status`;
}
