import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveLegacyRouteRedirect } from "@media-app/shared";
import { resolveGatewayRewritePath, toGatewayUrl } from "@/lib/gateway";

export function proxy(request: NextRequest) {
  const gatewayRewrite = resolveGatewayRewritePath(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (gatewayRewrite) {
    const url = request.nextUrl.clone();
    url.pathname = gatewayRewrite.pathname;
    url.search = gatewayRewrite.search;
    return NextResponse.rewrite(url);
  }

  const redirect = resolveLegacyRouteRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (!redirect) return NextResponse.next();
  return NextResponse.redirect(new URL(toGatewayUrl(redirect), request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
