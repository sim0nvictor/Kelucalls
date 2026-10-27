import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log("=== QUANTITATIVE RANKING METHODOLOGY COMPARISON ===");

  // Fetch all channels with channel_stats
  const { data: channelStats, error } = await supabase
    .from("channel_stats")
    .select(`
      channel_id,
      total_calls,
      wins,
      losses,
      win_rate_pct,
      average_roi_pct,
      median_roi_pct,
      simulated_current_pnl_usd,
      ranking_score,
      channels (
        id,
        title,
        slug,
        is_paid_channel,
        status
      )
    `);

  if (error) {
    console.error("Error fetching stats:", error);
    return;
  }

  // Also we need measurable call statistics and true medians for each channel
  // Let's compute true measurable medians and stats from calls
  const channels = [];

  for (const cs of channelStats || []) {
    const ch = cs.channels;
    if (!ch || ch.is_paid_channel || cs.total_calls === 0) continue;

    const { data: calls } = await supabase
      .from("calls")
      .select("id, entry_price_usd, call_metrics(current_price_usd, current_roi_pct, is_win)")
      .eq("channel_id", cs.channel_id);

    let measurableRois = [];
    let measurableWins = 0;
    for (const c of calls || []) {
      const cm = Array.isArray(c.call_metrics) ? c.call_metrics[0] : c.call_metrics;
      if (Number(c.entry_price_usd) > 0 && Number(cm?.current_price_usd) > 0) {
        if (cm.current_roi_pct !== null && cm.current_roi_pct !== undefined) {
          measurableRois.push(Number(cm.current_roi_pct));
          if (cm.is_win) measurableWins++;
        }
      }
    }

    measurableRois.sort((a, b) => a - b);
    const measurableCount = measurableRois.length;
    const measurableWinRate = measurableCount > 0 ? (measurableWins / measurableCount) * 100 : 0;
    const medianMeasurableRoi = measurableCount > 0
      ? (measurableCount % 2 === 1
          ? measurableRois[Math.floor(measurableCount / 2)]
          : (measurableRois[measurableCount / 2 - 1] + measurableRois[measurableCount / 2]) / 2)
      : 0;

    const meanMeasurableRoi = measurableCount > 0
      ? measurableRois.reduce((a, b) => a + b, 0) / measurableCount
      : 0;

    // Current production formula
    const currentScore = Number(cs.ranking_score);

    // Alternative 1: Median ROI instead of Mean ROI
    // (median * 0.5) + (win_rate * 0.3) + ln(total_calls + 1) * 0.2
    const alt1_medianScore = (medianMeasurableRoi * 0.5) + (Number(cs.win_rate_pct) * 0.3) + (Math.log(cs.total_calls + 1) * 0.2);

    // Alternative 2: Saturated ROI (similar to KeluScore / intent engine)
    // Saturated ROI: map ROI to [0, 100] using 100 / (1 + exp(-roi / 50)) or saturate(roi, 100)
    // saturate(x, halfPoint) = x / (x + halfPoint) for x >= 0
    const saturatedRoi = meanMeasurableRoi > 0 ? (meanMeasurableRoi / (meanMeasurableRoi + 100)) * 100 : 0;
    const alt2_saturatedScore = (saturatedRoi * 0.5) + (Number(cs.win_rate_pct) * 0.3) + (Math.log(cs.total_calls + 1) * 0.2);

    // Alternative 3: Robust composite:
    // (median_measurable_roi * 0.4) + (win_rate_measurable * 0.4) + (ln(measurable_calls + 1) * 2.0)
    const alt3_robustScore = (medianMeasurableRoi * 0.4) + (measurableWinRate * 0.4) + (Math.log(measurableCount + 1) * 2.0);

    channels.push({
      title: ch.title || ch.slug,
      slug: ch.slug,
      totalCalls: cs.total_calls,
      measurableCount,
      winRatePct: Number(cs.win_rate_pct),
      measurableWinRate,
      averageRoiPct: Number(cs.average_roi_pct),
      meanMeasurableRoi,
      medianMeasurableRoi,
      currentScore,
      alt1_medianScore,
      alt2_saturatedScore,
      alt3_robustScore,
      pnl: Number(cs.simulated_current_pnl_usd)
    });
  }

  // Sort channels by each formula and examine top 5
  console.log("\n--- RANKING COMPARISON TABLE ---\n");

  const byCurrent = [...channels].sort((a, b) => b.currentScore - a.currentScore);
  console.log("TOP 5 - Current Production Formula:");
  byCurrent.slice(0, 5).forEach((c, idx) => {
    console.log(`  #${idx + 1}: ${c.title} (Calls: ${c.totalCalls}, AvgROI: ${c.averageRoiPct.toFixed(1)}%, MedianROI: ${c.medianMeasurableRoi.toFixed(1)}%, Win: ${c.winRatePct.toFixed(1)}%) -> Score: ${c.currentScore.toFixed(2)}`);
  });

  const byAlt1 = [...channels].sort((a, b) => b.alt1_medianScore - a.alt1_medianScore);
  console.log("\nTOP 5 - Alternative 1 (Median ROI substituted for Mean ROI):");
  byAlt1.slice(0, 5).forEach((c, idx) => {
    console.log(`  #${idx + 1}: ${c.title} (Calls: ${c.totalCalls}, AvgROI: ${c.averageRoiPct.toFixed(1)}%, MedianROI: ${c.medianMeasurableRoi.toFixed(1)}%, Win: ${c.winRatePct.toFixed(1)}%) -> Score: ${c.alt1_medianScore.toFixed(2)}`);
  });

  const byAlt2 = [...channels].sort((a, b) => b.alt2_saturatedScore - a.alt2_saturatedScore);
  console.log("\nTOP 5 - Alternative 2 (Saturated Mean ROI + Win Rate + log calls):");
  byAlt2.slice(0, 5).forEach((c, idx) => {
    console.log(`  #${idx + 1}: ${c.title} (Calls: ${c.totalCalls}, AvgROI: ${c.averageRoiPct.toFixed(1)}%, Win: ${c.winRatePct.toFixed(1)}%) -> Score: ${c.alt2_saturatedScore.toFixed(2)}`);
  });

  const byAlt3 = [...channels].sort((a, b) => b.alt3_robustScore - a.alt3_robustScore);
  console.log("\nTOP 5 - Alternative 3 (Measurable Win Rate + Measurable Median + Adjusted Call Volume):");
  byAlt3.slice(0, 5).forEach((c, idx) => {
    console.log(`  #${idx + 1}: ${c.title} (Measurable Calls: ${c.measurableCount}, MedianROI: ${c.medianMeasurableRoi.toFixed(1)}%, MeasurableWin: ${c.measurableWinRate.toFixed(1)}%) -> Score: ${c.alt3_robustScore.toFixed(2)}`);
  });

  // Specifically show trendingcrypto and dextools_updates in all rankings
  console.log("\n--- Outlier Channels across rankings ---");
  for (const slug of ["trendingcrypto", "dextools-updates", "spidersjournal", "takanaeth101"]) {
    const ch = channels.find(c => c.slug === slug);
    if (ch) {
      const rCurrent = byCurrent.findIndex(c => c.slug === slug) + 1;
      const rAlt1 = byAlt1.findIndex(c => c.slug === slug) + 1;
      const rAlt2 = byAlt2.findIndex(c => c.slug === slug) + 1;
      const rAlt3 = byAlt3.findIndex(c => c.slug === slug) + 1;
      console.log(`${ch.title}: Current Rank #${rCurrent} (${ch.currentScore.toFixed(1)}) | Alt 1 (Median) Rank #${rAlt1} (${ch.alt1_medianScore.toFixed(1)}) | Alt 2 (Saturated) Rank #${rAlt2} (${ch.alt2_saturatedScore.toFixed(1)}) | Alt 3 (Robust) Rank #${rAlt3} (${ch.alt3_robustScore.toFixed(1)})`);
    }
  }
}

run();
