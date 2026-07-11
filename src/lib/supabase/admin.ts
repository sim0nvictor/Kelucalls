import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a **fresh** Supabase admin client for write operations.
 *
 * Unlike the singleton server client, this creates a new instance each time
 * to prevent cross-request state leaks during admin mutations.
 *
 * Uses the service role key — NEVER expose to the browser.
 */
export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin config. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
