import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

let serverInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a server-side Supabase client using the **service role key**.
 *
 * This client BYPASSES RLS and must NEVER be exposed to the browser.
 * It is a singleton — repeated calls return the same instance.
 */
export function getSupabaseServer(): SupabaseClient<Database> {
  if (serverInstance) {
    return serverInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase server config. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  serverInstance = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverInstance;
}

/**
 * Returns true if both server-side Supabase env vars are present.
 */
export function isSupabaseServerConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && url.trim().length > 0 && key && key.trim().length > 0);
}

/**
 * Executes a Supabase operation server-side with a fallback value on error.
 * If Supabase is not configured, returns the fallback immediately.
 */
export async function withSupabaseServer<T>(
  operation: (client: SupabaseClient<Database>) => Promise<T>,
  fallback: T
): Promise<T> {
  if (!isSupabaseServerConfigured()) {
    return fallback;
  }

  try {
    return await operation(getSupabaseServer());
  } catch (error) {
    console.error("[supabase/server] operation failed:", error);
    return fallback;
  }
}
