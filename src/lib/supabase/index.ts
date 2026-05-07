/**
 * Supabase integration barrel export.
 *
 * Usage:
 *   import { getSupabaseClient } from "@/lib/supabase"            // browser
 *   import { getSupabaseServer } from "@/lib/supabase/server"     // server reads
 *   import { createSupabaseAdmin } from "@/lib/supabase/admin"    // server writes
 *   import { insertToken, insertCall } from "@/lib/supabase/insert"  // ingestion
 *   import { getTrendingTokens } from "@/lib/supabase/queries"    // paginated queries
 *   import { runHealthChecks } from "@/lib/supabase/health"       // startup checks
 */

export { getSupabaseClient } from "./client";
export { getSupabaseServer, isSupabaseServerConfigured, withSupabaseServer } from "./server";
export { createSupabaseAdmin } from "./admin";
export type { Database } from "./types";
