import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

function calculateMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

async function run() {
  console.log("=== REFRESHING CHANNEL_STATS MEDIAN_ROI_PCT FOR MEASURABLE CALLS ===");
  console.log("Timestamp:", new Date().toISOString());

  // 1. Fetch all active/paused channels
  const { data: channels, error: chErr } = await supabase
    .from("channels")
    .select("id, title, slug, status")
    .in("status", ["active", "paused"]);

  if (chErr) {
    console.error("Error fetching channels:", chErr);
    process.exit(1);
  }

  console.log(`Processing ${channels.length} channels...`);

  let updatedCount = 0;
  let channelsWithMeasurableMedian = 0;
  let nonZeroMedians = 0;

  for (const ch of channels) {
    // Paginate calls for channel
    let allCalls = [];
    let page = 0;
    while (true) {
      const { data: calls, error: callsErr } = await supabase
        .from("calls")
        .select(`
          id,
          entry_price_usd,
          call_metrics (
            current_price_usd,
            current_roi_pct
          )
        `)
        .eq("channel_id", ch.id)
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (callsErr) {
        console.error(`Error fetching calls for ${ch.slug}:`, callsErr);
        break;
      }
      if (!calls || calls.length === 0) break;
      allCalls.push(...calls);
      if (calls.length < 1000) break;
      page++;
    }

    // Filter to measurable calls
    const measurableRois = [];
    for (const c of allCalls) {
      const cm = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
      const entryPrice = Number(c.entry_price_usd);
      const currentPrice = cm?.current_price_usd != null ? Number(cm.current_price_usd) : null;
      if (entryPrice > 0 && currentPrice != null && currentPrice > 0) {
        if (cm.current_roi_pct != null && Number.isFinite(Number(cm.current_roi_pct))) {
          measurableRois.push(Number(cm.current_roi_pct));
        }
      }
    }

    const trueMedian = calculateMedian(measurableRois);
    const roundedMedian = Number(trueMedian.toFixed(4));

    if (measurableRois.length > 0) {
      channelsWithMeasurableMedian++;
      if (Math.abs(roundedMedian) > 0.0001) {
        nonZeroMedians++;
      }
    }

    const { error: updErr } = await supabase
      .from("channel_stats")
      .update({
        median_roi_pct: roundedMedian,
        refreshed_at: new Date().toISOString()
      })
      .eq("channel_id", ch.id);

    if (updErr) {
      console.error(`Failed to update median for ${ch.slug}:`, updErr.message);
    } else {
      updatedCount++;
    }
  }

  console.log("\nRefresh complete!");
  console.log({
    totalChannels: channels.length,
    updatedCount,
    channelsWithMeasurableMedian,
    channelsWithNonZeroMedian: nonZeroMedians
  });

  // Verify top channels after update
  const { data: topStats } = await supabase
    .from("channel_stats")
    .select("channel_id, total_calls, average_roi_pct, median_roi_pct, ranking_score, channels(title, slug)")
    .order("total_calls", { ascending: false })
    .limit(10);

  console.log("\nTop 10 Channels by Calls After Median Refresh:");
  for (const s of topStats || []) {
    console.log(`  ${s.channels?.title}: Calls=${s.total_calls}, AvgROI=${s.average_roi_pct}%, MedianROI=${s.median_roi_pct}%, Score=${s.ranking_score}`);
  }
}

run().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
