"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for the public account system.
 *
 * This is intentionally separate from src/lib/supabase/client.ts. That client
 * is a plain anon client with no cookie handling, so a session created in it
 * is invisible to the server. This one writes the session to cookies, which
 * is what lets server components and middleware see the user at all.
 *
 * These two env vars are NEXT_PUBLIC_, so Next inlines them at build time.
 * They must be referenced as full literals - process.env[name] does not work.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the browser has everything it needs to talk to Supabase auth. */
export const isSupabaseAuthConfiguredInBrowser = Boolean(supabaseUrl && supabaseAnonKey);

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a singleton browser client, or null when the app is misconfigured.
 *
 * Returning null rather than throwing lets the UI show an honest "sign in is
 * unavailable" state instead of a blank crash.
 */
export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!client) {
    client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}
