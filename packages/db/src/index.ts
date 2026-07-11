import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseServiceConfig = {
  url: string;
  serviceRoleKey: string;
};

export function createSupabaseServiceClient(config: SupabaseServiceConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
