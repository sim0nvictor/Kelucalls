import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_BASE_PATH,
  ADMIN_EXPIRES_COOKIE,
  ADMIN_SIGN_IN_PATH
} from "@/lib/admin/constants";

function applySecurityHeaders(response: NextResponse) {
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
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
