import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveLegacyRouteRedirect } from "@media-app/shared";
import { withBasePath } from "@/lib/base-path";
import {
  isLoginPath,
  resolveAuthStatusUrl,
  safeInternalPath,
} from "./lib/auth-html-gate";

type AuthStatus = {
  required: boolean;
  authenticated: boolean;
};

/**
 * Runs before the Next.js cache. Unauthenticated HTML/RSC never hits HomePage
 * (or any other catalog page), so ISR payloads with titles/posters are not sent.
 *
 * Proxy cannot render React itself — it rewrites to `/login/`, a route that
 * does not fetch library data. After login the client fully reloads.
 */
export async function proxy(request: NextRequest) {
  const redirect = resolveLegacyRouteRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (redirect) {
    return NextResponse.redirect(new URL(withBasePath(redirect), request.url));
  }

  const status = await getAuthStatus(request);
  const { pathname, search } = request.nextUrl;

  if (isLoginPath(pathname)) {
    if (!status.required || status.authenticated) {
      const next = safeInternalPath(
        request.nextUrl.searchParams.get("next"),
      );
      const dest = request.nextUrl.clone();
      dest.search = "";
      if (next) {
        const parsed = new URL(next, request.nextUrl.origin);
        dest.pathname = parsed.pathname;
        dest.search = parsed.search;
      } else {
        dest.pathname = "/";
        if (request.nextUrl.searchParams.get("tv") === "1") {
          dest.searchParams.set("tv", "1");
        }
      }
      return NextResponse.redirect(dest);
    }
    return NextResponse.next();
  }

  if (!status.required || status.authenticated) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login/";
  loginUrl.search = search;
  return NextResponse.rewrite(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|internal/|favicon.ico|.*\\..*).*)",
  ],
};

async function getAuthStatus(request: NextRequest): Promise<AuthStatus> {
  try {
    const res = await fetch(resolveAuthStatusUrl(process.env), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return { required: true, authenticated: false };
    }
    const data = (await res.json()) as Partial<AuthStatus>;
    return {
      required: Boolean(data.required),
      authenticated: Boolean(data.authenticated),
    };
  } catch {
    return { required: true, authenticated: false };
  }
}
