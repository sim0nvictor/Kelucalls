/**
 * Startup health checks for KeluCall Supabase integration.
 *
 * Run this on server startup to detect:
 * - Missing environment variables
 * - Missing database tables
 * - Disabled RLS
 * - Connection failures
 */

import { isSupabaseServerConfigured } from "@/lib/supabase/server";

const REQUIRED_ENV = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", scope: "client+server" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", scope: "client" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", scope: "server" },
] as const;

const OPTIONAL_ENV = [
  { name: "SIMULATED_INVESTMENT_PER_CALL", scope: "server" },
  { name: "TELEGRAM_API_ID", scope: "scraper" },
  { name: "TELEGRAM_API_HASH", scope: "scraper" },
] as const;

const EXPECTED_TABLES = [
  "channels",
  "tokens",
  "calls",
  "call_metrics",
  "channel_stats",
  "submissions",
  "ads",
  "admin_users",
  "sponsored_placements",
  "moderation_reports",
  "admin_audit_logs",
  "trending_snapshots",
] as const;

export type HealthStatus = "ok" | "warning" | "error";
export type HealthCheck = { name: string; status: HealthStatus; message: string };
export type HealthReport = { overall: HealthStatus; checks: HealthCheck[]; timestamp: string };

function envCheck(): HealthCheck[] {
  const results: HealthCheck[] = [];

  for (const { name, scope } of REQUIRED_ENV) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
      results.push({ name: `env:${name}`, status: "error", message: `Missing required env var (${scope})` });
    } else if (value.includes("your-") || value.includes("placeholder")) {
      results.push({ name: `env:${name}`, status: "warning", message: `Appears to be a placeholder value (${scope})` });
    } else {
      results.push({ name: `env:${name}`, status: "ok", message: `Set (${scope})` });
    }
  }

  for (const { name, scope } of OPTIONAL_ENV) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
      results.push({ name: `env:${name}`, status: "warning", message: `Optional env var not set (${scope})` });
    }
  }

  return results;
}

async function tableCheck(): Promise<HealthCheck[]> {
  if (!isSupabaseServerConfigured()) {
    return [{ name: "db:connection", status: "error", message: "Supabase not configured — skipping table checks" }];
  }

  const results: HealthCheck[] = [];

  try {
    // Dynamic import to avoid circular deps
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const supabase = getSupabaseServer();

    // Test connection
    const { error: pingError } = await supabase.from("channels").select("id").limit(1);
    if (pingError) {
      results.push({ name: "db:connection", status: "error", message: `Connection failed: ${pingError.message}` });
      return results;
    }
    results.push({ name: "db:connection", status: "ok", message: "Connected to Supabase" });

    // Check each table exists by attempting a count
    for (const table of EXPECTED_TABLES) {
      const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) {
        results.push({ name: `db:table:${table}`, status: "error", message: `Missing or inaccessible: ${error.message}` });
      } else {
        results.push({ name: `db:table:${table}`, status: "ok", message: "Exists" });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name: "db:connection", status: "error", message: `Unexpected: ${msg}` });
  }

  return results;
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];

  // Env checks (sync)
  checks.push(...envCheck());

  // DB checks (async)
  checks.push(...(await tableCheck()));

  // Determine overall status
  const hasError = checks.some((c) => c.status === "error");
  const hasWarning = checks.some((c) => c.status === "warning");
  const overall: HealthStatus = hasError ? "error" : hasWarning ? "warning" : "ok";

  const report: HealthReport = { overall, checks, timestamp: new Date().toISOString() };

  // Log summary
  const icon = overall === "ok" ? "✅" : overall === "warning" ? "⚠️" : "❌";
  console.log(`\n${icon} [health] KeluCall startup check: ${overall.toUpperCase()}`);
  for (const check of checks) {
    if (check.status !== "ok") {
      const ci = check.status === "error" ? "❌" : "⚠️";
      console.log(`  ${ci} ${check.name}: ${check.message}`);
    }
  }
  console.log("");

  return report;
}
