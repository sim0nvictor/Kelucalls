/**
 * Shared constants for the public (non-admin) account system.
 *
 * Every user-facing auth path lives here so that moving a route is a single
 * edit rather than a grep. The admin system has its own separate copy of this
 * in src/lib/admin/constants.ts and the two must never be merged - the whole
 * point is that the admin surface stays hidden and independent.
 */

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const SIGN_OUT_PATH = "/auth/sign-out";

export const ACCOUNT_BASE_PATH = "/account";

/** Routes that a signed-in user should be bounced away from. */
export const AUTH_ROUTES = [
  LOGIN_PATH,
  SIGNUP_PATH,
  FORGOT_PASSWORD_PATH,
] as const;

/** Where a user lands after signing in when no ?next= was supplied. */
export const DEFAULT_SIGNED_IN_PATH = ACCOUNT_BASE_PATH;

/** Query param used to round-trip the originally requested page. */
export const NEXT_PARAM = "next";

/**
 * Supabase enforces a minimum of 6 by default. We ask for 8 in the UI but we
 * deliberately do NOT hard-fail client side before contacting Supabase on
 * sign-IN - only on sign-UP. An existing account with a 6 character password
 * must still be able to log in.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** The hidden admin surface is never a valid public redirect target. */
const ADMIN_PREFIX = "/kx-admin";

/** Char code for a backslash, used for the protocol-relative URL check. */
const BACKSLASH = 92;

/**
 * Sanitise a user-supplied ?next= value into a safe same-origin path.
 *
 * Rejects anything that could be used as an open redirect:
 *   - absolute URLs (https://evil.com)
 *   - protocol-relative URLs (//evil.com and /(backslash)evil.com)
 *   - the admin surface
 *   - the auth pages themselves (which would cause a redirect loop)
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_SIGNED_IN_PATH,
): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.charCodeAt(1) === BACKSLASH) return fallback;
  if (value === ADMIN_PREFIX || value.startsWith(`${ADMIN_PREFIX}/`)) return fallback;

  const pathOnly = value.split("?")[0].split("#")[0];
  if ((AUTH_ROUTES as readonly string[]).includes(pathOnly)) return fallback;
  if (pathOnly === RESET_PASSWORD_PATH) return fallback;

  return value;
}

/** Build a login URL that will return the user to `from` after signing in. */
export function loginUrlFor(from: string): string {
  const next = safeNextPath(from, "");
  if (!next) return LOGIN_PATH;
  return `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}
