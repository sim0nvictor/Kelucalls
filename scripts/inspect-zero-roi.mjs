import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  const { data: calls } = await supabase
    .from("calls")
    .select(`
      id,
      called_at,
      entry_price_usd,
      call_metrics (
        current_price_usd,
        current_roi_pct,
        current_multiple,
        is_win,
        refreshed_at
      )
    `)
    .eq("channel_id", "a3760665-af56-454b-b02f-d2d0df3c80ae")
    .limit(30);

  let zeroRoiSample = [];
  for (const c of calls || []) {
    const cm = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
    if (cm && Number(cm.current_roi_pct) === 0) {
      zeroRoiSample.push({
        id: c.id,
        entry_price: c.entry_price_usd,
        current_price: cm.current_price_usd,
        current_roi_pct: cm.current_roi_pct,
        current_multiple: cm.current_multiple,
        is_win: cm.is_win,
        refreshed_at: cm.refreshed_at
      });
    }
  }
  console.log("Sample of 0 ROI calls:", JSON.stringify(zeroRoiSample.slice(0, 10), null, 2));
}

run();
