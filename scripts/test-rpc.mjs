import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  // Test whether Postgres supports FILTER with percentile_cont
  // We can test this by creating a temporary function or querying via rpc if available,
  // or testing in a query. Since we can't run raw SQL directly without an rpc,
  // let's check what RPCs exist or if there's an existing sql executor.
  
  // Let's check existing RPC functions in public schema
  const { data, error } = await supabase.rpc("refresh_channel_stats", { target_channel_id: "a3760665-af56-454b-b02f-d2d0df3c80ae" });
  console.log("refresh_channel_stats test run result:", { data, error });
}

run();
