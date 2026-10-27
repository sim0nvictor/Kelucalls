import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  // Read trendingcrypto current median_roi_pct
  const { data: before, error: bErr } = await supabase
    .from("channel_stats")
    .select("channel_id, median_roi_pct")
    .eq("channel_id", "a3760665-af56-454b-b02f-d2d0df3c80ae")
    .single();

  console.log("Before update:", before, bErr);

  // Test updating median_roi_pct to the exact same value to test write permissions
  const { data: updated, error: uErr } = await supabase
    .from("channel_stats")
    .update({ median_roi_pct: before.median_roi_pct })
    .eq("channel_id", "a3760665-af56-454b-b02f-d2d0df3c80ae")
    .select();

  console.log("Update test result:", updated, uErr);
}

run();
