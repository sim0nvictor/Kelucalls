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

export function getSupabaseServiceRoleKey() {
  return readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function getAdminUsername() {
  return readEnv("ADMIN_LOGIN_USERNAME") ?? "admin";
}

export function getAdminPassword() {
  return readEnv("ADMIN_LOGIN_PASSWORD");
}

export function getAdminSessionSecret() {
  return readEnv("ADMIN_SESSION_SECRET");
}

export function getSimulatedInvestmentPerCall() {
  const raw = readEnv("SIMULATED_INVESTMENT_PER_CALL");
  const parsed = raw ? Number(raw) : 10;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}
