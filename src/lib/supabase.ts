import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/server-env";

export function getSupabaseServerClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();

  if (!url || !key) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function withSupabase<T>(operation: (client: ReturnType<typeof getSupabaseServerClient>) => Promise<T>, fallback: T) {
  if (!isSupabaseConfigured()) {
    return fallback;
  }

  try {
    return await operation(getSupabaseServerClient());
  } catch (error) {
    console.error("Supabase operation failed", error);
    return fallback;
  }
}
