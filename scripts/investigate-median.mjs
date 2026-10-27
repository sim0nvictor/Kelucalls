import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log("=== INVESTIGATING MEDIAN ROI AND CURRENT_ROI_PCT DISTRIBUTION ===");

  // Check trendingcrypto channel calls
  const { data: channel } = await supabase
    .from("channels")
    .select("id, slug, title")
    .eq("slug", "trendingcrypto")
    .single();

  if (!channel) return;

  const { data: calls } = await supabase
    .from("calls")
    .select(`
      id,
      called_at,
      entry_price_usd,
      call_metrics (
        current_price_usd,
        current_roi_pct,
        is_win
      )
    `)
    .eq("channel_id", channel.id);

  console.log(`Total calls for ${channel.title}:`, calls.length);

  let nullPriceCount = 0;
  let zeroPriceCount = 0;
  let validPriceCount = 0;
  let roiValuesAll = [];
  let roiValuesMeasurableOnly = [];

  for (const c of calls) {
    const cm = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
    if (!cm || cm.current_price_usd === null) {
      nullPriceCount++;
    } else if (Number(cm.current_price_usd) <= 0) {
      zeroPriceCount++;
    } else {
      validPriceCount++;
      if (cm.current_roi_pct !== null) {
        roiValuesMeasurableOnly.push(Number(cm.current_roi_pct));
      }
    }
    if (cm && cm.current_roi_pct !== null) {
      roiValuesAll.push(Number(cm.current_roi_pct));
    }
  }

  roiValuesAll.sort((a, b) => a - b);
  roiValuesMeasurableOnly.sort((a, b) => a - b);

  const medianAll = roiValuesAll.length > 0 ? roiValuesAll[Math.floor(roiValuesAll.length / 2)] : 0;
  const medianMeasurable = roiValuesMeasurableOnly.length > 0 ? roiValuesMeasurableOnly[Math.floor(roiValuesMeasurableOnly.length / 2)] : 0;

  console.log({
    channel: channel.title,
    totalCalls: calls.length,
    nullPriceCount,
    zeroPriceCount,
    validPriceCount,
    medianAll,
    medianMeasurable,
    measurableRoiSample: {
      min: roiValuesMeasurableOnly[0],
      p10: roiValuesMeasurableOnly[Math.floor(roiValuesMeasurableOnly.length * 0.1)],
      p25: roiValuesMeasurableOnly[Math.floor(roiValuesMeasurableOnly.length * 0.25)],
      p50: medianMeasurable,
      p75: roiValuesMeasurableOnly[Math.floor(roiValuesMeasurableOnly.length * 0.75)],
      p90: roiValuesMeasurableOnly[Math.floor(roiValuesMeasurableOnly.length * 0.9)],
      max: roiValuesMeasurableOnly[roiValuesMeasurableOnly.length - 1],
    },
    allRoiZeroCount: roiValuesAll.filter(v => v === 0).length
  });
}

run();
