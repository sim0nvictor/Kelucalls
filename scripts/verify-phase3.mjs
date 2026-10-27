import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load env safely without printing secrets
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error("Missing supabase credentials in env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log("=== KELUCALLS PHASE 3 DIAGNOSTIC ===");
  console.log("Timestamp:", new Date().toISOString());

  // 1. Channel count
  const { count: channelCount } = await supabase
    .from("channels")
    .select("*", { count: "exact", head: true });

  const { count: activeChannelCount } = await supabase
    .from("channels")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "paused"]);

  // 2. Token count
  const { count: tokenCount } = await supabase
    .from("tokens")
    .select("*", { count: "exact", head: true });

  // 3. Call count
  const { count: callCount } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true });

  const { count: openCallCount } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");

  const { count: closedCallCount } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true })
    .eq("status", "closed");

  // 4. Call metrics count
  const { count: metricCount } = await supabase
    .from("call_metrics")
    .select("*", { count: "exact", head: true });

  console.log("\nCounts:", {
    channelCount,
    activeChannelCount,
    tokenCount,
    callCount,
    openCallCount,
    closedCallCount,
    metricCount
  });

  // 5. Outlier and Top ROI investigation
  const { data: topRois, error: roiErr } = await supabase
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
      calls (
        id,
        channel_id,
        token_id,
        called_at,
        entry_price_usd,
        status,
        message_text,
        channels (
          id,
          slug,
          title
        ),
        tokens (
          id,
          symbol,
          name,
          chain,
          contract_address
        )
      )
    `)
    .order("current_roi_pct", { ascending: false })
    .limit(10);

  if (roiErr) {
    console.error("Top ROI query error:", roiErr);
  } else {
    console.log("\n--- Top 10 Call Metrics by Current ROI ---");
    for (const m of topRois || []) {
      const c = m.calls;
      console.log(JSON.stringify({
        call_id: m.call_id,
        channel: c?.channels?.title || c?.channels?.slug,
        token: c?.tokens?.symbol,
        contract: c?.tokens?.contract_address,
        called_at: c?.called_at,
        entry_price: c?.entry_price_usd,
        current_price: m.current_price_usd,
        current_roi_pct: m.current_roi_pct,
        peak_roi_pct: m.peak_roi_pct,
        current_multiple: m.current_multiple,
        current_pnl: m.simulated_current_pnl_usd,
        is_win: m.is_win,
        refreshed_at: m.refreshed_at
      }, null, 2));
    }
  }

  // 6. Aggregate PnL comparison (call_metrics vs channel_stats)
  let totalMetricsPnl = 0;
  let totalMetricsInvestment = 0;
  let metricWins = 0;
  let metricLosses = 0;
  let measurableCalls = 0;
  let nullPriceCalls = 0;
  let zeroPriceCalls = 0;
  let extremeCallsGt1000Pct = 0;
  let extremeCallsGt10000Pct = 0;
  let extremeCallsGt100000Pct = 0;
  let maxPnl = -Infinity;
  let maxRoi = -Infinity;

  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  let totalProcessed = 0;

  let allRoiValues = [];

  while (hasMore) {
    const { data: metricsBatch, error: mErr } = await supabase
      .from("call_metrics")
      .select("call_id, current_price_usd, current_roi_pct, simulated_current_pnl_usd, simulated_investment_usd, is_win")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (mErr) {
      console.error("Error reading metrics batch:", mErr);
      break;
    }

    if (!metricsBatch || metricsBatch.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of metricsBatch) {
      totalProcessed++;
      const pnl = Number(row.simulated_current_pnl_usd) || 0;
      const inv = Number(row.simulated_investment_usd) || 0;
      const roi = row.current_roi_pct !== null && row.current_roi_pct !== undefined ? Number(row.current_roi_pct) : null;

      totalMetricsPnl += pnl;
      totalMetricsInvestment += inv;

      if (pnl > maxPnl) maxPnl = pnl;

      if (row.current_price_usd === null) {
        nullPriceCalls++;
      } else if (Number(row.current_price_usd) <= 0) {
        zeroPriceCalls++;
      } else {
        measurableCalls++;
        if (roi !== null) {
          if (roi > maxRoi) maxRoi = roi;
          allRoiValues.push(roi);
          if (roi > 1000) extremeCallsGt1000Pct++;
          if (roi > 10000) extremeCallsGt10000Pct++;
          if (roi > 100000) extremeCallsGt100000Pct++;
        }
      }

      if (row.is_win) {
        metricWins++;
      } else if (row.current_price_usd !== null && Number(row.current_price_usd) > 0) {
        metricLosses++;
      }
    }

    if (metricsBatch.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  allRoiValues.sort((a, b) => a - b);
  const totalMeasurableRoi = allRoiValues.reduce((acc, val) => acc + val, 0);
  const avgMeasurableRoi = allRoiValues.length > 0 ? totalMeasurableRoi / allRoiValues.length : 0;
  const medianMeasurableRoi = allRoiValues.length > 0
    ? (allRoiValues.length % 2 === 1
        ? allRoiValues[Math.floor(allRoiValues.length / 2)]
        : (allRoiValues[allRoiValues.length / 2 - 1] + allRoiValues[allRoiValues.length / 2]) / 2)
    : 0;

  console.log("\n--- Call Metrics Statistics ---");
  console.log({
    totalProcessed,
    measurableCalls,
    nullPriceCalls,
    zeroPriceCalls,
    totalMetricsPnl: totalMetricsPnl.toFixed(2),
    largestIndividualPnl: maxPnl.toFixed(2),
    largestRoi: maxRoi.toFixed(2) + "%",
    totalMetricsInvestment: totalMetricsInvestment.toFixed(2),
    metricWins,
    metricLosses,
    winRateMeasurable: measurableCalls > 0 ? ((metricWins / measurableCalls) * 100).toFixed(2) + "%" : "N/A",
    lossRateMeasurable: measurableCalls > 0 ? ((metricLosses / measurableCalls) * 100).toFixed(2) + "%" : "N/A",
    overallWinRateTotalCalls: totalProcessed > 0 ? ((metricWins / totalProcessed) * 100).toFixed(2) + "%" : "N/A",
    avgMeasurableRoi: avgMeasurableRoi.toFixed(2) + "%",
    medianMeasurableRoi: medianMeasurableRoi.toFixed(2) + "%",
    extremeCallsGt1000Pct,
    extremeCallsGt10000Pct,
    extremeCallsGt100000Pct
  });

  // 7. Channel stats comparison
  const { data: channelStats, error: channelStatsError } = await supabase
    .from("channel_stats")
    .select("channel_id, total_calls, wins, losses, win_rate_pct, average_roi_pct, median_roi_pct, simulated_current_pnl_usd, ranking_score, channels (title, slug, status)")
    .order("total_calls", { ascending: false });

  if (channelStatsError) {
    console.error("Channel stats query error:", channelStatsError);
    return;
  }

  let totalChannelStatsPnl = 0;
  let channelStatsWithMedian = 0;
  let totalChannelsInStats = channelStats ? channelStats.length : 0;
  for (const cs of channelStats || []) {
    totalChannelStatsPnl += Number(cs.simulated_current_pnl_usd) || 0;
    if (cs.median_roi_pct !== null && cs.median_roi_pct !== undefined) {
      channelStatsWithMedian++;
    }
  }

  console.log("\n--- Channel Stats Aggregate PnL ---");
  console.log({
    totalChannelsInStats,
    channelStatsWithMedian,
    totalChannelStatsPnl: totalChannelStatsPnl.toFixed(2),
    differenceWithMetrics: (totalMetricsPnl - totalChannelStatsPnl).toFixed(2)
  });

  console.log("\n--- Top 15 Channels by Call Count (Diagnostic Comparison) ---");
  const topChannels = (channelStats || []).slice(0, 15);
  for (const cs of topChannels) {
    const ch = cs.channels;
    console.log(JSON.stringify({
      channel: ch?.title || ch?.slug,
      status: ch?.status,
      total_calls: cs.total_calls,
      wins: cs.wins,
      losses: cs.losses,
      win_rate_pct: cs.win_rate_pct,
      average_roi_pct: cs.average_roi_pct,
      median_roi_pct: cs.median_roi_pct,
      pnl: cs.simulated_current_pnl_usd,
      ranking_score: cs.ranking_score
    }));
  }
}

run().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
