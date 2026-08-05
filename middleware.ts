import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_BASE_PATH,
  ADMIN_EXPIRES_COOKIE,
  ADMIN_SIGN_IN_PATH
} from "@/lib/admin/constants";

/**
 * Site-wide Content-Security-Policy.
 *
 * Kept as a list so each directive can be reasoned about on its own. Note that
 * any directive omitted here silently falls back to default-src ('self'), which
 * is what previously blocked the token price chart.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https: wss:",
  // Token pages embed the live DexScreener chart. Without an explicit frame-src
  // this inherits default-src ('self') and the chart renders as a blank
  // "content is blocked" frame.
  "frame-src 'self' https://dexscreener.com https://*.dexscreener.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Governs who may embed Kelucalls, not what Kelucalls embeds. Stays locked.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join("; ");

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Like frame-ancestors, this restricts others embedding us, not our own
  // iframes, so it can stay at DENY.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kelucalls-pathname", pathname);
  requestHeaders.set(
    "x-kelucalls-surface",
    pathname.startsWith(ADMIN_BASE_PATH) ? "admin" : "public"
  );

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/login") {
    const response = NextResponse.redirect(new URL("/", request.url));
    applySecurityHeaders(response);
    return response;
  }

  if (pathname.startsWith(ADMIN_BASE_PATH)) {
    const isSignInRoute = pathname === ADMIN_SIGN_IN_PATH;
    const accessToken = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value;
    const expiresAt = Number(request.cookies.get(ADMIN_EXPIRES_COOKIE)?.value ?? 0);
    const hasValidSessionHint = Boolean(accessToken) && (!expiresAt || expiresAt > Date.now());

    if (!isSignInRoute && !hasValidSessionHint) {
      const loginUrl = new URL(ADMIN_SIGN_IN_PATH, request.url);
      loginUrl.searchParams.set("next", pathname);
      const response = NextResponse.redirect(loginUrl);
      applySecurityHeaders(response);
      return response;
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|icons.svg).*)"]
};
