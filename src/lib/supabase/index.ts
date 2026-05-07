/**
 * Supabase integration barrel export.
 *
 * Usage:
 *   import { getSupabaseClient } from "@/lib/supabase"          // browser
 *   import { getSupabaseServer } from "@/lib/supabase/server"   // server
 *   import { createSupabaseAdmin } from "@/lib/supabase/admin"  // admin writes
 */

export { getSupabaseClient } from "./client";
export { getSupabaseServer, isSupabaseServerConfigured, withSupabaseServer } from "./server";
export { createSupabaseAdmin } from "./admin";
export type { Database } from "./types";
