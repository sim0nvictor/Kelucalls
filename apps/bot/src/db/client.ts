import { createSupabaseServiceClient } from "../../../../packages/db/src/index.js";
import { env } from "../config/env.js";

export const supabase = createSupabaseServiceClient({
  url: env.SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
});
