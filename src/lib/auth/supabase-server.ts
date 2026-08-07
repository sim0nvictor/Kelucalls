import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/server-env";

/**
 * Cookie-aware Supabase client for server components, route handlers and
 * server actions.
 *
 * Why this exists rather than reusing src/lib/supabase/server.ts:
 *   - That client uses the SERVICE ROLE key, which bypasses RLS entirely. It
 *     must never be used to represent a logged-in visitor.
 *   - It also has no cookie storage, so it has no concept of "who is asking".
 *
 * Why @supabase/ssr rather than hand-rolled cookies like the admin flow:
 *   - The admin flow stores a refresh token and then never uses it, so every
 *     admin gets silently logged out roughly once an hour when the access
 *     token expires. createServerClient plus the middleware refresh handles
 *     token rotation automatically.
 */

export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

/**
 * Resolve the public Supabase config, or null when it is incomplete.
 *
 * Note: isSupabaseConfigured() in server-env.ts only checks the URL and the
 * service role key - it does NOT check the anon key. Auth needs the anon key
 * specifically, so we check it here rather than trusting that helper.
 */
export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseAuthConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}

/**
 * Create a request-scoped Supabase client bound to the Next cookie store.
 *
 * Returns null when misconfigured so callers can surface `not_configured`
 * instead of pretending the user typed the wrong password.
 */
export async function createSupabaseServerClient() {
  const config = getPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot write cookies.
          // Safe to ignore: middleware refreshes the session on every request,
          // so the cookie will be written there instead.
        }
      },
    },
  });
}

/**
 * Same as above but throws. Use only in code paths that have already checked
 * configuration, or where a crash is genuinely the right outcome.
 */
export async function requireSupabaseServerClient() {
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new Error(
      "Supabase auth is not configured. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are both required.",
    );
  }
  return client;
}
