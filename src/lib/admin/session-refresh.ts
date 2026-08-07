/**
 * Admin access token refresh.
 *
 * Kept separate from src/lib/admin/auth.ts on purpose. That module imports
 * next/headers, which cannot be used from edge middleware. This module has no
 * Next.js imports at all, so middleware can call it safely.
 */

import { createClient } from "@supabase/supabase-js";

import type { AdminSessionLike } from "@/lib/admin/session-cookies";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/server-env";

/**
 * Exchange a refresh token for a fresh session.
 *
 * Returns null on any failure. A refresh failure is not exceptional here: the
 * token may simply have been revoked, rotated or expired, and the caller
 * should treat that as signed out rather than as a crash.
 */
export async function refreshAdminSession(
  refreshToken: string
): Promise<AdminSessionLike | null> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey || !refreshToken) return null;

  try {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session?.access_token) return null;

    return {
      access_token: data.session.access_token,
      // Supabase rotates refresh tokens. Fall back to the incoming one so a
      // response without a new token does not wipe the stored value.
      refresh_token: data.session.refresh_token ?? refreshToken,
      expires_in: data.session.expires_in ?? null
    };
  } catch {
    return null;
  }
}
