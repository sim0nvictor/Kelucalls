import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_BASE_PATH,
  ADMIN_EXPIRES_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_SIGN_IN_PATH
} from "@/lib/admin/constants";
import {
  buildAdminSessionCookies,
  type AdminCookieWrite
} from "@/lib/admin/session-cookies";
import { refreshAdminSession } from "@/lib/admin/session-refresh";
import {
  ACCOUNT_BASE_PATH,
  AUTH_ROUTES,
  LOGIN_PATH,
  NEXT_PARAM,
  safeNextPath
} from "@/lib/auth/constants";

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

/** Routes that require a signed-in public user. */
function isProtectedAccountRoute(pathname: string) {
  return pathname === ACCOUNT_BASE_PATH || pathname.startsWith(`${ACCOUNT_BASE_PATH}/`);
}

/** Auth pages a signed-in user should be bounced away from. */
function isAuthRoute(pathname: string) {
  return (AUTH_ROUTES as readonly string[]).includes(pathname);
}

/**
 * Build a redirect that preserves any Set-Cookie headers Supabase produced
 * while refreshing the session. Dropping these is the classic middleware bug
 * that causes an infinite redirect loop between /login and /account.
 */
function redirectPreservingCookies(url: URL, source: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  applySecurityHeaders(redirectResponse);
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kelucalls-pathname", pathname);
  requestHeaders.set(
    "x-kelucalls-surface",
    pathname.startsWith(ADMIN_BASE_PATH) ? "admin" : "public"
  );

  // /admin remains a decoy that bounces to the homepage. The real admin
  // surface lives at ADMIN_BASE_PATH.
  //
  // NOTE: "/login" used to be in this list, which is why the public login page
  // never worked - the request was 307'd to "/" before it ever reached a page.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const response = NextResponse.redirect(new URL("/", request.url));
    applySecurityHeaders(response);
    return response;
  }

  // Admin gate. Cookie presence is only a hint; the real check still happens
  // server side in requireAdminIdentity().
  if (pathname.startsWith(ADMIN_BASE_PATH)) {
    const isSignInRoute = pathname === ADMIN_SIGN_IN_PATH;
    const accessToken = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value;
    const expiresAt = Number(request.cookies.get(ADMIN_EXPIRES_COOKIE)?.value ?? 0);
    const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
    const accessTokenLooksLive = Boolean(accessToken) && (!expiresAt || expiresAt > Date.now());

    let refreshedCookies: AdminCookieWrite[] = [];

    /**
     * THE FIX. The refresh token was written at sign in and then never read by
     * anything, so once the access token aged out (about an hour) the next
     * click bounced the admin to the sign in page even though a perfectly good
     * refresh token was sitting in the browser.
     *
     * This has to happen in middleware. getAdminIdentity() runs inside a
     * Server Component render, where cookies().set() throws, so it physically
     * cannot renew its own session.
     */
    if (!accessTokenLooksLive && refreshToken) {
      const session = await refreshAdminSession(refreshToken);

      if (session) {
        refreshedCookies = buildAdminSessionCookies(session);

        // Update the inbound request too, then rebuild the cookie header, so
        // the render happening on THIS request sees the new token instead of
        // waiting for the browser's next round trip.
        //
        // Deliberately not a redirect: admin server actions POST to the same
        // path, and a redirect would downgrade them to GET and drop the action.
        for (const write of refreshedCookies) {
          request.cookies.set(write.name, write.value);
        }
        requestHeaders.set(
          "cookie",
          request.cookies
            .getAll()
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; ")
        );
      }
    }

    const hasValidSessionHint = accessTokenLooksLive || refreshedCookies.length > 0;

    if (!isSignInRoute && !hasValidSessionHint) {
      const loginUrl = new URL(ADMIN_SIGN_IN_PATH, request.url);
      loginUrl.searchParams.set("next", pathname);
      const response = NextResponse.redirect(loginUrl);
      applySecurityHeaders(response);
      return response;
    }

    // The admin surface manages its own cookies; skip the public session work.
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    for (const write of refreshedCookies) {
      response.cookies.set(write.name, write.value, write.options);
    }
    applySecurityHeaders(response);
    return response;
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without public Supabase credentials there is no session to refresh. Fail
  // closed on protected routes, but let the rest of the site render normally.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtectedAccountRoute(pathname)) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      return redirectPreservingCookies(loginUrl, response);
    }
    applySecurityHeaders(response);
    return response;
  }

  /**
   * Refresh the Supabase session on every public request. Calling getUser()
   * here rotates the token and writes the new cookies onto the outgoing
   * response. The admin branch above now does the equivalent for its own
   * separate cookie set.
   */
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Rebuild the response so the refreshed cookies are visible to the
        // route being rendered, keeping our custom request headers intact.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // A Supabase outage must not take the whole site down. Treat it as signed
    // out; protected pages will bounce to login, public pages still render.
    console.error("[middleware] supabase.auth.getUser failed:", error);
  }

  if (!user && isProtectedAccountRoute(pathname)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set(NEXT_PARAM, `${pathname}${request.nextUrl.search}`);
    return redirectPreservingCookies(loginUrl, response);
  }

  if (user && isAuthRoute(pathname)) {
    const next = safeNextPath(request.nextUrl.searchParams.get(NEXT_PARAM));
    return redirectPreservingCookies(new URL(next, request.url), response);
  }

  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|icons.svg).*)"]
};
