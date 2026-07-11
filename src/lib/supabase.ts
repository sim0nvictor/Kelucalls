import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/server-env";

export function getSupabaseServerClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function withSupabase<T>(
  operation: (client: ReturnType<typeof getSupabaseServerClient>) => Promise<T>,
  fallback: T
): Promise<T> {
  if (!isSupabaseConfigured()) {
    console.warn("[withSupabase] Supabase is not configured — returning fallback.");
    return fallback;
  }

  try {
    return await operation(getSupabaseServerClient());
  } catch (error: unknown) {
    // Supabase client errors, PostgreSQL errors, and plain Error objects
    // all have different shapes — log everything useful
    const isObj = typeof error === "object" && error !== null;

    console.error("[withSupabase] Operation failed:", {
      // Standard Error
      message: isObj ? (error as Record<string, unknown>).message : String(error),
      // Supabase / PostgREST fields
      code:    isObj ? (error as Record<string, unknown>).code    : undefined,
      details: isObj ? (error as Record<string, unknown>).details : undefined,
      hint:    isObj ? (error as Record<string, unknown>).hint    : undefined,
      // Full object dump so nothing is hidden
      raw:     JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
    });

    return fallback;
  }
}