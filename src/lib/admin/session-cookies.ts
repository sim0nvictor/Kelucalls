/**
 * Single source of truth for admin session cookie names, values and
 * attributes.
 *
 * Why this module exists: the admin session is written from two places that
 * cannot share a code path. src/lib/admin/auth.ts writes it from a server
 * action through the next/headers cookie store, while middleware.ts writes it
 * onto a NextResponse while refreshing an expired token. Both take the same
 * (name, value, options) shape, so without a shared builder the attributes
 * would drift apart over time. Cookie attribute drift produces authentication
 * bugs that are very hard to see, so the attributes are built in exactly one
 * place.
 *
 * This module imports nothing from next/headers so it stays safe to use from
 * edge middleware.
 */

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COOKIE_PATH,
  ADMIN_EXPIRES_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_SESSION_MAX_AGE
} from "@/lib/admin/constants";

/** The subset of a Supabase session this module needs. */
export type AdminSessionLike = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
};

export type AdminCookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
  expires: Date;
};

export type AdminCookieWrite = {
  name: string;
  value: string;
  options: AdminCookieOptions;
};

/**
 * Refresh tokens outlive access tokens so an admin who steps away for a few
 * hours comes back to a session that can still be renewed.
 */
const REFRESH_MAX_AGE = ADMIN_SESSION_MAX_AGE * 7;

export const ADMIN_SESSION_COOKIE_NAMES = [
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_EXPIRES_COOKIE
];

function cookieOptions(maxAge: number, expires: Date): AdminCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ADMIN_COOKIE_PATH,
    maxAge,
    expires
  };
}

function livingCookie(name: string, value: string, maxAgeSeconds: number): AdminCookieWrite {
  return {
    name,
    value,
    options: cookieOptions(maxAgeSeconds, new Date(Date.now() + maxAgeSeconds * 1000))
  };
}

/**
 * Build the cookie writes that establish an admin session.
 */
export function buildAdminSessionCookies(session: AdminSessionLike): AdminCookieWrite[] {
  const maxAge =
    session.expires_in && session.expires_in > 0 ? session.expires_in : ADMIN_SESSION_MAX_AGE;

  const writes: AdminCookieWrite[] = [
    livingCookie(ADMIN_ACCESS_COOKIE, session.access_token, maxAge)
  ];

  // Supabase only returns a refresh token on some responses. Never clear a
  // good one by writing an empty value over it.
  if (session.refresh_token) {
    writes.push(livingCookie(ADMIN_REFRESH_COOKIE, session.refresh_token, REFRESH_MAX_AGE));
  }

  writes.push(livingCookie(ADMIN_EXPIRES_COOKIE, String(Date.now() + maxAge * 1000), maxAge));

  return writes;
}

/**
 * Build the cookie writes that tear an admin session down.
 */
export function buildAdminSessionClearCookies(): AdminCookieWrite[] {
  return ADMIN_SESSION_COOKIE_NAMES.map((name) => ({
    name,
    value: "",
    options: cookieOptions(0, new Date(0))
  }));
}
