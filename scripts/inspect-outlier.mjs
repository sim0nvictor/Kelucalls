import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log("=== OUTLIER CALL INVESTIGATION ===");

  // Find the exact call with current_roi_pct > 1000000
  const { data: metrics, error } = await supabase
    .from("call_metrics")
    .select(`
      call_id,
      current_price_usd,
      peak_price_usd,
      current_roi_pct,
      peak_roi_pct,
      current_multiple,
      peak_multiple,
      simulated_investment_usd,
      simulated_current_value_usd,
      simulated_current_pnl_usd,
      simulated_peak_pnl_usd,
      is_win,
      refreshed_at,
      updated_at,
      calls (
        id,
        channel_id,
        token_id,
        telegram_message_id,
        source_message_id,
        message_text,
        called_at,
        detected_symbol,
        detected_contract_address,
        entry_price_usd,
        entry_market_cap_usd,
        confidence_score,
        status,
        created_at,
        updated_at,
        channels (
          id,
          slug,
          title,
          telegram_handle,
          is_paid_channel
        ),
        tokens (
          id,
          slug,
          symbol,
          name,
          chain,
          contract_address,
          last_price_usd,
          last_market_cap_usd,
          coingecko_id,
          dexscreener_pair_id,
          status,
          created_at
        )
      )
    `)
    .gt("current_roi_pct", 1000000);

  if (error) {
    console.error("Query error:", error);
    return;
  }

  console.log("Found outlier metric rows:", metrics.length);
  for (const m of metrics) {
    console.log(JSON.stringify(m, null, 2));

    // Also check if there are any other calls for the same token
    const tokenId = m.calls?.token_id;
    if (tokenId) {
      const { data: siblingCalls } = await supabase
        .from("calls")
        .select("id, channel_id, called_at, entry_price_usd, channels(title, slug)")
        .eq("token_id", tokenId);
      console.log("\nSibling calls for token:", JSON.stringify(siblingCalls, null, 2));
    }
  }
}

run();
