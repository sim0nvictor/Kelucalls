import { type NextRequest, NextResponse } from "next/server";

import { ADMIN_BASE_PATH, ADMIN_SIGN_IN_PATH, ADMIN_ACCESS_COOKIE } from "@/lib/admin/constants";

/**
 * Middleware — Kelucalls
 *
 * Responsibilities:
 * 1. Tag every /kx-admin request with x-kelucalls-surface: admin
 *    so the root layout can switch to the admin shell.
 * 2. Forward the current pathname as x-kelucalls-pathname
 *    so auth helpers can build correct redirect URLs server-side.
 * 3. Guard all /kx-admin routes (except sign-in) behind a cookie
 *    presence check. The real identity verification happens in
 *    requireAdminIdentity() — this is just a fast redirect for
 *    unauthenticated visitors so they don't hit server components
 *    without a token at all.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only run for the hidden admin surface
  if (!pathname.startsWith(ADMIN_BASE_PATH)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Always inject these two headers for every /kx-admin request
  response.headers.set("x-kelucalls-surface", "admin");
  response.headers.set("x-kelucalls-pathname", pathname);

  // Sign-in page is always public — no cookie check needed
  if (pathname === ADMIN_SIGN_IN_PATH || pathname.startsWith(`${ADMIN_SIGN_IN_PATH}/`)) {
    return response;
  }

  // For every other admin route, require the access cookie to exist.
  // requireAdminIdentity() will validate the token properly in the
  // server component; this middleware is the fast-path redirect.
  const accessToken = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value;

  if (!accessToken) {
    const signInUrl = new URL(ADMIN_SIGN_IN_PATH, request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all /kx-admin paths. Exclude Next.js internals and static
     * assets so they never hit this middleware.
     */
    "/kx-admin/:path*"
  ]
};