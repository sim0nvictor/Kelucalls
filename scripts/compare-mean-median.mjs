import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log("=== COMPARING MEAN VS MEDIAN ON MEASURABLE VS ALL CALLS ===");

  // Get top 20 channels by total_calls
  const { data: channels } = await supabase
    .from("channels")
    .select("id, title, slug, status")
    .in("status", ["active", "paused"])
    .limit(200);

  // We need calls and metrics for each channel
  // Fetch calls with metrics
  let channelData = [];

  for (const ch of channels || []) {
    // paginate calls for channel if needed
    let allCalls = [];
    let page = 0;
    while (true) {
      const { data: calls } = await supabase
        .from("calls")
        .select(`
          id,
          entry_price_usd,
          call_metrics (
            current_price_usd,
            current_roi_pct,
            is_win
          )
        `)
        .eq("channel_id", ch.id)
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (!calls || calls.length === 0) break;
      allCalls.push(...calls);
      if (calls.length < 1000) break;
      page++;
    }

    if (allCalls.length === 0) continue;

    let totalCalls = allCalls.length;
    let measurableCalls = 0;
    let wins = 0;
    let measurableLosses = 0;
    let unmeasurableCalls = 0;

    let measurableRois = [];
    let allRois = [];

    for (const c of allCalls) {
      const cm = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
      const entryPrice = Number(c.entry_price_usd);
      const currentPrice = cm?.current_price_usd !== null && cm?.current_price_usd !== undefined ? Number(cm.current_price_usd) : null;
      const isMeasurable = entryPrice > 0 && currentPrice !== null && currentPrice > 0;

      if (isMeasurable) {
        measurableCalls++;
        const roi = Number(cm.current_roi_pct);
        measurableRois.push(roi);
        allRois.push(roi);
        if (cm.is_win) {
          wins++;
        } else {
          measurableLosses++;
        }
      } else {
        unmeasurableCalls++;
        // If metric exists and has roi:
        if (cm?.current_roi_pct !== null && cm?.current_roi_pct !== undefined) {
          allRois.push(Number(cm.current_roi_pct));
        } else {
          allRois.push(0);
        }
      }
    }

    measurableRois.sort((a, b) => a - b);
    allRois.sort((a, b) => a - b);

    const calcMedian = (arr) => {
      if (arr.length === 0) return 0;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    const calcMean = (arr) => {
      if (arr.length === 0) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };

    const meanMeasurableRoi = calcMean(measurableRois);
    const medianMeasurableRoi = calcMedian(measurableRois);
    const meanAllRoi = calcMean(allRois);
    const medianAllRoi = calcMedian(allRois);

    channelData.push({
      channel: ch.title || ch.slug,
      slug: ch.slug,
      totalCalls,
      measurableCalls,
      unmeasurableCalls,
      wins,
      measurableLosses,
      winRateMeasurablePct: measurableCalls > 0 ? (wins / measurableCalls) * 100 : 0,
      lossRateMeasurablePct: measurableCalls > 0 ? (measurableLosses / measurableCalls) * 100 : 0,
      winRateTotalPct: totalCalls > 0 ? (wins / totalCalls) * 100 : 0,
      lossRateTotalPct: totalCalls > 0 ? (measurableLosses / totalCalls) * 100 : 0,
      meanMeasurableRoi,
      medianMeasurableRoi,
      meanAllRoi,
      medianAllRoi,
      bestRoi: measurableRois.length > 0 ? measurableRois[measurableRois.length - 1] : 0,
      worstRoi: measurableRois.length > 0 ? measurableRois[0] : 0
    });
  }

  channelData.sort((a, b) => b.totalCalls - a.totalCalls);

  console.log("\n--- Top 15 Channels Diagnostic Comparison ---");
  for (const c of channelData.slice(0, 15)) {
    console.log(`
Channel: ${c.channel} (${c.slug})
  Total calls: ${c.totalCalls}
  Measurable calls: ${c.measurableCalls} (${((c.measurableCalls / c.totalCalls) * 100).toFixed(1)}%)
  Unmeasurable calls: ${c.unmeasurableCalls}
  Wins: ${c.wins}, Losses: ${c.measurableLosses}
  Win Rate (measurable): ${c.winRateMeasurablePct.toFixed(2)}% | Win Rate (total calls): ${c.winRateTotalPct.toFixed(2)}%
  Loss Rate (measurable): ${c.lossRateMeasurablePct.toFixed(2)}% | Loss Rate (total calls): ${c.lossRateTotalPct.toFixed(2)}%
  Mean ROI (measurable): ${c.meanMeasurableRoi.toFixed(2)}% | Mean ROI (all calls): ${c.meanAllRoi.toFixed(2)}%
  Median ROI (measurable): ${c.medianMeasurableRoi.toFixed(2)}% | Median ROI (all calls): ${c.medianAllRoi.toFixed(2)}%
  Best ROI: ${c.bestRoi.toFixed(2)}% | Worst ROI: ${c.worstRoi.toFixed(2)}%
    `);
  }
}

run();
