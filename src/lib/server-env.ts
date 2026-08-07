function readEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

export function getAppUrl() {
  return readEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

export function getSupabaseUrl() {
  return readEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey() {
  return readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * True when server side data access is possible.
 *
 * Deliberately does NOT require the anon key. Everything gated by this check
 * reads through the service role client, so demanding an anon key here would
 * blank out public pages in an environment that never needed one.
 */
export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/**
 * True when admin authentication is possible.
 *
 * Admin auth is stricter than isSupabaseConfigured(): it signs the admin in
 * with the anon key and then verifies the admin_users row with the service
 * role key, so it needs all three values. Keeping this separate is what stops
 * a missing anon key from silently degrading the public site.
 */
export function isAdminAuthConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey() && getSupabaseServiceRoleKey());
}

export function getSimulatedInvestmentPerCall() {
  const raw = readEnv("SIMULATED_INVESTMENT_PER_CALL");
  const parsed = raw ? Number(raw) : 10;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}
